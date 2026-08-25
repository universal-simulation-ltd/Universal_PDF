// Shared declarations for the Universal PDF thumbnail provider.
#pragma once

#include <windows.h>
#include <objbase.h>
#include <shlwapi.h>
#include <thumbcache.h>
#include <propsys.h>

// Our COM server. Minted 2026-08-25; it is written into the installer's
// registry keys, so it must never change once a build has shipped.
// {9D3AE6B2-939A-47A9-A7F8-D30A6FC4C10F}
extern const CLSID CLSID_UniversalPdfThumbProvider;

// Declared locally rather than pulled from libuuid: the two compilers disagree
// about which import library carries them, and they are fixed constants.
extern const IID IID_IThumbnailProvider_;      // e357fccd-a995-4576-b01f-234630154e96
extern const IID IID_IInitializeWithStream_;   // b824b49d-22ac-4161-ac8a-9916e8fa3f7f

// The ShellEx subkey Explorer reads to find a thumbnail handler is the IID of
// IThumbnailProvider itself.
#define THUMBNAIL_HANDLER_KEY L"{e357fccd-a995-4576-b01f-234630154e96}"

// Must stay identical to build.fileAssociations[0].name in package.json,
// WIN_PROGID in electron/defaultApp.cjs, and the ProgID in build/installer.nsh.
#define UNIPDF_PROGID L"UniversalPDF.Document"

extern LONG g_cDllRef;

// --- tuning ------------------------------------------------------------------
// Below this the shell is really asking for an icon, and a badge would cover
// most of the page, so we render the page alone.
constexpr UINT kMinSizeForBadge = 48;
// Badge edge as a fraction of the page's shorter side, and its cap so a
// 1024px "jumbo" request does not get a 350px sticker.
constexpr double kBadgeFraction = 0.24;
constexpr UINT kBadgeMaxPx = 128;
constexpr double kBadgeMarginFraction = 0.03;

// The sheets fanned out behind page 1 on a multi-page document: one at two
// pages, two beyond that, none at one. Below kMinSizeForStack the fan is
// smaller than the page's own edge line, so it is dropped rather than drawn as
// mush. Each sheet turns kFanAngleDeg further about a pivot below the page,
// which is what makes it read as paper rather than as three offset rectangles.
constexpr UINT kMinSizeForStack = 64;
constexpr double kFanAngleDeg = 3.5;
constexpr double kFanPivotBelow = 0.55;  // pivot depth under the page, x page height

// The "52 pages" pill. Text has to survive being drawn at thumbnail scale, so
// it appears later than the fan does, and it carries a white ring: the pill
// lands wherever the page happens to be dark, and navy on navy is invisible.
constexpr UINT kMinSizeForCount = 112;
constexpr double kCountTextFraction = 0.085;

// The navy of the badge tile, so the pill reads as part of the same mark.
constexpr COLORREF kInk = RGB(17, 26, 46);

HRESULT CreateThumbnailProvider(REFIID riid, void** ppv);
