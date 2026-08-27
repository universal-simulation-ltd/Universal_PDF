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
//   thumbtest preview <file.pdf> <out.png> [pagedowns]
//       Hosts the preview handler the way Explorer's preview pane does — a
//       parent window, SetRect, DoPreview — and captures what it drew. Optional
//       page-downs first, to prove paging works.
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
#include <cstring>
#include <cwchar>
#include <vector>

namespace {

// An IStream that can be SEALED: after that, every Read and Seek fails and is
// counted. It stands in for the shell's marshalled stream proxy, which is not
// safe to touch once the opening call has returned — reading it from WM_PAINT
// is what deadlocked Explorer (AppHangXProcB1, 2026-08-27).
class SealedStream final : public IStream {
 public:
  explicit SealedStream(std::vector<unsigned char> bytes)
      : bytes_(std::move(bytes)) {}

  void Seal() { sealed_ = true; }
  int BlockedReads() const { return blocked_; }

  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_ISequentialStream) ||
        IsEqualIID(riid, IID_IStream)) {
      *ppv = static_cast<IStream*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  IFACEMETHODIMP_(ULONG) AddRef() override { return ++ref_; }
  IFACEMETHODIMP_(ULONG) Release() override {
    const ULONG n = --ref_;
    if (n == 0) delete this;
    return n;
  }

  IFACEMETHODIMP Read(void* out, ULONG want, ULONG* got) override {
    if (sealed_) {
      ++blocked_;
      return E_FAIL;
    }
    const size_t left = bytes_.size() - (std::min)(pos_, bytes_.size());
    const ULONG n = static_cast<ULONG>((std::min)(static_cast<size_t>(want), left));
    if (n) std::memcpy(out, bytes_.data() + pos_, n);
    pos_ += n;
    if (got) *got = n;
    return n ? S_OK : S_FALSE;
  }

  IFACEMETHODIMP Seek(LARGE_INTEGER move, DWORD origin,
                      ULARGE_INTEGER* out) override {
    if (sealed_) {
      ++blocked_;
      return E_FAIL;
    }
    long long base = origin == STREAM_SEEK_CUR ? static_cast<long long>(pos_)
                     : origin == STREAM_SEEK_END
                         ? static_cast<long long>(bytes_.size())
                         : 0;
    long long target = base + move.QuadPart;
    if (target < 0) return E_FAIL;
    pos_ = static_cast<size_t>(target);
    if (out) out->QuadPart = pos_;
    return S_OK;
  }

  IFACEMETHODIMP Stat(STATSTG* stat, DWORD) override {
    if (!stat) return E_POINTER;
    ZeroMemory(stat, sizeof(*stat));
    stat->cbSize.QuadPart = bytes_.size();
    stat->type = STGTY_STREAM;
    return S_OK;
  }

  IFACEMETHODIMP Write(const void*, ULONG, ULONG*) override { return E_NOTIMPL; }
  IFACEMETHODIMP SetSize(ULARGE_INTEGER) override { return E_NOTIMPL; }
  IFACEMETHODIMP CopyTo(IStream*, ULARGE_INTEGER, ULARGE_INTEGER*,
                        ULARGE_INTEGER*) override { return E_NOTIMPL; }
  IFACEMETHODIMP Commit(DWORD) override { return E_NOTIMPL; }
  IFACEMETHODIMP Revert() override { return E_NOTIMPL; }
  IFACEMETHODIMP LockRegion(ULARGE_INTEGER, ULARGE_INTEGER, DWORD) override { return E_NOTIMPL; }
  IFACEMETHODIMP UnlockRegion(ULARGE_INTEGER, ULARGE_INTEGER, DWORD) override { return E_NOTIMPL; }
  IFACEMETHODIMP Clone(IStream**) override { return E_NOTIMPL; }

 private:
  std::vector<unsigned char> bytes_;
  size_t pos_ = 0;
  bool sealed_ = false;
  int blocked_ = 0;
  ULONG ref_ = 1;
};

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

const CLSID kPreviewClsid = {
    0x7a337fc1, 0xf731, 0x4f4f, {0xa3, 0xfb, 0x3e, 0x19, 0x35, 0x24, 0x8d, 0xed}};

// Drains the queue the way a host with a message loop would: the handler's
// window paints and repaints on its own thread, and nothing appears until
// those messages have actually run.
void PumpFor(DWORD ms) {
  const DWORD until = GetTickCount() + ms;
  MSG msg;
  while (GetTickCount() < until) {
    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }
    Sleep(15);
  }
}

int PreviewInHost(const wchar_t* pdf, const wchar_t* out, int page_downs) {
  IPreviewHandler* preview = nullptr;
  // INPROC deliberately: this is testing the handler's own code, not the
  // shell's hosting. Explorer creates it LOCAL_SERVER, which the CLSID's AppID
  // routes into prevhost.exe.
  HRESULT hr = CoCreateInstance(kPreviewClsid, nullptr, CLSCTX_INPROC_SERVER,
                                IID_PPV_ARGS(&preview));
  if (FAILED(hr)) return Fail("CoCreateInstance(preview)", hr);

  IInitializeWithStream* init = nullptr;
  hr = preview->QueryInterface(kIidInitializeWithStream,
                               reinterpret_cast<void**>(&init));
  if (FAILED(hr)) {
    preview->Release();
    return Fail("QI IInitializeWithStream", hr);
  }

  IStream* stream = nullptr;
  hr = SHCreateStreamOnFileEx(pdf, STGM_READ | STGM_SHARE_DENY_WRITE, 0, FALSE,
                              nullptr, &stream);
  if (SUCCEEDED(hr)) {
    hr = init->Initialize(stream, 0);
    stream->Release();
  }
  init->Release();
  if (FAILED(hr)) {
    preview->Release();
    return Fail("Initialize", hr);
  }

  // Placed on-screen but never activated. A window parked entirely outside
  // every monitor has no composed surface, and PrintWindow then returns TRUE
  // having drawn nothing — which looks exactly like a handler that painted
  // black.
  WNDCLASSEXW wc{};
  wc.cbSize = sizeof(wc);
  wc.lpfnWndProc = DefWindowProcW;
  wc.hInstance = GetModuleHandleW(nullptr);
  // A visible background, so a capture that came out black says "the handler
  // drew nothing" rather than "the host window has no brush".
  wc.hbrBackground = reinterpret_cast<HBRUSH>(GetStockObject(GRAY_BRUSH));
  wc.lpszClassName = L"UniversalPdfPreviewTestHost";
  RegisterClassExW(&wc);

  const int host_w = 760, host_h = 900;
  HWND host = CreateWindowExW(WS_EX_TOOLWINDOW, wc.lpszClassName, L"preview",
                              WS_POPUP | WS_VISIBLE, 0, 0, host_w,
                              host_h, nullptr, nullptr, wc.hInstance, nullptr);
  if (!host) {
    preview->Release();
    return Fail("CreateWindow", HRESULT_FROM_WIN32(GetLastError()));
  }

  RECT rect{0, 0, host_w, host_h};
  preview->SetWindow(host, &rect);
  preview->SetRect(&rect);
  hr = preview->DoPreview();
  if (FAILED(hr)) {
    DestroyWindow(host);
    preview->Release();
    return Fail("DoPreview", hr);
  }
  PumpFor(900);

  for (int i = 0; i < page_downs; ++i) {
    HWND child = GetWindow(host, GW_CHILD);
    if (child) SendMessageW(child, WM_KEYDOWN, VK_NEXT, 0);
    PumpFor(500);
  }

  // One more settle before the shot: a page turn re-renders, and a capture
  // taken mid-render is a black rectangle with nothing to explain it.
  PumpFor(500);
  std::printf("child window: %s\n", GetWindow(host, GW_CHILD) ? "alive" : "GONE");

  HDC screen = GetDC(nullptr);
  HDC mem = CreateCompatibleDC(screen);
  HBITMAP shot = CreateCompatibleBitmap(screen, host_w, host_h);
  HGDIOBJ old_bmp = SelectObject(mem, shot);
  // The handler's own window, not the host: PrintWindow on the parent comes
  // back all black for some documents even though the child is alive and has
  // painted — it is the child's surface we are actually testing.
  HWND child = GetWindow(host, GW_CHILD);
  const BOOL printed =
      PrintWindow(child ? child : host, mem, 2 /* PW_RENDERFULLCONTENT */);
  SelectObject(mem, old_bmp);
  DeleteDC(mem);
  ReleaseDC(nullptr, screen);

  hr = printed ? SavePng(shot, out) : E_FAIL;
  DeleteObject(shot);

  preview->Unload();
  DestroyWindow(host);
  preview->Release();
  if (FAILED(hr)) return Fail("capture", hr);
  std::printf("previewed with %d page-down(s)\n", page_downs);
  return 0;
}

// Activate the preview handler the way EXPLORER does: out-of-process, through
// whichever prevhost.exe the CLSID's AppID names.
//
// ⚠️ This is the check `preview` cannot make. That mode uses INPROC on purpose
// (it is testing our drawing code), which loads the DLL straight into this
// process and never consults the AppID at all — so it passed happily while the
// CLSID pointed at the 32-BIT surrogate and 64-bit Explorer could never load
// the handler. A wrong AppID fails HERE and nowhere else.
int PreviewHosted() {
  IUnknown* unk = nullptr;
  const HRESULT hr =
      CoCreateInstance(kPreviewClsid, nullptr, CLSCTX_LOCAL_SERVER,
                       IID_PPV_ARGS(&unk));
  if (FAILED(hr)) {
    std::fprintf(stderr,
                 "the surrogate could not create the handler — check the "
                 "CLSID's AppID names the 64-bit preview host "
                 "{6d2b5079-2f0b-48dd-ab7f-97cec514d30b}\n");
    return Fail("CoCreateInstance(LOCAL_SERVER)", hr);
  }
  IPreviewHandler* preview = nullptr;
  const HRESULT qi = unk->QueryInterface(IID_PPV_ARGS(&preview));
  unk->Release();
  if (FAILED(qi)) return Fail("QI IPreviewHandler (hosted)", qi);
  preview->Release();
  std::printf("hosted activation ok — the shell's surrogate loaded the DLL\n");
  return 0;
}

// Open a document, then take the stream away and make it render again.
//
// A handler that copied the file up front does not notice. One that reads
// lazily — as this did until 2026-08-27 — reaches back through a stream it no
// longer owns, which against the shell's real proxy means an outbound COM call
// into a process already blocked waiting on us.
int PreviewSealed(const wchar_t* pdf) {
  HANDLE fh = CreateFileW(pdf, GENERIC_READ, FILE_SHARE_READ, nullptr,
                          OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (fh == INVALID_HANDLE_VALUE) {
    return Fail("open file", HRESULT_FROM_WIN32(GetLastError()));
  }
  LARGE_INTEGER size{};
  GetFileSizeEx(fh, &size);
  std::vector<unsigned char> bytes(static_cast<size_t>(size.QuadPart));
  DWORD read = 0;
  ReadFile(fh, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr);
  CloseHandle(fh);
  if (read != bytes.size()) return Fail("read file", E_FAIL);

  auto* stream = new SealedStream(std::move(bytes));

  IPreviewHandler* preview = nullptr;
  HRESULT hr = CoCreateInstance(kPreviewClsid, nullptr, CLSCTX_INPROC_SERVER,
                                IID_PPV_ARGS(&preview));
  if (FAILED(hr)) {
    stream->Release();
    return Fail("CoCreateInstance(preview)", hr);
  }

  IInitializeWithStream* init = nullptr;
  hr = preview->QueryInterface(kIidInitializeWithStream,
                               reinterpret_cast<void**>(&init));
  if (SUCCEEDED(hr)) {
    hr = init->Initialize(stream, 0);
    init->Release();
  }
  if (FAILED(hr)) {
    preview->Release();
    stream->Release();
    return Fail("Initialize", hr);
  }

  WNDCLASSEXW wc{};
  wc.cbSize = sizeof(wc);
  wc.lpfnWndProc = DefWindowProcW;
  wc.hInstance = GetModuleHandleW(nullptr);
  wc.hbrBackground = reinterpret_cast<HBRUSH>(GetStockObject(GRAY_BRUSH));
  wc.lpszClassName = L"UniversalPdfSealedTestHost";
  RegisterClassExW(&wc);
  HWND host = CreateWindowExW(WS_EX_TOOLWINDOW, wc.lpszClassName, L"sealed",
                              WS_POPUP | WS_VISIBLE, 0, 0, 600, 760, nullptr,
                              nullptr, wc.hInstance, nullptr);

  RECT rect{0, 0, 600, 760};
  preview->SetWindow(host, &rect);
  preview->SetRect(&rect);
  hr = preview->DoPreview();
  if (FAILED(hr)) {
    DestroyWindow(host);
    preview->Release();
    stream->Release();
    return Fail("DoPreview", hr);
  }
  PumpFor(700);

  // Everything above is what the shell does while it is still on the call. From
  // here the stream is off limits.
  stream->Seal();

  // A resize alone is not enough to prove anything: PDFium reads a small
  // document greedily while parsing it, so re-rendering PAGE ONE touches the
  // stream not at all even when the handler is streaming. Turning the page is
  // what forces a genuinely new read — later pages are exactly what a lazy
  // reader has not fetched yet. Use a multi-page PDF or this check is vacuous.
  RECT smaller{0, 0, 520, 660};
  preview->SetRect(&smaller);
  SetWindowPos(host, nullptr, 0, 0, 520, 660, SWP_NOZORDER | SWP_NOACTIVATE);
  PumpFor(400);

  for (int i = 0; i < 4; ++i) {
    HWND child = GetWindow(host, GW_CHILD);
    if (child) SendMessageW(child, WM_KEYDOWN, VK_NEXT, 0);
    PumpFor(400);
  }

  const int blocked = stream->BlockedReads();
  std::printf("reads attempted after the stream was sealed: %d\n", blocked);

  preview->Unload();
  DestroyWindow(host);
  preview->Release();
  stream->Release();

  if (blocked != 0) {
    std::fprintf(stderr,
                 "the handler read the shell's stream after its opening call "
                 "returned — against a real marshalled proxy that is the "
                 "Explorer deadlock\n");
    return 1;
  }
  std::printf("sealed-stream check ok — the document was buffered up front\n");
  return 0;
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
                 "       thumbtest preview <file.pdf> <out.png> [pagedowns]\n"
                 "       thumbtest hosted\n"
                 "       thumbtest sealed <file.pdf>\n"
                 "       thumbtest register|unregister\n");
    return 2;
  }

  HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  if (FAILED(hr)) return Fail("CoInitializeEx", hr);

  int rc = 2;
  if (_wcsicmp(argv[1], L"hosted") == 0) {
    rc = PreviewHosted();
  } else if (argc == 3 && _wcsicmp(argv[1], L"sealed") == 0) {
    rc = PreviewSealed(argv[2]);
  } else if (_wcsicmp(argv[1], L"register") == 0) {
    rc = SelfRegister(true);
  } else if (_wcsicmp(argv[1], L"unregister") == 0) {
    rc = SelfRegister(false);
  } else if (argc == 5 && _wcsicmp(argv[1], L"render") == 0) {
    rc = RenderDirect(argv[2], static_cast<UINT>(_wtoi(argv[3])), argv[4]);
  } else if (argc >= 4 && _wcsicmp(argv[1], L"preview") == 0) {
    rc = PreviewInHost(argv[2], argv[3], argc > 4 ? _wtoi(argv[4]) : 0);
  } else if (argc == 5 && _wcsicmp(argv[1], L"shell") == 0) {
    rc = RenderViaShell(argv[2], static_cast<UINT>(_wtoi(argv[3])), argv[4]);
  } else {
    std::fprintf(stderr, "unrecognised arguments\n");
  }

  CoUninitialize();
  return rc;
}
