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
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCT_NAME}"
  DeleteRegKey SHELL_CONTEXT "Software\Universal Simulation\Universal PDF"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.pdf\OpenWithProgids" "UniversalPDF.Document"
!macroend
