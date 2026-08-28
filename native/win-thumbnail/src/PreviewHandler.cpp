// IPreviewHandler — the PDF in Explorer's preview pane (Alt+P).
//
// This is the Windows answer to macOS Quick Look, and it is NOT the thumbnail
// provider with a bigger bitmap: the shell hands a preview handler a parent
// window and expects a live child window back, so this owns an HWND, a window
// class, a message loop's worth of handlers, and the keyboard.
//
// ⚠️ It is hosted in prevhost.exe, not in Explorer and not in the thumbnail
// surrogate, and it only gets there if the CLSID carries the AppID of the
// preview host — see Registration.cpp. Without that value the object is
// created in-process and the pane stays empty with no error anywhere.

#include <shlwapi.h>
#include <windowsx.h>

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <new>
#include <vector>

#include "Common.h"
#include "Pdfium.h"

namespace {

const wchar_t kWindowClass[] = L"UniversalPdfPreviewHost";

// Room for the page inside the pane, the air between two stacked pages, and
// the strip the page counter sits in.
constexpr int kPagePadding = 10;
constexpr int kPageGap = 10;
constexpr int kStatusHeight = 22;

// One "line" of scrolling, for an arrow key and for each notch the system's
// wheel setting is worth.
constexpr int kLineScroll = 24;

// One page's place in the stack, in device pixels. `w` is always the content
// width — pages are fitted to the pane's WIDTH, which is the entire point of
// the stack: fitting a landscape slide to a tall pane's HEIGHT left two
// thirds of the pane empty.
struct PageBox {
  int y = 0;
  int w = 0;
  int h = 0;
};

// One page's bitmap, kept only while the page is on screen.
struct RenderedPage {
  int index = -1;
  HBITMAP bitmap = nullptr;
  int w = 0;
  int h = 0;
};

class PreviewHandler final : public IPreviewHandler,
                             public IInitializeWithStream,
                             public IPreviewHandlerVisuals,
                             public IOleWindow,
                             public IObjectWithSite {
 public:
  PreviewHandler() { InterlockedIncrement(&g_cDllRef); }

  // --- IUnknown -----------------------------------------------------------
  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_IPreviewHandler)) {
      *ppv = static_cast<IPreviewHandler*>(this);
    } else if (IsEqualIID(riid, IID_IInitializeWithStream_)) {
      *ppv = static_cast<IInitializeWithStream*>(this);
    } else if (IsEqualIID(riid, IID_IPreviewHandlerVisuals)) {
      *ppv = static_cast<IPreviewHandlerVisuals*>(this);
    } else if (IsEqualIID(riid, IID_IOleWindow)) {
      *ppv = static_cast<IOleWindow*>(this);
    } else if (IsEqualIID(riid, IID_IObjectWithSite)) {
      *ppv = static_cast<IObjectWithSite*>(this);
    } else {
      *ppv = nullptr;
      return E_NOINTERFACE;
    }
    AddRef();
    return S_OK;
  }

  IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&ref_); }

  IFACEMETHODIMP_(ULONG) Release() override {
    const LONG n = InterlockedDecrement(&ref_);
    if (n == 0) delete this;
    return n;
  }

  // --- IInitializeWithStream ----------------------------------------------
  IFACEMETHODIMP Initialize(IStream* stream, DWORD) override {
    if (stream_) return HRESULT_FROM_WIN32(ERROR_ALREADY_INITIALIZED);
    if (!stream) return E_INVALIDARG;
    return stream->QueryInterface(IID_IStream, reinterpret_cast<void**>(&stream_));
  }

  // --- IPreviewHandler ----------------------------------------------------
  IFACEMETHODIMP SetWindow(HWND parent, const RECT* rect) override {
    parent_ = parent;
    if (rect) bounds_ = *rect;
    if (window_) {
      SetParent(window_, parent_);
      Reposition();
    }
    return S_OK;
  }

  IFACEMETHODIMP SetRect(const RECT* rect) override {
    if (!rect) return E_INVALIDARG;
    bounds_ = *rect;
    Reposition();
    return S_OK;
  }

  IFACEMETHODIMP DoPreview() override {
    if (window_ || !parent_ || !stream_) return E_UNEXPECTED;
    if (FAILED(doc_.Open(stream_))) return E_FAIL;

    EnsureWindowClass();
    // WS_VSCROLL because the pane scrolls now. The bar is kept visible even
    // for a document that fits (SIF_DISABLENOSCROLL in UpdateScrollBar), so
    // the client width never changes underneath a layout measured for it.
    window_ = CreateWindowExW(
        0, kWindowClass, L"", WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_VSCROLL,
        bounds_.left, bounds_.top, bounds_.right - bounds_.left,
        bounds_.bottom - bounds_.top, parent_, nullptr, ModuleHandle(), this);
    if (!window_) return HRESULT_FROM_WIN32(GetLastError());
    Relayout();
    return S_OK;
  }

  IFACEMETHODIMP Unload() override {
    // The shell reuses one handler object for file after file, so this has to
    // put the object back to its just-created state — not merely hide it.
    Discard();
    doc_.Close();
    if (stream_) {
      stream_->Release();
      stream_ = nullptr;
    }
    return S_OK;
  }

  IFACEMETHODIMP SetFocus() override {
    if (!window_) return S_FALSE;
    ::SetFocus(window_);
    return S_OK;
  }

  IFACEMETHODIMP QueryFocus(HWND* result) override {
    if (!result) return E_POINTER;
    *result = ::GetFocus();
    return *result ? S_OK : HRESULT_FROM_WIN32(GetLastError());
  }

  IFACEMETHODIMP TranslateAccelerator(MSG* msg) override {
    // Anything not handled here has to go back to the host, or the pane
    // swallows Tab and the user is trapped inside the preview.
    if (!site_) return S_FALSE;
    IPreviewHandlerFrame* frame = nullptr;
    HRESULT hr = site_->QueryInterface(IID_IPreviewHandlerFrame,
                                       reinterpret_cast<void**>(&frame));
    if (FAILED(hr)) return S_FALSE;
    hr = frame->TranslateAccelerator(msg);
    frame->Release();
    return hr;
  }

  // --- IPreviewHandlerVisuals ---------------------------------------------
  IFACEMETHODIMP SetBackgroundColor(COLORREF colour) override {
    background_ = colour;
    if (window_) InvalidateRect(window_, nullptr, TRUE);
    return S_OK;
  }

  IFACEMETHODIMP SetFont(const LOGFONTW* font) override {
    if (font) status_font_ = *font;
    if (window_) InvalidateRect(window_, nullptr, TRUE);
    return S_OK;
  }

  IFACEMETHODIMP SetTextColor(COLORREF colour) override {
    text_ = colour;
    if (window_) InvalidateRect(window_, nullptr, TRUE);
    return S_OK;
  }

  // --- IOleWindow ---------------------------------------------------------
  IFACEMETHODIMP GetWindow(HWND* result) override {
    if (!result) return E_POINTER;
    *result = window_;
    return window_ ? S_OK : E_FAIL;
  }

  IFACEMETHODIMP ContextSensitiveHelp(BOOL) override { return E_NOTIMPL; }

  // --- IObjectWithSite ----------------------------------------------------
  IFACEMETHODIMP SetSite(IUnknown* site) override {
    if (site_) site_->Release();
    site_ = site;
    if (site_) site_->AddRef();
    return S_OK;
  }

  IFACEMETHODIMP GetSite(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    *ppv = nullptr;
    return site_ ? site_->QueryInterface(riid, ppv) : E_FAIL;
  }

 private:
  ~PreviewHandler() {
    Discard();
    if (stream_) stream_->Release();
    if (site_) site_->Release();
    InterlockedDecrement(&g_cDllRef);
  }

  static HINSTANCE ModuleHandle() {
    HMODULE self = nullptr;
    GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                           GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                       reinterpret_cast<LPCWSTR>(&ModuleHandle), &self);
    return reinterpret_cast<HINSTANCE>(self);
  }

  static void EnsureWindowClass() {
    static INIT_ONCE once = INIT_ONCE_STATIC_INIT;
    InitOnceExecuteOnce(
        &once,
        [](PINIT_ONCE, PVOID, PVOID*) -> BOOL {
          WNDCLASSEXW wc{};
          wc.cbSize = sizeof(wc);
          wc.lpfnWndProc = PreviewHandler::WndProc;
          wc.hInstance = ModuleHandle();
          wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
          wc.lpszClassName = kWindowClass;
          RegisterClassExW(&wc);
          return TRUE;
        },
        nullptr, nullptr);
  }

  void Discard() {
    if (window_) {
      DestroyWindow(window_);
      window_ = nullptr;
    }
    DropRenders();
    layout_.clear();
    layout_width_ = 0;
    content_height_ = 0;
    scroll_ = 0;
    wheel_ = 0;
  }

  void DropRenders() {
    for (RenderedPage& page : cache_) {
      if (page.bitmap) DeleteObject(page.bitmap);
    }
    cache_.clear();
  }

  void Reposition() {
    if (!window_) return;
    SetWindowPos(window_, nullptr, bounds_.left, bounds_.top,
                 bounds_.right - bounds_.left, bounds_.bottom - bounds_.top,
                 SWP_NOZORDER | SWP_NOACTIVATE);
    Relayout();
  }

  // --- the stack ------------------------------------------------------------

  int StatusHeight() const { return doc_.PageCount() > 1 ? kStatusHeight : 0; }

  // The scrolling area: the client rect less the page-counter strip.
  int ViewportHeight(const RECT& client) const {
    // Cast because RECT is LONG: std::max deduces one type from both arguments
    // and will not take an int alongside a long.
    return (std::max)(0, static_cast<int>(client.bottom - client.top) -
                             StatusHeight());
  }

  int ContentWidth(const RECT& client) const {
    return (std::max)(
        1, static_cast<int>(client.right - client.left) - 2 * kPagePadding);
  }

  int MaxScroll(const RECT& client) const {
    return (std::max)(0, content_height_ - ViewportHeight(client));
  }

  // Every page's height at this width, measured up front.
  //
  // Cheap because PageSize() reads the page dictionary without parsing the
  // page — see the note on GetPageSizeByIndexF in Pdfium.h — so a 500-page
  // document lays out without the stall that measuring by FPDF_LoadPage would
  // cost. Nothing is RENDERED here; that happens per visible page, in Paint.
  void BuildLayout(int content_w) {
    if (layout_width_ == content_w && !layout_.empty()) return;
    layout_.clear();
    DropRenders();  // every cached bitmap was rendered for the old width
    layout_width_ = content_w;

    const int pages = doc_.PageCount();
    if (pages > 0) layout_.reserve(static_cast<size_t>(pages));
    int y = kPagePadding;
    for (int i = 0; i < pages; ++i) {
      double pw = 0.0, ph = 0.0;
      // A page that will not measure still gets a box: US Letter keeps the
      // stack laid out and the page numbers honest, and the sheet draws blank
      // rather than leaving a hole the rest of the document scrolls past.
      if (!doc_.PageSize(i, &pw, &ph) || !(pw > 0.0) || !(ph > 0.0)) {
        pw = 612.0;
        ph = 792.0;
      }
      const int h =
          (std::max)(1, static_cast<int>(std::lround(ph * (content_w / pw))));
      layout_.push_back(PageBox{y, content_w, h});
      y += h + kPageGap;
    }
    content_height_ = layout_.empty() ? 0 : y - kPageGap + kPagePadding;
  }

  // Re-measure for the current width, keeping the reader on the page they
  // were looking at — the least surprising anchor when the pane is dragged
  // wider and every page changes height at once.
  void Relayout() {
    if (!window_) return;
    RECT client{};
    GetClientRect(window_, &client);
    const int content_w = ContentWidth(client);
    if (content_w != layout_width_) {
      const int anchor = TopPage();
      BuildLayout(content_w);
      if (!layout_.empty()) {
        const size_t i = (std::min)(static_cast<size_t>((std::max)(0, anchor)),
                                    layout_.size() - 1);
        scroll_ = layout_[i].y - kPagePadding;
      }
    }
    scroll_ = (std::max)(0, (std::min)(scroll_, MaxScroll(client)));
    UpdateScrollBar(client);
    InvalidateRect(window_, nullptr, TRUE);
  }

  // The first page with any of itself on screen — what "Page 3 of 40" means
  // once three pages can be visible at once.
  int TopPage() const {
    for (size_t i = 0; i < layout_.size(); ++i) {
      if (layout_[i].y + layout_[i].h > scroll_) return static_cast<int>(i);
    }
    return layout_.empty() ? 0 : static_cast<int>(layout_.size()) - 1;
  }

  void UpdateScrollBar(const RECT& client) {
    SCROLLINFO si{};
    si.cbSize = sizeof(si);
    si.fMask = SIF_RANGE | SIF_PAGE | SIF_POS | SIF_DISABLENOSCROLL;
    si.nMin = 0;
    si.nMax = (std::max)(0, content_height_ - 1);
    si.nPage = static_cast<UINT>((std::max)(1, ViewportHeight(client)));
    si.nPos = scroll_;
    SetScrollInfo(window_, SB_VERT, &si, TRUE);
  }

  void ScrollTo(int position) {
    if (!window_) return;
    RECT client{};
    GetClientRect(window_, &client);
    const int clamped = (std::max)(0, (std::min)(position, MaxScroll(client)));
    if (clamped == scroll_) return;
    scroll_ = clamped;
    UpdateScrollBar(client);
    // FALSE: the whole pane is repainted from the buffer anyway, and erasing
    // first would flicker the background through on every wheel notch.
    InvalidateRect(window_, nullptr, FALSE);
  }

  void ScrollBy(int delta) { ScrollTo(scroll_ + delta); }

  void ScrollToEnd() {
    if (!window_) return;
    RECT client{};
    GetClientRect(window_, &client);
    ScrollTo(MaxScroll(client));
  }

  // PageUp/PageDown still JUMP, page to page — a deck is read a slide at a
  // time even now that the pane scrolls continuously between them.
  void JumpPage(int step) {
    if (layout_.empty()) return;
    const int target = TopPage() + step;
    if (target < 0) return ScrollTo(0);
    if (target >= static_cast<int>(layout_.size())) return ScrollToEnd();
    ScrollTo(layout_[static_cast<size_t>(target)].y - kPagePadding);
  }

  // Accumulated rather than acted on per message: a precision touchpad sends
  // deltas far smaller than WHEEL_DELTA, and rounding each one to zero would
  // make the pane ignore the gesture entirely.
  void Wheel(int delta) {
    if (!window_) return;
    RECT client{};
    GetClientRect(window_, &client);
    UINT lines = 3;
    SystemParametersInfoW(SPI_GETWHEELSCROLLLINES, 0, &lines, 0);
    const int step = lines == WHEEL_PAGESCROLL
                         ? (std::max)(1, ViewportHeight(client) - kPageGap)
                         : static_cast<int>(lines) * kLineScroll;
    wheel_ += delta;
    const int notches = wheel_ / WHEEL_DELTA;
    if (notches == 0) return;
    wheel_ -= notches * WHEEL_DELTA;
    ScrollBy(-notches * step);
  }

  void OnScrollBar(int code) {
    if (!window_) return;
    RECT client{};
    GetClientRect(window_, &client);
    const int page = (std::max)(1, ViewportHeight(client) - kPageGap);
    switch (code) {
      case SB_LINEUP:
        ScrollBy(-kLineScroll);
        break;
      case SB_LINEDOWN:
        ScrollBy(kLineScroll);
        break;
      case SB_PAGEUP:
        ScrollBy(-page);
        break;
      case SB_PAGEDOWN:
        ScrollBy(page);
        break;
      case SB_TOP:
        ScrollTo(0);
        break;
      case SB_BOTTOM:
        ScrollToEnd();
        break;
      case SB_THUMBTRACK:
      case SB_THUMBPOSITION: {
        // Read back rather than taken from HIWORD(wParam), which is 16-bit and
        // silently truncates once a document is taller than 32767 pixels.
        SCROLLINFO si{};
        si.cbSize = sizeof(si);
        si.fMask = SIF_TRACKPOS;
        if (GetScrollInfo(window_, SB_VERT, &si)) ScrollTo(si.nTrackPos);
        break;
      }
      default:
        break;
    }
  }

  // The bitmap for one page, rendered on demand. Only the visible pages are
  // kept — a 500-page document must never mean 500 bitmaps.
  RenderedPage EnsureRendered(int index) {
    for (const RenderedPage& page : cache_) {
      if (page.index == index) return page;
    }
    const PageBox& box = layout_[static_cast<size_t>(index)];
    RenderedPage page;
    page.index = index;
    page.bitmap = doc_.RenderPage(index, box.w, box.h, &page.w, &page.h);
    cache_.push_back(page);
    return page;
  }

  void TrimRenders(int first, int last) {
    for (size_t i = cache_.size(); i-- > 0;) {
      if (cache_[i].index >= first && cache_[i].index <= last) continue;
      if (cache_[i].bitmap) DeleteObject(cache_[i].bitmap);
      cache_.erase(cache_.begin() + static_cast<std::ptrdiff_t>(i));
    }
  }

  void DrawPage(HDC dc, int index, int x, int y) {
    const RenderedPage page = EnsureRendered(index);
    const PageBox& box = layout_[static_cast<size_t>(index)];
    const int w = page.bitmap ? page.w : box.w;
    const int h = page.bitmap ? page.h : box.h;
    const int left = x + (box.w - w) / 2;

    if (page.bitmap) {
      HDC mem = CreateCompatibleDC(dc);
      HGDIOBJ old = SelectObject(mem, page.bitmap);
      BitBlt(dc, left, y, w, h, mem, 0, 0, SRCCOPY);
      SelectObject(mem, old);
      DeleteDC(mem);
    } else {
      RECT blank{left, y, left + w, y + h};
      FillRect(dc, &blank, static_cast<HBRUSH>(GetStockObject(WHITE_BRUSH)));
    }

    // The same hairline the thumbnail draws, and for the same reason: white
    // paper on a white pane otherwise has no edge — and in a stack it is also
    // what separates one page from the next.
    HPEN pen = CreatePen(PS_SOLID, 1, RGB(0x9A, 0x9A, 0x9A));
    HGDIOBJ old_pen = SelectObject(dc, pen);
    HGDIOBJ old_brush = SelectObject(dc, GetStockObject(NULL_BRUSH));
    Rectangle(dc, left - 1, y - 1, left + w + 1, y + h + 1);
    SelectObject(dc, old_brush);
    SelectObject(dc, old_pen);
    DeleteObject(pen);
  }

  void Paint(HDC target, const RECT& client) {
    const int width = client.right - client.left;
    const int height = client.bottom - client.top;
    if (width <= 0 || height <= 0) return;

    // Double-buffered. Scrolling repaints the whole pane, and filling the
    // background and then blitting pages straight to the screen tears visibly
    // on every wheel notch.
    HDC dc = CreateCompatibleDC(target);
    HBITMAP buffer = dc ? CreateCompatibleBitmap(target, width, height) : nullptr;
    HGDIOBJ old_buffer = nullptr;
    const bool buffered = dc && buffer;
    if (buffered) {
      old_buffer = SelectObject(dc, buffer);
    } else {
      if (buffer) DeleteObject(buffer);
      if (dc) DeleteDC(dc);
      dc = target;  // out of memory: draw straight to the screen and flicker
    }

    RECT area{0, 0, width, height};
    HBRUSH back = CreateSolidBrush(background_);
    FillRect(dc, &area, back);
    DeleteObject(back);

    BuildLayout(ContentWidth(client));
    const int viewport = ViewportHeight(client);
    // A shorter pane can leave the old offset past the end of the document.
    scroll_ = (std::max)(0, (std::min)(scroll_, MaxScroll(client)));

    // Clipped to the viewport so the page that runs off the bottom stops at
    // the counter strip instead of drawing through it.
    const int saved = SaveDC(dc);
    IntersectClipRect(dc, 0, 0, width, viewport);
    int first = -1, last = -1;
    for (size_t i = 0; i < layout_.size(); ++i) {
      const PageBox& box = layout_[i];
      const int top = box.y - scroll_;
      if (top >= viewport) break;         // this page and every one below it
      if (top + box.h <= 0) continue;     // scrolled off the top
      if (first < 0) first = static_cast<int>(i);
      last = static_cast<int>(i);
      DrawPage(dc, static_cast<int>(i), kPagePadding, top);
    }
    RestoreDC(dc, saved);
    if (first >= 0) TrimRenders(first, last);

    if (doc_.PageCount() > 1) {
      wchar_t label[64];
      wsprintfW(label, L"Page %d of %d", TopPage() + 1, doc_.PageCount());
      HFONT font = CreateFontIndirectW(&status_font_);
      HGDIOBJ old_font = SelectObject(dc, font);
      SetBkMode(dc, TRANSPARENT);
      // Qualified: the class has a SetTextColor of its own, from
      // IPreviewHandlerVisuals, and it would otherwise win the overload.
      ::SetTextColor(dc, text_);
      RECT strip{0, height - kStatusHeight, width, height};
      DrawTextW(dc, label, -1, &strip,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
      SelectObject(dc, old_font);
      DeleteObject(font);
    }

    if (buffered) {
      BitBlt(target, 0, 0, width, height, dc, 0, 0, SRCCOPY);
      SelectObject(dc, old_buffer);
      DeleteObject(buffer);
      DeleteDC(dc);
    }
  }

  static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    auto* self = reinterpret_cast<PreviewHandler*>(
        GetWindowLongPtrW(hwnd, GWLP_USERDATA));

    switch (msg) {
      case WM_NCCREATE: {
        auto* create = reinterpret_cast<CREATESTRUCTW*>(lp);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA,
                          reinterpret_cast<LONG_PTR>(create->lpCreateParams));
        break;
      }
      case WM_PAINT: {
        if (self) {
          PAINTSTRUCT ps{};
          HDC dc = BeginPaint(hwnd, &ps);
          RECT client{};
          GetClientRect(hwnd, &client);
          self->Paint(dc, client);
          EndPaint(hwnd, &ps);
          return 0;
        }
        break;
      }
      case WM_ERASEBKGND:
        return 1;  // painted in WM_PAINT, so erasing first only flickers
      case WM_SIZE:
        if (self) {
          self->Relayout();
          return 0;
        }
        break;
      case WM_VSCROLL:
        if (self) {
          self->OnScrollBar(LOWORD(wp));
          return 0;
        }
        break;
      case WM_MOUSEWHEEL:
        if (self) {
          self->Wheel(GET_WHEEL_DELTA_WPARAM(wp));
          return 0;
        }
        break;
      case WM_KEYDOWN:
        if (self) {
          switch (wp) {
            // Page keys jump a whole page; the arrows nudge the stack.
            case VK_NEXT:
            case VK_RIGHT:
              self->JumpPage(1);
              return 0;
            case VK_PRIOR:
            case VK_LEFT:
              self->JumpPage(-1);
              return 0;
            case VK_DOWN:
              self->ScrollBy(kLineScroll);
              return 0;
            case VK_UP:
              self->ScrollBy(-kLineScroll);
              return 0;
            case VK_HOME:
              self->ScrollTo(0);
              return 0;
            case VK_END:
              self->ScrollToEnd();
              return 0;
            default:
              break;
          }
        }
        break;
      case WM_LBUTTONDOWN:
        ::SetFocus(hwnd);  // or the arrow keys go to the file list instead
        return 0;
      default:
        break;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
  }

  LONG ref_ = 1;
  IStream* stream_ = nullptr;
  IUnknown* site_ = nullptr;
  HWND parent_ = nullptr;
  HWND window_ = nullptr;
  RECT bounds_{};
  PdfDocument doc_;
  std::vector<PageBox> layout_;      // one box per page, at layout_width_
  std::vector<RenderedPage> cache_;  // the visible pages' bitmaps, and no more
  int layout_width_ = 0;
  int content_height_ = 0;
  int scroll_ = 0;
  int wheel_ = 0;  // leftover wheel delta, for touchpads that send fractions
  COLORREF background_ = GetSysColor(COLOR_WINDOW);
  COLORREF text_ = GetSysColor(COLOR_WINDOWTEXT);
  LOGFONTW status_font_ = DefaultStatusFont();

  static LOGFONTW DefaultStatusFont() {
    LOGFONTW font{};
    NONCLIENTMETRICSW metrics{};
    metrics.cbSize = sizeof(metrics);
    if (SystemParametersInfoW(SPI_GETNONCLIENTMETRICS, sizeof(metrics),
                              &metrics, 0)) {
      font = metrics.lfMessageFont;
    }
    return font;
  }
};

}  // namespace

HRESULT CreatePreviewHandler(REFIID riid, void** ppv) {
  auto* handler = new (std::nothrow) PreviewHandler();
  if (!handler) return E_OUTOFMEMORY;
  const HRESULT hr = handler->QueryInterface(riid, ppv);
  handler->Release();
  return hr;
}
