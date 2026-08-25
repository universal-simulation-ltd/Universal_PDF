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

// Renders page 1 of `stream` fitted inside cx x cx, with a sheet or two drawn
// behind it when the document has more pages. The caller owns the HBITMAP.
HRESULT RenderThumbnail(IStream* stream, UINT cx, Thumbnail* out);
