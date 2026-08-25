// Layout, and everything drawn on top of — or behind — the page render.
#pragma once

#include "Common.h"

#include <vector>

// Where everything sits inside the bitmap. The front page stays upright; the
// sheets behind it fan out, pivoting near the bottom of the stack the way a
// real pile of paper does, so the whole composition is wider than the page and
// has to be measured before the bitmap is allocated.
struct Layout {
  int width = 0;
  int height = 0;
  RECT page{};        // the upright front page
  int sheets = 0;     // 0, 1 or 2
  double pivot_x = 0; // fan pivot, in bitmap coordinates
  double pivot_y = 0;
};

// Fits a page of the given aspect, plus its fan, inside a cx by cx box.
Layout ComputeLayout(double page_w, double page_h, UINT cx, int pages);

// A page rendered for one of the sheets behind page 1. Empty means "draw this
// sheet as blank paper", which is what happens below kMinSizeForSheetPreviews
// and whenever a page will not render.
struct SheetImage {
  int width = 0;
  int height = 0;
  std::vector<BYTE> pixels;  // BGRA, opaque, so premultiplied and straight agree
};

// The fanned sheets. Drawn before the front page, since that is opaque and
// covers the part of each sheet it overlaps. `previews[i]` backs the sheet
// `i + 1` steps behind the front — page 2, then page 3.
void DrawFan(void* bits, const Layout& layout, const SheetImage* previews,
             int preview_count);

// A hairline along the outside of the front page. Without it a white page on a
// white Explorer background has no edge at all and reads as a hole.
void DrawPageEdge(void* bits, UINT width, UINT height, const RECT& page);

// Composites the app badge into the bottom-right corner of the page. A failure
// here is not fatal: the page render on its own is still a better thumbnail
// than the flat icon, so callers ignore the result.
HRESULT StampBadge(void* bits, UINT width, UINT height, const RECT& page);

// "52 pages" in a pill at the bottom-left, so a long document says so without
// being opened. Skipped for a single page and for thumbnails too small to read.
void DrawPageCount(HBITMAP bitmap, void* bits, UINT width, UINT height,
                   const RECT& page, int pages);
