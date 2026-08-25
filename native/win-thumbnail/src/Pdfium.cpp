#include "Pdfium.h"

#include <algorithm>
#include <cmath>

namespace {

HMODULE g_pdfium = nullptr;
PdfiumApi g_api;
INIT_ONCE g_init = INIT_ONCE_STATIC_INIT;
SRWLOCK g_render_lock = SRWLOCK_INIT;

// A page rendered at more than this on its long edge is wasted work: the
// largest thumbnail Explorer asks for today is 1024.
constexpr UINT kMaxRenderEdge = 1024;

// Anchor for GetModuleHandleEx — any address inside this DLL identifies it.
void ModuleAnchor() {}

bool ResolveSiblingPath(const wchar_t* name, wchar_t (&out)[MAX_PATH]) {
  HMODULE self = nullptr;
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                              GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                          reinterpret_cast<LPCWSTR>(&ModuleAnchor), &self)) {
    return false;
  }
  DWORD n = GetModuleFileNameW(self, out, MAX_PATH);
  if (n == 0 || n >= MAX_PATH) return false;
  PathRemoveFileSpecW(out);
  return PathAppendW(out, name) != FALSE;
}

template <typename T>
bool Bind(T& fn, const char* name) {
  // Through void* deliberately: a direct cast from FARPROC trips
  // -Wcast-function-type on every one of these, and the warning cannot tell
  // this apart from a genuine signature mismatch.
  fn = reinterpret_cast<T>(reinterpret_cast<void*>(GetProcAddress(g_pdfium, name)));
  return fn != nullptr;
}

BOOL CALLBACK InitOnce(PINIT_ONCE, PVOID, PVOID*) {
  wchar_t path[MAX_PATH];
  if (!ResolveSiblingPath(L"pdfium.dll", path)) return TRUE;

  // LOAD_WITH_ALTERED_SEARCH_PATH so pdfium's own dependencies resolve from
  // our directory rather than the host process's.
  g_pdfium = LoadLibraryExW(path, nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
  if (!g_pdfium) return TRUE;

  const bool ok =
      Bind(g_api.InitLibrary, "FPDF_InitLibrary") &&
      Bind(g_api.LoadCustomDocument, "FPDF_LoadCustomDocument") &&
      Bind(g_api.CloseDocument, "FPDF_CloseDocument") &&
      Bind(g_api.GetPageCount, "FPDF_GetPageCount") &&
      Bind(g_api.LoadPage, "FPDF_LoadPage") &&
      Bind(g_api.ClosePage, "FPDF_ClosePage") &&
      Bind(g_api.GetPageWidthF, "FPDF_GetPageWidthF") &&
      Bind(g_api.GetPageHeightF, "FPDF_GetPageHeightF") &&
      Bind(g_api.RenderPageBitmap, "FPDF_RenderPageBitmap") &&
      Bind(g_api.BitmapCreateEx, "FPDFBitmap_CreateEx") &&
      Bind(g_api.BitmapFillRect, "FPDFBitmap_FillRect") &&
      Bind(g_api.BitmapDestroy, "FPDFBitmap_Destroy") &&
      Bind(g_api.GetLastErrorCode, "FPDF_GetLastError");

  if (!ok) {
    FreeLibrary(g_pdfium);
    g_pdfium = nullptr;
    g_api = PdfiumApi{};
    return TRUE;
  }

  g_api.InitLibrary();
  return TRUE;
}

// FPDF_FILEACCESS over the IStream the shell handed us, so a 300 MB PDF is
// never pulled into the surrogate's address space to thumbnail its first page.
struct StreamAccess {
  FPDF_FILEACCESS access{};
  IStream* stream = nullptr;
};

int ReadBlock(void* param, unsigned long position, unsigned char* buf,
              unsigned long size) {
  auto* self = static_cast<StreamAccess*>(param);
  LARGE_INTEGER move;
  move.QuadPart = static_cast<LONGLONG>(position);
  if (FAILED(self->stream->Seek(move, STREAM_SEEK_SET, nullptr))) return 0;

  unsigned long done = 0;
  while (done < size) {
    ULONG got = 0;
    if (FAILED(self->stream->Read(buf + done, size - done, &got)) || got == 0) {
      return 0;
    }
    done += got;
  }
  return 1;
}

}  // namespace

const PdfiumApi* GetPdfium() {
  InitOnceExecuteOnce(&g_init, InitOnce, nullptr, nullptr);
  return g_pdfium ? &g_api : nullptr;
}

HRESULT RenderFirstPage(IStream* stream, UINT cx, HBITMAP* out_bitmap,
                        UINT* out_width, UINT* out_height, void** out_bits) {
  if (!stream || !out_bitmap || cx == 0) return E_INVALIDARG;
  *out_bitmap = nullptr;

  const PdfiumApi* pdfium = GetPdfium();
  if (!pdfium) return E_FAIL;

  STATSTG stat{};
  HRESULT hr = stream->Stat(&stat, STATFLAG_NONAME);
  if (FAILED(hr)) return hr;
  // FPDF_FILEACCESS::m_FileLen is an unsigned long — 32 bits on Windows.
  if (stat.cbSize.QuadPart == 0 || stat.cbSize.QuadPart > 0xFFFFFFFFull) {
    return E_FAIL;
  }

  StreamAccess io;
  io.stream = stream;
  io.access.m_FileLen = static_cast<unsigned long>(stat.cbSize.QuadPart);
  io.access.m_GetBlock = ReadBlock;
  io.access.m_Param = &io;

  AcquireSRWLockExclusive(&g_render_lock);
  FPDF_DOCUMENT doc = pdfium->LoadCustomDocument(&io.access, nullptr);
  if (!doc) {
    // Includes FPDF_ERR_PASSWORD. There is no UI in a thumbnail provider and
    // no way to ask, so an encrypted file simply keeps the flat icon.
    ReleaseSRWLockExclusive(&g_render_lock);
    return E_FAIL;
  }

  FPDF_PAGE page = pdfium->GetPageCount(doc) > 0 ? pdfium->LoadPage(doc, 0) : nullptr;
  if (!page) {
    pdfium->CloseDocument(doc);
    ReleaseSRWLockExclusive(&g_render_lock);
    return E_FAIL;
  }

  const double page_w = pdfium->GetPageWidthF(page);
  const double page_h = pdfium->GetPageHeightF(page);
  if (!(page_w > 0.0) || !(page_h > 0.0)) {
    pdfium->ClosePage(page);
    pdfium->CloseDocument(doc);
    ReleaseSRWLockExclusive(&g_render_lock);
    return E_FAIL;
  }

  const UINT edge = (std::min)(cx, kMaxRenderEdge);
  const double scale = (std::min)(edge / page_w, edge / page_h);
  const int width = (std::max)(1, static_cast<int>(std::lround(page_w * scale)));
  const int height = (std::max)(1, static_cast<int>(std::lround(page_h * scale)));

  BITMAPINFO bmi{};
  bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  bmi.bmiHeader.biWidth = width;
  bmi.bmiHeader.biHeight = -height;  // top-down, which is what PDFium writes
  bmi.bmiHeader.biPlanes = 1;
  bmi.bmiHeader.biBitCount = 32;
  bmi.bmiHeader.biCompression = BI_RGB;

  void* bits = nullptr;
  HBITMAP dib = CreateDIBSection(nullptr, &bmi, DIB_RGB_COLORS, &bits, nullptr, 0);
  if (!dib || !bits) {
    if (dib) DeleteObject(dib);
    pdfium->ClosePage(page);
    pdfium->CloseDocument(doc);
    ReleaseSRWLockExclusive(&g_render_lock);
    return E_OUTOFMEMORY;
  }

  FPDF_BITMAP fbmp =
      pdfium->BitmapCreateEx(width, height, FPDFBitmap_BGRA, bits, width * 4);
  if (!fbmp) {
    DeleteObject(dib);
    pdfium->ClosePage(page);
    pdfium->CloseDocument(doc);
    ReleaseSRWLockExclusive(&g_render_lock);
    return E_FAIL;
  }

  // Paper first: a PDF page is transparent where nothing is drawn, and the
  // shell would composite that straight onto the folder background.
  pdfium->BitmapFillRect(fbmp, 0, 0, width, height, 0xFFFFFFFF);
  // FPDF_ANNOT so filled form fields and stamps appear, as they do in the app.
  // No FPDF_LCD_TEXT: subpixel positioning is wrong for a bitmap that will be
  // rescaled by whatever view the shell is drawing.
  pdfium->RenderPageBitmap(fbmp, page, 0, 0, width, height, 0, FPDF_ANNOT);
  pdfium->BitmapDestroy(fbmp);

  pdfium->ClosePage(page);
  pdfium->CloseDocument(doc);
  ReleaseSRWLockExclusive(&g_render_lock);

  *out_bitmap = dib;
  if (out_width) *out_width = static_cast<UINT>(width);
  if (out_height) *out_height = static_cast<UINT>(height);
  if (out_bits) *out_bits = bits;
  return S_OK;
}
