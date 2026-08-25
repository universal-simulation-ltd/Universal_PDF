#include "Badge.h"

#include <objidl.h>   // Gdiplus wants IStream declared before it
#include <gdiplus.h>
#include <wincodec.h>

#include <algorithm>
#include <cmath>

#include "resource.h"

namespace {

struct Pixel {  // BGRA, premultiplied, as CreateDIBSection lays it out
  BYTE b, g, r, a;
};

constexpr BYTE kEdgeGrey = 0x9A;
constexpr UINT kEdgeStrength = 115;  // out of 255 — a hint, not a frame

void ModuleAnchor() {}

HMODULE SelfModule() {
  HMODULE self = nullptr;
  GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                         GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                     reinterpret_cast<LPCWSTR>(&ModuleAnchor), &self);
  return self;
}

// The badge art is the same .ico the file association uses, so the thumbnail
// and the plain icon Explorer falls back to are visibly the same product.
bool LoadBadgeResource(const void** data, DWORD* size) {
  HMODULE self = SelfModule();
  if (!self) return false;
  HRSRC res = FindResourceW(self, MAKEINTRESOURCEW(IDR_BADGE_ICO), RT_RCDATA);
  if (!res) return false;
  HGLOBAL loaded = LoadResource(self, res);
  if (!loaded) return false;
  *data = LockResource(loaded);
  *size = SizeofResource(self, res);
  return *data != nullptr && *size > 0;
}

// Picks the smallest frame that is still at least `target` across, so the
// badge is downscaled rather than blown up. ICOs are authored per size and
// the small frames are hinted differently — taking the 256 always would look
// mushy at 32.
HRESULT SelectFrame(IWICBitmapDecoder* decoder, UINT target,
                    IWICBitmapFrameDecode** out) {
  UINT count = 0;
  HRESULT hr = decoder->GetFrameCount(&count);
  if (FAILED(hr) || count == 0) return FAILED(hr) ? hr : E_FAIL;

  UINT best = 0, best_edge = 0;
  for (UINT i = 0; i < count; ++i) {
    IWICBitmapFrameDecode* frame = nullptr;
    if (FAILED(decoder->GetFrame(i, &frame))) continue;
    UINT w = 0, h = 0;
    if (SUCCEEDED(frame->GetSize(&w, &h))) {
      const UINT edge = (std::max)(w, h);
      const bool fits = edge >= target;
      const bool best_fits = best_edge >= target;
      if (best_edge == 0 || (fits && (!best_fits || edge < best_edge)) ||
          (!fits && !best_fits && edge > best_edge)) {
        best = i;
        best_edge = edge;
      }
    }
    frame->Release();
  }
  return decoder->GetFrame(best, out);
}

void BlendEdge(Pixel& p) {
  p.b = static_cast<BYTE>((p.b * (255 - kEdgeStrength) + kEdgeGrey * kEdgeStrength) / 255);
  p.g = static_cast<BYTE>((p.g * (255 - kEdgeStrength) + kEdgeGrey * kEdgeStrength) / 255);
  p.r = static_cast<BYTE>((p.r * (255 - kEdgeStrength) + kEdgeGrey * kEdgeStrength) / 255);
  p.a = 255;
}

bool ClipToBitmap(const RECT& r, UINT width, UINT height, RECT* out) {
  out->left = (std::max)(0L, r.left);
  out->top = (std::max)(0L, r.top);
  out->right = (std::min)(static_cast<LONG>(width), r.right);
  out->bottom = (std::min)(static_cast<LONG>(height), r.bottom);
  return out->right > out->left && out->bottom > out->top;
}

}  // namespace

namespace {

int SheetCount(int pages, UINT cx) {
  if (pages <= 1 || cx < kMinSizeForStack) return 0;
  return pages == 2 ? 1 : 2;
}

// One corner of a sheet after it has turned about the pivot.
void RotatePoint(double x, double y, double px, double py, double radians,
                 double* out_x, double* out_y) {
  const double c = std::cos(radians), s = std::sin(radians);
  const double dx = x - px, dy = y - py;
  *out_x = px + dx * c - dy * s;
  *out_y = py + dx * s + dy * c;
}

// GDI+ is started once and never shut down, for the same reason PDFium is:
// GdiplusShutdown from DllMain would run under the loader lock, and the
// surrogate is short-lived anyway.
INIT_ONCE g_gdiplus_once = INIT_ONCE_STATIC_INIT;
ULONG_PTR g_gdiplus_token = 0;

BOOL CALLBACK StartGdiplus(PINIT_ONCE, PVOID, PVOID*) {
  Gdiplus::GdiplusStartupInput input;
  Gdiplus::GdiplusStartup(&g_gdiplus_token, &input, nullptr);
  return TRUE;
}

}  // namespace

Layout ComputeLayout(double page_w, double page_h, UINT cx, int pages) {
  Layout out;
  out.sheets = SheetCount(pages, cx);

  // Work in page units first, then scale whatever the fan turns out to need
  // down into the box the shell asked for.
  const double w = page_w, h = page_h;
  const double pivot_x = w * 0.5;
  const double pivot_y = h * (1.0 + kFanPivotBelow);

  double min_x = 0.0, min_y = 0.0, max_x = w, max_y = h;
  for (int i = 1; i <= out.sheets; ++i) {
    const double rad = kFanAngleDeg * i * 3.14159265358979323846 / 180.0;
    const double xs[4] = {0, w, w, 0};
    const double ys[4] = {0, 0, h, h};
    for (int c = 0; c < 4; ++c) {
      double rx = 0, ry = 0;
      RotatePoint(xs[c], ys[c], pivot_x, pivot_y, rad, &rx, &ry);
      min_x = (std::min)(min_x, rx);
      min_y = (std::min)(min_y, ry);
      max_x = (std::max)(max_x, rx);
      max_y = (std::max)(max_y, ry);
    }
  }

  const double span_x = max_x - min_x, span_y = max_y - min_y;
  const double scale = (std::min)(cx / span_x, cx / span_y);

  const int page_x = static_cast<int>(std::lround(-min_x * scale));
  const int page_y = static_cast<int>(std::lround(-min_y * scale));
  const int pw = (std::max)(1, static_cast<int>(std::lround(w * scale)));
  const int ph = (std::max)(1, static_cast<int>(std::lround(h * scale)));

  out.width = (std::max)(pw, static_cast<int>(std::lround(span_x * scale)));
  out.height = (std::max)(ph, static_cast<int>(std::lround(span_y * scale)));
  out.page = RECT{page_x, page_y, page_x + pw, page_y + ph};
  out.pivot_x = page_x + pivot_x * scale;
  out.pivot_y = page_y + pivot_y * scale;
  return out;
}

void DrawFan(void* bits, const Layout& layout) {
  if (!bits || layout.sheets <= 0) return;
  InitOnceExecuteOnce(&g_gdiplus_once, StartGdiplus, nullptr, nullptr);
  if (g_gdiplus_token == 0) return;

  // Wrapping the DIB's own pixels: PARGB because that is what the shell wants
  // back, and it is what the badge composite below already assumes.
  Gdiplus::Bitmap surface(layout.width, layout.height, layout.width * 4,
                          PixelFormat32bppPARGB, static_cast<BYTE*>(bits));
  Gdiplus::Graphics g(&surface);
  g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);

  Gdiplus::SolidBrush paper(Gdiplus::Color(255, 255, 255, 255));
  Gdiplus::Pen edge(Gdiplus::Color(120, kEdgeGrey, kEdgeGrey, kEdgeGrey), 1.0f);

  const Gdiplus::RectF sheet(
      static_cast<Gdiplus::REAL>(layout.page.left),
      static_cast<Gdiplus::REAL>(layout.page.top),
      static_cast<Gdiplus::REAL>(layout.page.right - layout.page.left),
      static_cast<Gdiplus::REAL>(layout.page.bottom - layout.page.top));

  // Furthest sheet first, so each one is painted over by the one in front.
  for (int i = layout.sheets; i >= 1; --i) {
    g.ResetTransform();
    g.TranslateTransform(static_cast<Gdiplus::REAL>(layout.pivot_x),
                         static_cast<Gdiplus::REAL>(layout.pivot_y));
    g.RotateTransform(static_cast<Gdiplus::REAL>(kFanAngleDeg * i));
    g.TranslateTransform(static_cast<Gdiplus::REAL>(-layout.pivot_x),
                         static_cast<Gdiplus::REAL>(-layout.pivot_y));
    g.FillRectangle(&paper, sheet);
    g.DrawRectangle(&edge, sheet);
  }
  g.ResetTransform();
}

void DrawPageEdge(void* bits, UINT width, UINT height, const RECT& page) {
  RECT r;
  if (!bits || !ClipToBitmap(page, width, height, &r)) return;
  if (r.right - r.left < 3 || r.bottom - r.top < 3) return;

  auto* px = static_cast<Pixel*>(bits);
  for (LONG x = r.left; x < r.right; ++x) {
    BlendEdge(px[static_cast<size_t>(r.top) * width + x]);
    BlendEdge(px[static_cast<size_t>(r.bottom - 1) * width + x]);
  }
  for (LONG y = r.top; y < r.bottom; ++y) {
    BlendEdge(px[static_cast<size_t>(y) * width + r.left]);
    BlendEdge(px[static_cast<size_t>(y) * width + (r.right - 1)]);
  }
}

HRESULT StampBadge(void* bits, UINT width, UINT height, const RECT& page) {
  if (!bits || width == 0 || height == 0) return E_INVALIDARG;

  const UINT page_w = static_cast<UINT>(page.right - page.left);
  const UINT page_h = static_cast<UINT>(page.bottom - page.top);
  const UINT shorter = (std::min)(page_w, page_h);
  if (shorter < kMinSizeForBadge) return S_FALSE;  // deliberately un-badged

  const UINT badge = (std::min)(
      kBadgeMaxPx,
      (std::max)(16u, static_cast<UINT>(std::lround(shorter * kBadgeFraction))));
  const UINT margin =
      static_cast<UINT>(std::lround(shorter * kBadgeMarginFraction));
  if (badge + margin > page_w || badge + margin > page_h) return S_FALSE;

  const void* res_data = nullptr;
  DWORD res_size = 0;
  if (!LoadBadgeResource(&res_data, &res_size)) return E_FAIL;

  IWICImagingFactory* factory = nullptr;
  HRESULT hr = CoCreateInstance(CLSID_WICImagingFactory, nullptr,
                                CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory));
  if (FAILED(hr)) return hr;

  IWICStream* stream = nullptr;
  IWICBitmapDecoder* decoder = nullptr;
  IWICBitmapFrameDecode* frame = nullptr;
  IWICFormatConverter* converter = nullptr;
  IWICBitmapScaler* scaler = nullptr;
  IWICBitmapSource* source = nullptr;

  hr = factory->CreateStream(&stream);
  if (SUCCEEDED(hr)) {
    hr = stream->InitializeFromMemory(
        const_cast<BYTE*>(static_cast<const BYTE*>(res_data)), res_size);
  }
  if (SUCCEEDED(hr)) {
    hr = factory->CreateDecoderFromStream(stream, nullptr,
                                          WICDecodeMetadataCacheOnLoad, &decoder);
  }
  if (SUCCEEDED(hr)) hr = SelectFrame(decoder, badge, &frame);
  if (SUCCEEDED(hr)) hr = factory->CreateFormatConverter(&converter);
  if (SUCCEEDED(hr)) {
    // Premultiplied, because that is what a 32-bit DIB the shell alpha-blends
    // has to contain — and it makes the composite below a straight lerp.
    hr = converter->Initialize(frame, GUID_WICPixelFormat32bppPBGRA,
                               WICBitmapDitherTypeNone, nullptr, 0.0,
                               WICBitmapPaletteTypeMedianCut);
  }
  if (SUCCEEDED(hr)) {
    UINT fw = 0, fh = 0;
    hr = converter->GetSize(&fw, &fh);
    if (SUCCEEDED(hr) && (fw != badge || fh != badge)) {
      hr = factory->CreateBitmapScaler(&scaler);
      if (SUCCEEDED(hr)) {
        hr = scaler->Initialize(converter, badge, badge,
                                WICBitmapInterpolationModeFant);
      }
      if (SUCCEEDED(hr)) {
        source = scaler;
        source->AddRef();
      }
    } else if (SUCCEEDED(hr)) {
      source = converter;
      source->AddRef();
    }
  }

  if (SUCCEEDED(hr) && source) {
    const UINT stride = badge * 4;
    const UINT bytes = stride * badge;
    auto* pixels = static_cast<BYTE*>(CoTaskMemAlloc(bytes));
    if (!pixels) {
      hr = E_OUTOFMEMORY;
    } else {
      hr = source->CopyPixels(nullptr, stride, bytes, pixels);
      if (SUCCEEDED(hr)) {
        auto* dst = static_cast<Pixel*>(bits);
        const UINT x0 = static_cast<UINT>(page.right) - badge - margin;
        const UINT y0 = static_cast<UINT>(page.bottom) - badge - margin;
        for (UINT y = 0; y < badge; ++y) {
          const auto* src = reinterpret_cast<const Pixel*>(pixels + y * stride);
          Pixel* row = dst + static_cast<size_t>(y0 + y) * width + x0;
          for (UINT x = 0; x < badge; ++x) {
            const UINT inv = 255u - src[x].a;
            row[x].b = static_cast<BYTE>(src[x].b + (row[x].b * inv + 127) / 255);
            row[x].g = static_cast<BYTE>(src[x].g + (row[x].g * inv + 127) / 255);
            row[x].r = static_cast<BYTE>(src[x].r + (row[x].r * inv + 127) / 255);
            row[x].a = 255;
          }
        }
      }
      CoTaskMemFree(pixels);
    }
  }

  if (source) source->Release();
  if (scaler) scaler->Release();
  if (converter) converter->Release();
  if (frame) frame->Release();
  if (decoder) decoder->Release();
  if (stream) stream->Release();
  factory->Release();
  return hr;
}

void DrawPageCount(HBITMAP bitmap, void* bits, UINT width, UINT height,
                   const RECT& page, int pages) {
  if (!bitmap || !bits || pages <= 1) return;

  const UINT page_w = static_cast<UINT>(page.right - page.left);
  const UINT page_h = static_cast<UINT>(page.bottom - page.top);
  // Measured against the page's LONGER side, which is what the shell actually
  // asked for: keyed off the shorter one, a portrait page would drop the pill
  // at a thumbnail size where a landscape page still carried it.
  const UINT longer = (std::max)(page_w, page_h);
  if (longer < kMinSizeForCount) return;

  const int text_px = (std::max)(10, static_cast<int>(std::lround(longer * kCountTextFraction)));
  const int pad_x = (std::max)(3, text_px / 2);
  const int pad_y = (std::max)(2, text_px / 4);
  const int margin = (std::max)(3, static_cast<int>(std::lround(longer * 0.03)));

  wchar_t label[32];
  wsprintfW(label, L"%d pages", pages);

  HDC dc = CreateCompatibleDC(nullptr);
  if (!dc) return;
  HGDIOBJ old_bmp = SelectObject(dc, bitmap);

  HFONT font = CreateFontW(-text_px, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE,
                           DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                           CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                           DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
  HGDIOBJ old_font = SelectObject(dc, font);

  SIZE text{};
  GetTextExtentPoint32W(dc, label, lstrlenW(label), &text);
  // "52 pages" spelled out where it fits, the bare number where it does not —
  // better a readable count than a truncated word.
  if (text.cx + 2 * pad_x > static_cast<LONG>(page_w * 0.62)) {
    wsprintfW(label, L"%d", pages);
    GetTextExtentPoint32W(dc, label, lstrlenW(label), &text);
  }

  RECT pill{page.left + margin, page.bottom - margin - (text.cy + 2 * pad_y),
            page.left + margin + text.cx + 2 * pad_x, page.bottom - margin};

  RECT clipped;
  if (ClipToBitmap(pill, width, height, &clipped)) {
    const int radius = (clipped.bottom - clipped.top);
    HBRUSH brush = CreateSolidBrush(kInk);
    // A white ring, because the pill lands wherever the page happens to be:
    // navy on a dark page is invisible without one.
    HPEN ring = CreatePen(PS_SOLID, (std::max)(1, text_px / 7), RGB(255, 255, 255));
    HGDIOBJ old_brush = SelectObject(dc, brush);
    HGDIOBJ old_pen = SelectObject(dc, ring);
    RoundRect(dc, pill.left, pill.top, pill.right + 1, pill.bottom + 1, radius,
              radius);
    SelectObject(dc, old_pen);
    SelectObject(dc, old_brush);
    DeleteObject(brush);
    DeleteObject(ring);

    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, RGB(255, 255, 255));
    RECT text_rect{pill.left + pad_x, pill.top + pad_y, pill.right - pad_x,
                   pill.bottom - pad_y};
    DrawTextW(dc, label, -1, &text_rect, DT_LEFT | DT_TOP | DT_SINGLELINE |
                                             DT_NOPREFIX);
    GdiFlush();

    // ⚠️ GDI writes nothing to the alpha channel of a 32-bit DIB, so every
    // pixel it touched is now transparent. The pill sits inside the page, which
    // is opaque everywhere, so restoring alpha across its rectangle is both
    // safe and sufficient.
    auto* px = static_cast<Pixel*>(bits);
    for (LONG y = clipped.top; y < clipped.bottom; ++y) {
      Pixel* row = px + static_cast<size_t>(y) * width;
      for (LONG x = clipped.left; x < clipped.right; ++x) row[x].a = 255;
    }
  }

  SelectObject(dc, old_font);
  DeleteObject(font);
  SelectObject(dc, old_bmp);
  DeleteDC(dc);
}
