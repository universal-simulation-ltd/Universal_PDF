#include "Registration.h"

#include <shlobj.h>

namespace {

void ModuleAnchor() {}

HRESULT SetString(HKEY root, const wchar_t* subkey, const wchar_t* name,
                  const wchar_t* value) {
  HKEY key = nullptr;
  LONG rc = RegCreateKeyExW(root, subkey, 0, nullptr, REG_OPTION_NON_VOLATILE,
                            KEY_SET_VALUE, nullptr, &key, nullptr);
  if (rc != ERROR_SUCCESS) return HRESULT_FROM_WIN32(rc);
  rc = RegSetValueExW(key, name, 0, REG_SZ,
                      reinterpret_cast<const BYTE*>(value),
                      static_cast<DWORD>((lstrlenW(value) + 1) * sizeof(wchar_t)));
  RegCloseKey(key);
  return HRESULT_FROM_WIN32(rc);
}

bool ClsidText(wchar_t (&out)[64]) {
  return StringFromGUID2(CLSID_UniversalPdfThumbProvider, out, 64) != 0;
}

}  // namespace

HRESULT RegisterProvider() {
  wchar_t clsid[64];
  if (!ClsidText(clsid)) return E_FAIL;

  HMODULE self = nullptr;
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                              GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                          reinterpret_cast<LPCWSTR>(&ModuleAnchor), &self)) {
    return HRESULT_FROM_WIN32(GetLastError());
  }
  wchar_t module_path[MAX_PATH];
  const DWORD n = GetModuleFileNameW(self, module_path, MAX_PATH);
  if (n == 0 || n >= MAX_PATH) return E_FAIL;

  wchar_t key[256];
  wsprintfW(key, L"Software\\Classes\\CLSID\\%s", clsid);
  HRESULT hr = SetString(HKEY_CURRENT_USER, key, nullptr,
                         L"Universal PDF Thumbnail Provider");
  if (FAILED(hr)) return hr;

  wsprintfW(key, L"Software\\Classes\\CLSID\\%s\\InprocServer32", clsid);
  hr = SetString(HKEY_CURRENT_USER, key, nullptr, module_path);
  if (FAILED(hr)) return hr;
  hr = SetString(HKEY_CURRENT_USER, key, L"ThreadingModel", L"Apartment");
  if (FAILED(hr)) return hr;

  // DisableProcessIsolation is deliberately NOT written. With it absent the
  // shell hosts us in dllhost.exe, so a crash in here is a COM Surrogate
  // notification rather than the user's desktop disappearing.

  // Hung off our own ProgID, never off .pdf: there is one thumbnail handler
  // per file class, and claiming the extension would take it from whichever
  // reader the user actually chose. This way our thumbnails appear exactly
  // when Universal PDF is the default app — the same line the installer takes
  // with OpenWithProgids.
  wsprintfW(key, L"Software\\Classes\\%s\\ShellEx\\%s", UNIPDF_PROGID,
            THUMBNAIL_HANDLER_KEY);
  hr = SetString(HKEY_CURRENT_USER, key, nullptr, clsid);
  if (FAILED(hr)) return hr;

  // An EMPTY TypeOverlay stops Explorer stamping its own app icon onto the
  // thumbnail. Left unset, the shell draws the application's globe over the
  // badge this provider already composited, half covering it — two marks in
  // one corner, neither legible. Confirmed by capturing a real Explorer window
  // with and without it.
  hr = SetString(HKEY_CURRENT_USER, L"Software\\Classes\\" UNIPDF_PROGID,
                 L"TypeOverlay", L"");
  if (FAILED(hr)) return hr;

  // --- the preview handler ------------------------------------------------
  wchar_t preview[64];
  if (StringFromGUID2(CLSID_UniversalPdfPreviewHandler, preview, 64) == 0) {
    return E_FAIL;
  }

  wsprintfW(key, L"Software\\Classes\\CLSID\\%s", preview);
  hr = SetString(HKEY_CURRENT_USER, key, nullptr,
                 L"Universal PDF Preview Handler");
  if (FAILED(hr)) return hr;
  // ⚠️ The AppID of the shell's preview host. Without it the handler is created
  // in-process instead of in prevhost.exe and the pane stays blank, with no
  // error surfaced anywhere — the single most common way this silently fails.
  hr = SetString(HKEY_CURRENT_USER, key, L"AppID", PREVIEW_HOST_APPID);
  if (FAILED(hr)) return hr;

  wsprintfW(key, L"Software\\Classes\\CLSID\\%s\\InprocServer32", preview);
  hr = SetString(HKEY_CURRENT_USER, key, nullptr, module_path);
  if (FAILED(hr)) return hr;
  hr = SetString(HKEY_CURRENT_USER, key, L"ThreadingModel", L"Apartment");
  if (FAILED(hr)) return hr;

  wsprintfW(key, L"Software\\Classes\\%s\\ShellEx\\%s", UNIPDF_PROGID,
            PREVIEW_HANDLER_KEY);
  hr = SetString(HKEY_CURRENT_USER, key, nullptr, preview);
  if (FAILED(hr)) return hr;

  // The shell also keeps a flat list of preview handlers, and one that is not
  // in it is not offered.
  hr = SetString(HKEY_CURRENT_USER,
                 L"Software\\Microsoft\\Windows\\CurrentVersion\\PreviewHandlers",
                 preview, L"Universal PDF Preview Handler");
  if (FAILED(hr)) return hr;

  SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
  return S_OK;
}

HRESULT UnregisterProvider() {
  wchar_t clsid[64];
  if (!ClsidText(clsid)) return E_FAIL;

  wchar_t key[256];
  wsprintfW(key, L"Software\\Classes\\%s\\ShellEx\\%s", UNIPDF_PROGID,
            THUMBNAIL_HANDLER_KEY);
  RegDeleteKeyW(HKEY_CURRENT_USER, key);

  wsprintfW(key, L"Software\\Classes\\%s", UNIPDF_PROGID);
  HKEY progid = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, key, 0, KEY_SET_VALUE, &progid) ==
      ERROR_SUCCESS) {
    RegDeleteValueW(progid, L"TypeOverlay");
    RegCloseKey(progid);
  }

  wsprintfW(key, L"Software\\Classes\\CLSID\\%s", clsid);
  RegDeleteTreeW(HKEY_CURRENT_USER, key);

  wchar_t preview[64];
  if (StringFromGUID2(CLSID_UniversalPdfPreviewHandler, preview, 64) != 0) {
    wsprintfW(key, L"Software\\Classes\\%s\\ShellEx\\%s", UNIPDF_PROGID,
              PREVIEW_HANDLER_KEY);
    RegDeleteKeyW(HKEY_CURRENT_USER, key);

    wsprintfW(key, L"Software\\Classes\\CLSID\\%s", preview);
    RegDeleteTreeW(HKEY_CURRENT_USER, key);

    HKEY handlers = nullptr;
    if (RegOpenKeyExW(HKEY_CURRENT_USER,
                      L"Software\\Microsoft\\Windows\\CurrentVersion\\PreviewHandlers",
                      0, KEY_SET_VALUE, &handlers) == ERROR_SUCCESS) {
      RegDeleteValueW(handlers, preview);
      RegCloseKey(handlers);
    }
  }

  SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
  return S_OK;
}
