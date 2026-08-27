// Run-time binding to pdfium.dll, and the page render itself.
//
// Nothing links against pdfium.dll.lib. Two reasons, both load-bearing:
//
//  1. An in-process shell extension is loaded by dllhost.exe (or explorer.exe),
//     whose directory is system32 — so an implicit import of "pdfium.dll" would
//     be searched for anywhere but next to us, and fail. We resolve our own
//     module's directory and load it by full path.
//  2. The prebuilt import library is MSVC's. Resolving by name keeps the same
//     source building under MinGW on the dev box and MSVC in CI.
#pragma once

#include <vector>

#include "Common.h"

// PDFium is a C API and this header only declares it; taking decltype of a
// declared-but-never-called function needs no symbol at link time.
#include "fpdfview.h"

struct PdfiumApi {
  decltype(&FPDF_InitLibrary) InitLibrary = nullptr;
  decltype(&FPDF_LoadCustomDocument) LoadCustomDocument = nullptr;
  decltype(&FPDF_CloseDocument) CloseDocument = nullptr;
  decltype(&FPDF_GetPageCount) GetPageCount = nullptr;
  decltype(&FPDF_LoadPage) LoadPage = nullptr;
  decltype(&FPDF_ClosePage) ClosePage = nullptr;
  decltype(&FPDF_GetPageWidthF) GetPageWidthF = nullptr;
  decltype(&FPDF_GetPageHeightF) GetPageHeightF = nullptr;
  decltype(&FPDF_RenderPageBitmap) RenderPageBitmap = nullptr;
  decltype(&FPDFBitmap_CreateEx) BitmapCreateEx = nullptr;
  decltype(&FPDFBitmap_FillRect) BitmapFillRect = nullptr;
  decltype(&FPDFBitmap_Destroy) BitmapDestroy = nullptr;
  decltype(&FPDF_GetLastError) GetLastErrorCode = nullptr;
  // Page dimensions WITHOUT parsing the page. Bound optionally: the preview
  // pane measures every page up front to lay out a scrolling stack, and
  // FPDF_LoadPage on each one turns opening a 500-page document into a stall.
  // Null on an older pdfium, where PageSize() falls back to loading the page.
  decltype(&FPDF_GetPageSizeByIndexF) GetPageSizeByIndexF = nullptr;
};

// Loads pdfium.dll from this module's directory and calls FPDF_InitLibrary
// exactly once per process. Returns nullptr if either fails.
//
// PDFium is deliberately never torn down: FPDF_DestroyLibrary from DllMain
// would run under the loader lock, and the surrogate is short-lived anyway.
const PdfiumApi* GetPdfium();

// What a finished render looks like. The bitmap is a 32-bit top-down DIB whose
// pixels are premultiplied BGRA; everything outside `page` and the sheets
// behind it is fully transparent.
struct Thumbnail {
  HBITMAP bitmap = nullptr;
  void* bits = nullptr;
  UINT width = 0;    // the whole bitmap, page plus the stack peeking out
  UINT height = 0;
  RECT page{};       // where page 1 sits inside it
  int pages = 0;     // page count, for the "52 pages" pill
};

// The descriptor PDFium calls back through to read the file. One type shared by
// both callers, because the callback casts `m_Param` to it.
//
// ⚠️ PDFium keeps this pointer for the document's whole life, so it must outlive
// the FPDF_DOCUMENT — a local in the function that opened the document is a
// use-after-free waiting for the first render.
//
// ⚠️⚠️ It holds BYTES, not the shell's IStream, and that is not an optimisation
// — it is what stops Explorer hanging. The IStream a shell extension is handed
// is a proxy marshalled back to the calling process, and PDFium reads through
// this descriptor LAZILY: during LoadPage and RenderPageBitmap, long after the
// call that opened the document returned. In the preview handler those renders
// happen in WM_PAINT, so every lazy read became an outbound COM call into
// Explorer while Explorer was blocked waiting on us — the deadlock Windows
// logs as AppHangXProcB1 (2026-08-27). Copy the file in once, on the thread
// the shell called us on, then never touch the stream again.
struct PdfStreamAccess {
  FPDF_FILEACCESS file{};
  std::vector<unsigned char> bytes;
};

// Read a whole stream into memory, refusing anything absurd. `cap` is a
// ceiling, not a promise of virtue: a preview that declines a 400 MB file is a
// blank pane, which is recoverable; one that streams it is a hung Explorer.
HRESULT SlurpStream(IStream* stream, std::vector<unsigned char>* out);

// A document held open across several renders, for the preview pane — where the
// same file is drawn again on every resize and every page turn, and re-parsing
// it each time would be absurd.
class PdfDocument {
 public:
  PdfDocument() = default;
  ~PdfDocument() { Close(); }
  PdfDocument(const PdfDocument&) = delete;
  PdfDocument& operator=(const PdfDocument&) = delete;

  HRESULT Open(IStream* stream);
  void Close();

  bool IsOpen() const { return doc_ != nullptr; }
  int PageCount() const { return pages_; }

  /** One page's size in PDF points. False if the index is out of range. */
  bool PageSize(int index, double* out_w, double* out_h) const;

  // Renders one page fitted inside max_w x max_h onto opaque white. The caller
  // owns the returned HBITMAP.
  HBITMAP RenderPage(int index, int max_w, int max_h, int* out_w,
                     int* out_h) const;

 private:
  FPDF_DOCUMENT doc_ = nullptr;
  PdfStreamAccess access_{};
  int pages_ = 0;
};

// Renders page 1 of `stream` fitted inside cx x cx, with a sheet or two drawn
// behind it when the document has more pages. The caller owns the HBITMAP.
HRESULT RenderThumbnail(IStream* stream, UINT cx, Thumbnail* out);
