// Everything drawn on top of — or behind — the page render.
#pragma once

#include "Common.h"

// One sheet of the stack behind page 1: opaque paper plus the same hairline
// the front page gets. Drawn before the render, since the page is opaque and
// covers the part of the sheet it overlaps.
void DrawSheet(void* bits, UINT width, UINT height, const RECT& sheet);

// A hairline along the outside of a page. Without it a white page on a white
// Explorer background has no edge at all and reads as a hole.
void DrawPageEdge(void* bits, UINT width, UINT height, const RECT& page);

// Composites the app badge into the bottom-right corner of the page. A failure
// here is not fatal: the page render on its own is still a better thumbnail
// than the flat icon, so callers ignore the result.
HRESULT StampBadge(void* bits, UINT width, UINT height, const RECT& page);

// "52 pages" in a pill at the bottom-left, so a long document says so without
// being opened. Skipped for a single page and for thumbnails too small to read.
void DrawPageCount(HBITMAP bitmap, void* bits, UINT width, UINT height,
                   const RECT& page, int pages);
