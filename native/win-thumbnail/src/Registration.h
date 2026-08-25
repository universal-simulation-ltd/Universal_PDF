#pragma once

#include "Common.h"

// Self-registration, HKCU only — it needs no elevation and matches the app's
// per-user install. The NSIS installer writes the same keys directly rather
// than shelling out to regsvr32; these entry points exist so a developer can
// register a freshly built DLL in one command.
HRESULT RegisterProvider();
HRESULT UnregisterProvider();
