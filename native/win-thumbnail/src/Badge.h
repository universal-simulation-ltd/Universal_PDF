// The corner badge and the page edge — everything drawn on top of the render.
#pragma once

#include "Common.h"

// Composites the app badge into the bottom-right corner of a 32-bit top-down
// BGRA buffer. A failure here is not fatal: the page render on its own is
// still a better thumbnail than the flat icon, so callers ignore the result.
HRESULT StampBadge(void* bits, UINT width, UINT height);

// A hairline along the outside of the page. Without it a white page on a white
// Explorer background has no edge at all and reads as a hole.
void DrawPageEdge(void* bits, UINT width, UINT height);
