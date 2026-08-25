// thumbtest — drives the provider without Explorer in the way.
//
//   thumbtest render <file.pdf> <size> <out.png>
//       Loads UniversalPdfThumb.dll from beside this exe, creates the provider
//       directly and writes what it produced. Proves the render and the badge.
//
//   thumbtest shell <any file> <size> <out.png>
//       Asks the SHELL for the thumbnail. This one goes through the registry,
//       the surrogate and the whole handler lookup, so it is what proves the
//       registration — and it fails exactly the way Explorer would.
//
//   thumbtest register / thumbtest unregister
//       Convenience wrappers over the DLL's own HKCU self-registration.

#include <windows.h>
#include <objbase.h>
#include <shlwapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <propsys.h>
#include <thumbcache.h>
#include <wincodec.h>

#include <cstdio>
#include <cwchar>

namespace {

const CLSID kProviderClsid = {
    0x9d3ae6b2, 0x939a, 0x47a9, {0xa7, 0xf8, 0xd3, 0x0a, 0x6f, 0xc4, 0xc1, 0x0f}};
const IID kIidInitializeWithStream = {
    0xb824b49d, 0x22ac, 0x4161, {0xac, 0x8a, 0x99, 0x16, 0xe8, 0xfa, 0x3f, 0x7f}};
const IID kIidThumbnailProvider = {
    0xe357fccd, 0xa995, 0x4576, {0xb0, 0x1f, 0x23, 0x46, 0x30, 0x15, 0x4e, 0x96}};

int Fail(const char* what, HRESULT hr) {
  std::fprintf(stderr, "FAIL %s (hr=0x%08lX)\n", what,
               static_cast<unsigned long>(hr));
  return 1;
}

bool SiblingPath(const wchar_t* name, wchar_t (&out)[MAX_PATH]) {
  if (GetModuleFileNameW(nullptr, out, MAX_PATH) == 0) return false;
  PathRemoveFileSpecW(out);
  return PathAppendW(out, name) != FALSE;
}

HRESULT SavePng(HBITMAP bitmap, const wchar_t* path) {
  BITMAP info{};
  if (GetObjectW(bitmap, sizeof(info), &info) == 0) return E_FAIL;
  const UINT width = static_cast<UINT>(info.bmWidth);
  const UINT height = static_cast<UINT>(info.bmHeight);
  const UINT stride = width * 4;

  BITMAPINFO bmi{};
  bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  bmi.bmiHeader.biWidth = info.bmWidth;
  bmi.bmiHeader.biHeight = -info.bmHeight;  // top-down
  bmi.bmiHeader.biPlanes = 1;
  bmi.bmiHeader.biBitCount = 32;
  bmi.bmiHeader.biCompression = BI_RGB;

  auto* pixels = new BYTE[static_cast<size_t>(stride) * height];
  HDC dc = GetDC(nullptr);
  const int copied =
      GetDIBits(dc, bitmap, 0, height, pixels, &bmi, DIB_RGB_COLORS);
  ReleaseDC(nullptr, dc);
  if (copied == 0) {
    delete[] pixels;
    return E_FAIL;
  }

  IWICImagingFactory* factory = nullptr;
  HRESULT hr = CoCreateInstance(CLSID_WICImagingFactory, nullptr,
                                CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory));
  IWICStream* stream = nullptr;
  IWICBitmapEncoder* encoder = nullptr;
  IWICBitmapFrameEncode* frame = nullptr;
  if (SUCCEEDED(hr)) hr = factory->CreateStream(&stream);
  if (SUCCEEDED(hr)) hr = stream->InitializeFromFilename(path, GENERIC_WRITE);
  if (SUCCEEDED(hr)) {
    hr = factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, &encoder);
  }
  if (SUCCEEDED(hr)) hr = encoder->Initialize(stream, WICBitmapEncoderNoCache);
  if (SUCCEEDED(hr)) hr = encoder->CreateNewFrame(&frame, nullptr);
  if (SUCCEEDED(hr)) hr = frame->Initialize(nullptr);
  if (SUCCEEDED(hr)) hr = frame->SetSize(width, height);
  WICPixelFormatGUID format = GUID_WICPixelFormat32bppBGRA;
  if (SUCCEEDED(hr)) hr = frame->SetPixelFormat(&format);
  if (SUCCEEDED(hr)) {
    hr = frame->WritePixels(height, stride, stride * height, pixels);
  }
  if (SUCCEEDED(hr)) hr = frame->Commit();
  if (SUCCEEDED(hr)) hr = encoder->Commit();

  if (frame) frame->Release();
  if (encoder) encoder->Release();
  if (stream) stream->Release();
  if (factory) factory->Release();
  delete[] pixels;

  if (SUCCEEDED(hr)) {
    // Narrowed by hand: stdout is already byte-oriented from the printf above,
    // and both a wide write and a %ls truncate at the first NUL of the UTF-16.
    char narrow[MAX_PATH * 3];
    WideCharToMultiByte(CP_UTF8, 0, path, -1, narrow, sizeof(narrow), nullptr,
                        nullptr);
    std::printf("wrote %s (%ux%u)\n", narrow, width, height);
  }
  return hr;
}

int RenderDirect(const wchar_t* pdf, UINT size, const wchar_t* out) {
  wchar_t dll[MAX_PATH];
  if (!SiblingPath(L"UniversalPdfThumb.dll", dll)) {
    return Fail("locate dll", E_FAIL);
  }
  HMODULE module = LoadLibraryExW(dll, nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
  if (!module) return Fail("LoadLibrary", HRESULT_FROM_WIN32(GetLastError()));

  using GetClassObjectFn = HRESULT(__stdcall*)(REFCLSID, REFIID, void**);
  auto get_class_object = reinterpret_cast<GetClassObjectFn>(
      GetProcAddress(module, "DllGetClassObject"));
  if (!get_class_object) return Fail("DllGetClassObject missing", E_FAIL);

  IClassFactory* factory = nullptr;
  HRESULT hr = get_class_object(kProviderClsid, IID_IClassFactory,
                                reinterpret_cast<void**>(&factory));
  if (FAILED(hr)) return Fail("class factory", hr);

  IInitializeWithStream* init = nullptr;
  hr = factory->CreateInstance(nullptr, kIidInitializeWithStream,
                               reinterpret_cast<void**>(&init));
  factory->Release();
  if (FAILED(hr)) return Fail("CreateInstance", hr);

  IStream* stream = nullptr;
  hr = SHCreateStreamOnFileEx(pdf, STGM_READ | STGM_SHARE_DENY_WRITE, 0, FALSE,
                              nullptr, &stream);
  if (FAILED(hr)) {
    init->Release();
    return Fail("open pdf", hr);
  }

  hr = init->Initialize(stream, 0);
  stream->Release();
  if (FAILED(hr)) {
    init->Release();
    return Fail("Initialize", hr);
  }

  IThumbnailProvider* provider = nullptr;
  hr = init->QueryInterface(kIidThumbnailProvider,
                            reinterpret_cast<void**>(&provider));
  init->Release();
  if (FAILED(hr)) return Fail("QI IThumbnailProvider", hr);

  HBITMAP bitmap = nullptr;
  WTS_ALPHATYPE alpha = WTSAT_UNKNOWN;
  hr = provider->GetThumbnail(size, &bitmap, &alpha);
  provider->Release();
  if (FAILED(hr)) return Fail("GetThumbnail", hr);
  if (!bitmap) return Fail("GetThumbnail returned no bitmap", E_FAIL);

  std::printf("alpha type: %d\n", static_cast<int>(alpha));
  hr = SavePng(bitmap, out);
  DeleteObject(bitmap);
  return SUCCEEDED(hr) ? 0 : Fail("save png", hr);
}

int RenderViaShell(const wchar_t* file, UINT size, const wchar_t* out) {
  wchar_t full[MAX_PATH];
  if (GetFullPathNameW(file, MAX_PATH, full, nullptr) == 0) {
    return Fail("full path", HRESULT_FROM_WIN32(GetLastError()));
  }

  IShellItemImageFactory* images = nullptr;
  HRESULT hr = SHCreateItemFromParsingName(full, nullptr, IID_PPV_ARGS(&images));
  if (FAILED(hr)) return Fail("SHCreateItemFromParsingName", hr);

  SIZE want{static_cast<LONG>(size), static_cast<LONG>(size)};
  HBITMAP bitmap = nullptr;
  // THUMBNAILONLY so a fallback icon cannot pass for a real thumbnail.
  //
  // Deliberately no SIIGBF_MEMORYONLY: that flag means "only if it is already
  // in memory", so it forbids the very extraction we are trying to test and
  // comes back E_PENDING. The way to keep the thumbnail cache out of the
  // result is therefore to hand this a file name it has never seen before.
  hr = images->GetImage(want, SIIGBF_THUMBNAILONLY, &bitmap);
  images->Release();
  if (FAILED(hr)) return Fail("IShellItemImageFactory::GetImage", hr);

  hr = SavePng(bitmap, out);
  DeleteObject(bitmap);
  return SUCCEEDED(hr) ? 0 : Fail("save png", hr);
}

int SelfRegister(bool on) {
  wchar_t dll[MAX_PATH];
  if (!SiblingPath(L"UniversalPdfThumb.dll", dll)) {
    return Fail("locate dll", E_FAIL);
  }
  HMODULE module = LoadLibraryExW(dll, nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
  if (!module) return Fail("LoadLibrary", HRESULT_FROM_WIN32(GetLastError()));

  using RegFn = HRESULT(__stdcall*)();
  auto fn = reinterpret_cast<RegFn>(
      GetProcAddress(module, on ? "DllRegisterServer" : "DllUnregisterServer"));
  if (!fn) return Fail("entry point missing", E_FAIL);

  const HRESULT hr = fn();
  if (FAILED(hr)) return Fail("registration", hr);
  std::printf("%s ok\n", on ? "registered" : "unregistered");
  return 0;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc < 2) {
    std::fprintf(stderr,
                 "usage: thumbtest render|shell <file> <size> <out.png>\n"
                 "       thumbtest register|unregister\n");
    return 2;
  }

  HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  if (FAILED(hr)) return Fail("CoInitializeEx", hr);

  int rc = 2;
  if (_wcsicmp(argv[1], L"register") == 0) {
    rc = SelfRegister(true);
  } else if (_wcsicmp(argv[1], L"unregister") == 0) {
    rc = SelfRegister(false);
  } else if (argc == 5 && _wcsicmp(argv[1], L"render") == 0) {
    rc = RenderDirect(argv[2], static_cast<UINT>(_wtoi(argv[3])), argv[4]);
  } else if (argc == 5 && _wcsicmp(argv[1], L"shell") == 0) {
    rc = RenderViaShell(argv[2], static_cast<UINT>(_wtoi(argv[3])), argv[4]);
  } else {
    std::fprintf(stderr, "unrecognised arguments\n");
  }

  CoUninitialize();
  return rc;
}
