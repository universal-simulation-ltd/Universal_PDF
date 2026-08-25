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
#include <new>

#include "Common.h"
#include "Pdfium.h"

namespace {

const wchar_t kWindowClass[] = L"UniversalPdfPreviewHost";

// Room for the page inside the pane, and the strip the page counter sits in.
constexpr int kPagePadding = 10;
constexpr int kStatusHeight = 22;

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
    window_ = CreateWindowExW(
        0, kWindowClass, L"", WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN,
        bounds_.left, bounds_.top, bounds_.right - bounds_.left,
        bounds_.bottom - bounds_.top, parent_, nullptr, ModuleHandle(), this);
    if (!window_) return HRESULT_FROM_WIN32(GetLastError());
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
    ReleasePage();
  }

  void ReleasePage() {
    if (page_bitmap_) {
      DeleteObject(page_bitmap_);
      page_bitmap_ = nullptr;
    }
    page_w_ = page_h_ = 0;
  }

  void Reposition() {
    if (!window_) return;
    SetWindowPos(window_, nullptr, bounds_.left, bounds_.top,
                 bounds_.right - bounds_.left, bounds_.bottom - bounds_.top,
                 SWP_NOZORDER | SWP_NOACTIVATE);
    // The page is rendered to fit, so a resize invalidates the bitmap rather
    // than stretching it — a PDF scaled up from a stale render looks like a
    // JPEG artefact, which is exactly what a preview must not look like.
    ReleasePage();
    InvalidateRect(window_, nullptr, TRUE);
  }

  void GoToPage(int index) {
    const int last = doc_.PageCount() - 1;
    index = (std::max)(0, (std::min)(index, last));
    if (index == page_index_) return;
    page_index_ = index;
    ReleasePage();
    InvalidateRect(window_, nullptr, TRUE);
  }

  void EnsurePage(int width, int height) {
    if (page_bitmap_ || width <= 0 || height <= 0) return;
    page_bitmap_ = doc_.RenderPage(page_index_, width, height, &page_w_, &page_h_);
  }

  void Paint(HDC dc, const RECT& client) {
    HBRUSH back = CreateSolidBrush(background_);
    FillRect(dc, &client, back);
    DeleteObject(back);

    const int avail_w = (client.right - client.left) - 2 * kPagePadding;
    const int avail_h =
        (client.bottom - client.top) - 2 * kPagePadding - kStatusHeight;
    EnsurePage(avail_w, avail_h);

    if (page_bitmap_ && page_w_ > 0 && page_h_ > 0) {
      const int x = client.left + (client.right - client.left - page_w_) / 2;
      const int y = client.top + kPagePadding;

      HDC mem = CreateCompatibleDC(dc);
      HGDIOBJ old = SelectObject(mem, page_bitmap_);
      BitBlt(dc, x, y, page_w_, page_h_, mem, 0, 0, SRCCOPY);
      SelectObject(mem, old);
      DeleteDC(mem);

      // The same hairline the thumbnail draws, and for the same reason: white
      // paper on a white pane otherwise has no edge.
      HPEN pen = CreatePen(PS_SOLID, 1, RGB(0x9A, 0x9A, 0x9A));
      HGDIOBJ old_pen = SelectObject(dc, pen);
      HGDIOBJ old_brush = SelectObject(dc, GetStockObject(NULL_BRUSH));
      Rectangle(dc, x - 1, y - 1, x + page_w_ + 1, y + page_h_ + 1);
      SelectObject(dc, old_brush);
      SelectObject(dc, old_pen);
      DeleteObject(pen);
    }

    if (doc_.PageCount() > 1) {
      wchar_t label[64];
      wsprintfW(label, L"Page %d of %d", page_index_ + 1, doc_.PageCount());
      HFONT font = CreateFontIndirectW(&status_font_);
      HGDIOBJ old_font = SelectObject(dc, font);
      SetBkMode(dc, TRANSPARENT);
      // Qualified: the class has a SetTextColor of its own, from
      // IPreviewHandlerVisuals, and it would otherwise win the overload.
      ::SetTextColor(dc, text_);
      RECT strip{client.left, client.bottom - kStatusHeight, client.right,
                 client.bottom};
      DrawTextW(dc, label, -1, &strip,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
      SelectObject(dc, old_font);
      DeleteObject(font);
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
          self->ReleasePage();
          InvalidateRect(hwnd, nullptr, TRUE);
        }
        return 0;
      case WM_MOUSEWHEEL:
        if (self) {
          const int delta = GET_WHEEL_DELTA_WPARAM(wp);
          self->GoToPage(self->page_index_ + (delta > 0 ? -1 : 1));
          return 0;
        }
        break;
      case WM_KEYDOWN:
        if (self) {
          switch (wp) {
            case VK_NEXT:
            case VK_RIGHT:
            case VK_DOWN:
              self->GoToPage(self->page_index_ + 1);
              return 0;
            case VK_PRIOR:
            case VK_LEFT:
            case VK_UP:
              self->GoToPage(self->page_index_ - 1);
              return 0;
            case VK_HOME:
              self->GoToPage(0);
              return 0;
            case VK_END:
              self->GoToPage(self->doc_.PageCount() - 1);
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
  HBITMAP page_bitmap_ = nullptr;
  int page_w_ = 0, page_h_ = 0;
  int page_index_ = 0;
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
