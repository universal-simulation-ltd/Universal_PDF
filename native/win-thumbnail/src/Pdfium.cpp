#include "Pdfium.h"

#include <algorithm>
#include <cmath>

#include "Badge.h"

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

// Renders one page into its own buffer, for a sheet in the fan. Half the front
// page's resolution: only a sliver of each sheet is ever visible, and it is
// drawn at an angle. Returns false — and the sheet stays blank paper — for any
// page that will not render.
bool RenderSheetPage(const PdfiumApi* pdfium, FPDF_DOCUMENT doc, int index,
                     int max_w, int max_h, SheetImage* out) {
  FPDF_PAGE page = pdfium->LoadPage(doc, index);
  if (!page) return false;

  const double pw = pdfium->GetPageWidthF(page);
  const double ph = pdfium->GetPageHeightF(page);
  if (!(pw > 0.0) || !(ph > 0.0)) {
    pdfium->ClosePage(page);
    return false;
  }

  const double scale = (std::min)(max_w / pw, max_h / ph) * kSheetPreviewScale;
  const int w = (std::max)(1, static_cast<int>(std::lround(pw * scale)));
  const int h = (std::max)(1, static_cast<int>(std::lround(ph * scale)));

  out->pixels.assign(static_cast<size_t>(w) * h * 4, 0);
  FPDF_BITMAP bmp = pdfium->BitmapCreateEx(w, h, FPDFBitmap_BGRA,
                                           out->pixels.data(), w * 4);
  if (!bmp) {
    pdfium->ClosePage(page);
    out->pixels.clear();
    return false;
  }

  pdfium->BitmapFillRect(bmp, 0, 0, w, h, 0xFFFFFFFF);
  pdfium->RenderPageBitmap(bmp, page, 0, 0, w, h, 0, FPDF_ANNOT);
  pdfium->BitmapDestroy(bmp);
  pdfium->ClosePage(page);

  out->width = w;
  out->height = h;
  return true;
}

}  // namespace

const PdfiumApi* GetPdfium() {
  InitOnceExecuteOnce(&g_init, InitOnce, nullptr, nullptr);
  return g_pdfium ? &g_api : nullptr;
}

HRESULT RenderThumbnail(IStream* stream, UINT cx, Thumbnail* out) {
  if (!stream || !out || cx == 0) return E_INVALIDARG;
  *out = Thumbnail{};

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

  const int pages = pdfium->GetPageCount(doc);
  FPDF_PAGE page = pages > 0 ? pdfium->LoadPage(doc, 0) : nullptr;
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

  // The fan has to come out of the same cx box the shell asked for, so the
  // whole composition is measured first and the page fitted to what is left.
  const UINT edge = (std::min)(cx, kMaxRenderEdge);
  const Layout layout = ComputeLayout(page_w, page_h, edge, pages);
  const int width = layout.width;
  const int height = layout.height;
  const int pw = static_cast<int>(layout.page.right - layout.page.left);
  const int ph = static_cast<int>(layout.page.bottom - layout.page.top);

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

  // Everything starts fully transparent: with a stack drawn, the thumbnail is
  // no longer a plain rectangle and the notches at top-left and bottom-right
  // must let the folder background through.
  ZeroMemory(bits, static_cast<size_t>(width) * height * 4);

  const RECT page_rect = layout.page;

  // Pages 2 and 3, for the sheets behind the front one. Two extra renders, so
  // only above kMinSizeForSheetPreviews and only for sheets that exist; any
  // page that will not render simply leaves its sheet as blank paper.
  SheetImage previews[2];
  if (edge >= kMinSizeForSheetPreviews) {
    for (int i = 1; i <= layout.sheets && i < pages; ++i) {
      RenderSheetPage(pdfium, doc, i, pw, ph, &previews[i - 1]);
    }
  }
  DrawFan(bits, layout, previews, 2);

  // Render straight into the page's sub-rectangle of the same DIB by handing
  // PDFium the origin of that rectangle and the full-width stride.
  auto* first_scan = static_cast<BYTE*>(bits) +
                     (static_cast<size_t>(page_rect.top) * width + page_rect.left) * 4;
  FPDF_BITMAP fbmp =
      pdfium->BitmapCreateEx(pw, ph, FPDFBitmap_BGRA, first_scan, width * 4);
  if (!fbmp) {
    DeleteObject(dib);
    pdfium->ClosePage(page);
    pdfium->CloseDocument(doc);
    ReleaseSRWLockExclusive(&g_render_lock);
    return E_FAIL;
  }

  // Paper first: a PDF page is transparent where nothing is drawn, and the
  // shell would composite that straight onto the folder background.
  pdfium->BitmapFillRect(fbmp, 0, 0, pw, ph, 0xFFFFFFFF);
  // FPDF_ANNOT so filled form fields and stamps appear, as they do in the app.
  // No FPDF_LCD_TEXT: subpixel positioning is wrong for a bitmap that will be
  // rescaled by whatever view the shell is drawing.
  pdfium->RenderPageBitmap(fbmp, page, 0, 0, pw, ph, 0, FPDF_ANNOT);
  pdfium->BitmapDestroy(fbmp);

  pdfium->ClosePage(page);
  pdfium->CloseDocument(doc);
  ReleaseSRWLockExclusive(&g_render_lock);

  out->bitmap = dib;
  out->bits = bits;
  out->width = static_cast<UINT>(width);
  out->height = static_cast<UINT>(height);
  out->page = page_rect;
  out->pages = pages;
  return S_OK;
}
