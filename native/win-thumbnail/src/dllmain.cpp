// COM plumbing: the class factory and the four exports the shell looks for.

#include <new>

#include "Common.h"
#include "Registration.h"

// {9D3AE6B2-939A-47A9-A7F8-D30A6FC4C10F}
const CLSID CLSID_UniversalPdfThumbProvider = {
    0x9d3ae6b2, 0x939a, 0x47a9, {0xa7, 0xf8, 0xd3, 0x0a, 0x6f, 0xc4, 0xc1, 0x0f}};
// {7A337FC1-F731-4F4F-A3FB-3E1935248DED}
const CLSID CLSID_UniversalPdfPreviewHandler = {
    0x7a337fc1, 0xf731, 0x4f4f, {0xa3, 0xfb, 0x3e, 0x19, 0x35, 0x24, 0x8d, 0xed}};
const IID IID_IThumbnailProvider_ = {
    0xe357fccd, 0xa995, 0x4576, {0xb0, 0x1f, 0x23, 0x46, 0x30, 0x15, 0x4e, 0x96}};
const IID IID_IInitializeWithStream_ = {
    0xb824b49d, 0x22ac, 0x4161, {0xac, 0x8a, 0x99, 0x16, 0xe8, 0xfa, 0x3f, 0x7f}};

LONG g_cDllRef = 0;

namespace {

// One factory serving both objects, told at construction which to make: the
// alternative is two near-identical classes differing by one line.
using Creator = HRESULT (*)(REFIID, void**);

class ClassFactory final : public IClassFactory {
 public:
  explicit ClassFactory(Creator create) : create_(create) {
    InterlockedIncrement(&g_cDllRef);
  }

  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_IClassFactory)) {
      *ppv = static_cast<IClassFactory*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }

  IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&ref_); }

  IFACEMETHODIMP_(ULONG) Release() override {
    const LONG n = InterlockedDecrement(&ref_);
    if (n == 0) delete this;
    return n;
  }

  IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID riid, void** ppv) override {
    if (outer) return CLASS_E_NOAGGREGATION;
    return create_(riid, ppv);
  }

  IFACEMETHODIMP LockServer(BOOL lock) override {
    if (lock) {
      InterlockedIncrement(&g_cDllRef);
    } else {
      InterlockedDecrement(&g_cDllRef);
    }
    return S_OK;
  }

 private:
  ~ClassFactory() { InterlockedDecrement(&g_cDllRef); }
  Creator create_ = nullptr;
  LONG ref_ = 1;
};

}  // namespace

extern "C" BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) {
    DisableThreadLibraryCalls(instance);
  }
  return TRUE;
}

// ⚠️ Defined as STDAPI — exactly the linkage combaseapi.h/olectl.h already
// declare these four with — and exported through src/exports.def, which both
// linkers consume. Adding __declspec(dllexport) here instead is C2375
// ("redefinition; different linkage") under MSVC: MinGW shrugs it off, which
// is how a broken export style built clean locally and then failed the CI
// release build (v0.6.3 shipped without this DLL because of it).
STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, void** ppv) {
  if (!ppv) return E_POINTER;
  *ppv = nullptr;
  Creator create = nullptr;
  if (IsEqualCLSID(rclsid, CLSID_UniversalPdfThumbProvider)) {
    create = CreateThumbnailProvider;
  } else if (IsEqualCLSID(rclsid, CLSID_UniversalPdfPreviewHandler)) {
    create = CreatePreviewHandler;
  } else {
    return CLASS_E_CLASSNOTAVAILABLE;
  }
  auto* factory = new (std::nothrow) ClassFactory(create);
  if (!factory) return E_OUTOFMEMORY;
  const HRESULT hr = factory->QueryInterface(riid, ppv);
  factory->Release();
  return hr;
}

STDAPI DllCanUnloadNow() {
  return g_cDllRef > 0 ? S_FALSE : S_OK;
}

STDAPI DllRegisterServer() {
  return RegisterProvider();
}

STDAPI DllUnregisterServer() {
  return UnregisterProvider();
}
