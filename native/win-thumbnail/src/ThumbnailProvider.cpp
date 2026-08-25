// IInitializeWithStream + IThumbnailProvider.
//
// The shell opens the file itself and hands us a stream — which is why this
// implements IInitializeWithStream rather than IInitializeWithFile: a provider
// that never touches the path can be hosted in the isolated surrogate, and
// gets the file even when it lives somewhere we could not open ourselves.

#include <new>

#include "Badge.h"
#include "Common.h"
#include "Pdfium.h"

namespace {

// final: the object is only ever deleted through its own type in Release(),
// and saying so keeps the destructor non-virtual — a COM class must not grow
// vtable slots the shell is not expecting.
class ThumbnailProvider final : public IInitializeWithStream,
                                public IThumbnailProvider {
 public:
  ThumbnailProvider() { InterlockedIncrement(&g_cDllRef); }

  // IUnknown
  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (IsEqualIID(riid, IID_IUnknown) ||
        IsEqualIID(riid, IID_IInitializeWithStream_)) {
      *ppv = static_cast<IInitializeWithStream*>(this);
    } else if (IsEqualIID(riid, IID_IThumbnailProvider_)) {
      *ppv = static_cast<IThumbnailProvider*>(this);
    } else {
      *ppv = nullptr;
      return E_NOINTERFACE;
    }
    AddRef();
    return S_OK;
  }

  IFACEMETHODIMP_(ULONG) AddRef() override {
    return InterlockedIncrement(&ref_);
  }

  IFACEMETHODIMP_(ULONG) Release() override {
    const LONG n = InterlockedDecrement(&ref_);
    if (n == 0) delete this;
    return n;
  }

  // IInitializeWithStream
  IFACEMETHODIMP Initialize(IStream* stream, DWORD) override {
    if (stream_) return HRESULT_FROM_WIN32(ERROR_ALREADY_INITIALIZED);
    if (!stream) return E_INVALIDARG;
    return stream->QueryInterface(IID_IStream, reinterpret_cast<void**>(&stream_));
  }

  // IThumbnailProvider
  IFACEMETHODIMP GetThumbnail(UINT cx, HBITMAP* phbmp,
                              WTS_ALPHATYPE* pdwAlpha) override {
    if (!phbmp || !pdwAlpha) return E_POINTER;
    *phbmp = nullptr;
    *pdwAlpha = WTSAT_ARGB;
    if (!stream_) return E_UNEXPECTED;

    HBITMAP bitmap = nullptr;
    UINT width = 0, height = 0;
    void* bits = nullptr;
    HRESULT hr = RenderFirstPage(stream_, cx, &bitmap, &width, &height, &bits);
    if (FAILED(hr)) return hr;

    DrawPageEdge(bits, width, height);
    // A badge we could not draw is not worth losing the page over.
    StampBadge(bits, width, height);

    *phbmp = bitmap;
    return S_OK;
  }

 private:
  ~ThumbnailProvider() {
    if (stream_) stream_->Release();
    InterlockedDecrement(&g_cDllRef);
  }

  LONG ref_ = 1;
  IStream* stream_ = nullptr;
};

}  // namespace

HRESULT CreateThumbnailProvider(REFIID riid, void** ppv) {
  auto* provider = new (std::nothrow) ThumbnailProvider();
  if (!provider) return E_OUTOFMEMORY;
  const HRESULT hr = provider->QueryInterface(riid, ppv);
  provider->Release();
  return hr;
}
