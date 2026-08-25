#include "Badge.h"

#include <wincodec.h>

#include <algorithm>
#include <cmath>

#include "resource.h"

namespace {

struct Pixel {  // BGRA, premultiplied, as CreateDIBSection lays it out
  BYTE b, g, r, a;
};

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

}  // namespace

HRESULT StampBadge(void* bits, UINT width, UINT height) {
  if (!bits || width == 0 || height == 0) return E_INVALIDARG;

  const UINT shorter = (std::min)(width, height);
  if (shorter < kMinSizeForBadge) return S_FALSE;  // deliberately un-badged

  const UINT badge = (std::min)(
      kBadgeMaxPx,
      (std::max)(16u, static_cast<UINT>(std::lround(shorter * kBadgeFraction))));
  const UINT margin =
      static_cast<UINT>(std::lround(shorter * kBadgeMarginFraction));
  if (badge + margin > width || badge + margin > height) return S_FALSE;

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
        const UINT x0 = width - badge - margin;
        const UINT y0 = height - badge - margin;
        for (UINT y = 0; y < badge; ++y) {
          const auto* src = reinterpret_cast<const Pixel*>(pixels + y * stride);
          Pixel* row = dst + (y0 + y) * width + x0;
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

void DrawPageEdge(void* bits, UINT width, UINT height) {
  if (!bits || width < 3 || height < 3) return;

  auto* px = static_cast<Pixel*>(bits);
  constexpr BYTE kEdge = 0x9A;      // neutral grey
  constexpr UINT kStrength = 115;   // out of 255 — a hint, not a frame

  auto blend = [&](Pixel& p) {
    p.b = static_cast<BYTE>((p.b * (255 - kStrength) + kEdge * kStrength) / 255);
    p.g = static_cast<BYTE>((p.g * (255 - kStrength) + kEdge * kStrength) / 255);
    p.r = static_cast<BYTE>((p.r * (255 - kStrength) + kEdge * kStrength) / 255);
    p.a = 255;
  };

  for (UINT x = 0; x < width; ++x) {
    blend(px[x]);
    blend(px[(height - 1) * width + x]);
  }
  for (UINT y = 0; y < height; ++y) {
    blend(px[y * width]);
    blend(px[y * width + (width - 1)]);
  }
}
