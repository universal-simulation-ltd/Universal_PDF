// Shared declarations for the Universal PDF thumbnail provider.
#pragma once

#include <windows.h>
#include <objbase.h>
#include <shlwapi.h>
#include <thumbcache.h>
#include <propsys.h>

// Our two COM servers. Minted 2026-08-25; they are written into the installer's
// registry keys, so neither may change once a build has shipped.
// {9D3AE6B2-939A-47A9-A7F8-D30A6FC4C10F}
extern const CLSID CLSID_UniversalPdfThumbProvider;
// {7A337FC1-F731-4F4F-A3FB-3E1935248DED}
extern const CLSID CLSID_UniversalPdfPreviewHandler;

// Declared locally rather than pulled from libuuid: the two compilers disagree
// about which import library carries them, and they are fixed constants.
extern const IID IID_IThumbnailProvider_;      // e357fccd-a995-4576-b01f-234630154e96
extern const IID IID_IInitializeWithStream_;   // b824b49d-22ac-4161-ac8a-9916e8fa3f7f

// The ShellEx subkey Explorer reads to find a thumbnail handler is the IID of
// IThumbnailProvider itself; the preview pane's is the IID of IPreviewHandler.
#define THUMBNAIL_HANDLER_KEY L"{e357fccd-a995-4576-b01f-234630154e96}"
#define PREVIEW_HANDLER_KEY L"{8895b1c6-b41f-4c1c-a562-0d564250836f}"

// ⚠️ The AppID of the shell's preview host. A preview handler that does not
// carry it is created in-process instead of in prevhost.exe, and the pane
// stays blank with no error reported anywhere.
//
// ⚠️⚠️ There are TWO of these and they are not interchangeable:
//   {6d2b5079-2f0b-48dd-ab7f-97cec514d30b}  system32\prevhost.exe   — 64-bit
//   {534A1E02-D58F-44f0-B58B-36CBED287C7C}  SysWOW64\prevhost.exe   — 32-bit
// This DLL is x64 (a 32-bit shell extension is never loaded by 64-bit
// Explorer — see CMakeLists.txt), so it must name the 64-bit host. Naming the
// 32-bit one asks a 32-bit process to load a 64-bit DLL: the surrogate starts,
// the load fails, and the pane reports nothing at all. Shipped that way
// through v0.6.5.
#define PREVIEW_HOST_APPID L"{6d2b5079-2f0b-48dd-ab7f-97cec514d30b}"

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

// Below this the sheets are drawn as blank paper. Above it pages 2 and 3 are
// rendered for real — two extra renders inside the shell's budget, which is
// only worth spending where enough of them shows to tell. They are rendered at
// half the front page's resolution: barely a tenth of each sheet is visible,
// and it is being drawn at an angle.
constexpr UINT kMinSizeForSheetPreviews = 256;
constexpr double kSheetPreviewScale = 0.5;

// The "52 Pgs" pill. It is drawn exactly as tall as the badge and on the same
// margin, so the two read as a matched pair across the bottom of the page; the
// text is a fraction of THAT height, not of the page. It carries a white ring
// because the pill lands wherever the page happens to be dark, and navy on
// navy is invisible.
constexpr UINT kMinSizeForCount = 96;
constexpr double kCountTextFraction = 0.56;

// The navy of the badge tile, so the pill reads as part of the same mark.
constexpr COLORREF kInk = RGB(17, 26, 46);

HRESULT CreateThumbnailProvider(REFIID riid, void** ppv);
HRESULT CreatePreviewHandler(REFIID riid, void** ppv);
