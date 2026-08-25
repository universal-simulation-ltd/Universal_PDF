; Windows "Default apps" registration.
;
; electron-builder's own fileAssociations handling registers the ProgID and the
; open command, which is enough for "Open with → Universal PDF". It is NOT
; enough to appear in Settings → Default apps: Windows lists applications from
; HKCU\Software\RegisteredApplications and reads their Capabilities key, and an
; app that is not there cannot be picked as the default for .pdf and cannot be
; deep-linked to with ms-settings:defaultapps?registeredAppUser=.
;
; ⚠️ This registers a CANDIDATE, and that is the most an installer is allowed to
; do. The association itself lives in the hash-protected UserChoice key, which
; only the user can set, from Settings. See electron/defaultApp.cjs.
;
; ⚠️ "UniversalPDF.Document" must stay identical to build.fileAssociations[0].name
; in package.json (electron-builder passes that string to NSIS as the file
; class) and to WIN_PROGID in electron/defaultApp.cjs, which reads UserChoice
; back to find out whether we are the default.

!macro customInstall
  ; Offer this ProgID for .pdf without seizing the extension.
  WriteRegStr SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "UniversalPDF.Document" ""

  WriteRegStr SHELL_CONTEXT "Software\Universal Simulation\Universal PDF\Capabilities" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Universal Simulation\Universal PDF\Capabilities" "ApplicationDescription" "Free and open-source PDF viewer and editor"
  WriteRegStr SHELL_CONTEXT "Software\Universal Simulation\Universal PDF\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Universal Simulation\Universal PDF\Capabilities\FileAssociations" ".pdf" "UniversalPDF.Document"

  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCT_NAME}" "Software\Universal Simulation\Universal PDF\Capabilities"

  ; --- Explorer thumbnails -----------------------------------------------
  ; Page 1 of the PDF with the app badge in the corner, drawn by the native
  ; IThumbnailProvider in native/win-thumbnail and staged into resources\.
  ;
  ; Registered against OUR ProgID, never against .pdf itself: there is one
  ; thumbnail handler per file class, so claiming the extension would take it
  ; from whichever reader the user actually chose. This way the thumbnails
  ; appear exactly when Universal PDF is the default app - the same line the
  ; OpenWithProgids entry above takes.
  ;
  ; DisableProcessIsolation is deliberately NOT written: with it absent the
  ; shell loads the handler inside dllhost.exe (COM Surrogate) instead of
  ; explorer.exe, so a crash in there is a notification, not a dead desktop.
  ;
  ; The CLSID must stay identical to CLSID_UniversalPdfThumbProvider in
  ; native/win-thumbnail/src/dllmain.cpp.
  IfFileExists "$INSTDIR\resources\UniversalPdfThumb.dll" 0 unipdf_no_thumbnail
    WriteRegStr SHELL_CONTEXT "Software\Classes\CLSID\{9D3AE6B2-939A-47A9-A7F8-D30A6FC4C10F}" "" "Universal PDF Thumbnail Provider"
    WriteRegStr SHELL_CONTEXT "Software\Classes\CLSID\{9D3AE6B2-939A-47A9-A7F8-D30A6FC4C10F}\InprocServer32" "" "$INSTDIR\resources\UniversalPdfThumb.dll"
    WriteRegStr SHELL_CONTEXT "Software\Classes\CLSID\{9D3AE6B2-939A-47A9-A7F8-D30A6FC4C10F}\InprocServer32" "ThreadingModel" "Apartment"
    WriteRegStr SHELL_CONTEXT "Software\Classes\UniversalPDF.Document\ShellEx\{e357fccd-a995-4576-b01f-234630154e96}" "" "{9D3AE6B2-939A-47A9-A7F8-D30A6FC4C10F}"

    ; An EMPTY TypeOverlay stops Explorer stamping its own app icon on top
    ; of the thumbnail. Without it the shell draws the UNI-SIM globe over
    ; the badge the provider already composited, half covering it - two
    ; marks in one corner, neither of them legible.
    WriteRegStr SHELL_CONTEXT "Software\Classes\UniversalPDF.Document" "TypeOverlay" ""

    ; The preview pane (Alt+P), which is a second COM object in the same DLL.
    ; ⚠️ The AppID is the shell's preview host: without it the handler is
    ; created in-process instead of in prevhost.exe and the pane stays blank,
    ; with no error surfaced anywhere. The CLSID must stay identical to
    ; CLSID_UniversalPdfPreviewHandler in native/win-thumbnail/src/dllmain.cpp.
    WriteRegStr SHELL_CONTEXT "Software\Classes\CLSID\{7A337FC1-F731-4F4F-A3FB-3E1935248DED}" "" "Universal PDF Preview Handler"
    WriteRegStr SHELL_CONTEXT "Software\Classes\CLSID\{7A337FC1-F731-4F4F-A3FB-3E1935248DED}" "AppID" "{534A1E02-D58F-44f0-B58B-36CBED287C7C}"
    WriteRegStr SHELL_CONTEXT "Software\Classes\CLSID\{7A337FC1-F731-4F4F-A3FB-3E1935248DED}\InprocServer32" "" "$INSTDIR\resources\UniversalPdfThumb.dll"
    WriteRegStr SHELL_CONTEXT "Software\Classes\CLSID\{7A337FC1-F731-4F4F-A3FB-3E1935248DED}\InprocServer32" "ThreadingModel" "Apartment"
    WriteRegStr SHELL_CONTEXT "Software\Classes\UniversalPDF.Document\ShellEx\{8895b1c6-b41f-4c1c-a562-0d564250836f}" "" "{7A337FC1-F731-4F4F-A3FB-3E1935248DED}"
    WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\PreviewHandlers" "{7A337FC1-F731-4F4F-A3FB-3E1935248DED}" "Universal PDF Preview Handler"
  unipdf_no_thumbnail:

!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCT_NAME}"
  DeleteRegKey SHELL_CONTEXT "Software\Universal Simulation\Universal PDF"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "UniversalPDF.Document"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\UniversalPDF.Document\ShellEx\{e357fccd-a995-4576-b01f-234630154e96}"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\UniversalPDF.Document" "TypeOverlay"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\UniversalPDF.Document\ShellEx\{8895b1c6-b41f-4c1c-a562-0d564250836f}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\CLSID\{7A337FC1-F731-4F4F-A3FB-3E1935248DED}"
  DeleteRegValue SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\PreviewHandlers" "{7A337FC1-F731-4F4F-A3FB-3E1935248DED}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\CLSID\{9D3AE6B2-939A-47A9-A7F8-D30A6FC4C10F}"

  ; The shell keeps a COM surrogate alive for a while after the last thumbnail,
  ; and while it holds the DLL the file cannot be deleted OR overwritten - which
  ; would otherwise fail the next upgrade, since this macro also runs when a new
  ; version uninstalls the old one first. Surrogates are stateless and restart
  ; on demand, so stopping them costs nothing; /REBOOTOK covers the rest.
  IfFileExists "$INSTDIR\resources\UniversalPdfThumb.dll" 0 unipdf_no_thumb_lock
    nsExec::Exec '"$SYSDIR\taskkill.exe" /f /im dllhost.exe'
    Delete /REBOOTOK "$INSTDIR\resources\UniversalPdfThumb.dll"
    Delete /REBOOTOK "$INSTDIR\resources\pdfium.dll"
  unipdf_no_thumb_lock:

!macroend
