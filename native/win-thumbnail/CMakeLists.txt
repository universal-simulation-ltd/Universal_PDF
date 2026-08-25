# Universal PDF — Windows Explorer thumbnail provider.
#
# Builds UniversalPdfThumb.dll, an IThumbnailProvider shell extension that
# rasterises page 1 of a PDF with PDFium and stamps the app badge into the
# corner, plus thumbtest.exe, the harness that exercises it without Explorer.
#
# Works with MSVC (what CI uses) and MinGW (what the Windows dev box has).

cmake_minimum_required(VERSION 3.21)
project(UniversalPdfThumb LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---------------------------------------------------------------------------
# PDFium
#
# Only the headers are needed to COMPILE — every entry point is resolved with
# GetProcAddress at run time (see src/Pdfium.cpp), so nothing links against
# pdfium.dll.lib and the same source builds under either compiler. The DLL
# itself is staged next to ours because it has to ship.
# ---------------------------------------------------------------------------
set(PDFIUM_RELEASE "chromium/8021" CACHE STRING "pdfium-binaries release tag")
set(PDFIUM_ARCHIVE "" CACHE FILEPATH "Pre-downloaded pdfium-win-<arch>.tgz (offline builds)")

if(CMAKE_GENERATOR_PLATFORM MATCHES "^(ARM64|arm64)$" OR CMAKE_SYSTEM_PROCESSOR MATCHES "^(ARM64|arm64|aarch64)$")
  set(PDFIUM_ARCH "arm64")
elseif(CMAKE_SIZEOF_VOID_P EQUAL 8)
  set(PDFIUM_ARCH "x64")
else()
  # 64-bit Explorer will not load a 32-bit shell extension — it is not that the
  # thumbnail looks wrong, it is that nothing is ever called.
  message(FATAL_ERROR "A 32-bit build is useless as a shell extension; target x64 or ARM64.")
endif()

set(PDFIUM_SHA256_x64   "adac8ce034015427b5daa81f8eeddfcc8e84bc2a9f036f007890ff18bd4388c4")
set(PDFIUM_SHA256_arm64 "")  # filled when the ARM64 build is switched on

set(PDFIUM_DIR "${CMAKE_BINARY_DIR}/pdfium")
if(NOT EXISTS "${PDFIUM_DIR}/include/fpdfview.h")
  if(PDFIUM_ARCHIVE)
    set(_pdfium_tgz "${PDFIUM_ARCHIVE}")
  else()
    set(_pdfium_tgz "${CMAKE_BINARY_DIR}/pdfium-win-${PDFIUM_ARCH}.tgz")
    string(REPLACE "/" "%2F" _tag "${PDFIUM_RELEASE}")
    set(_url "https://github.com/bblanchon/pdfium-binaries/releases/download/${_tag}/pdfium-win-${PDFIUM_ARCH}.tgz")
    message(STATUS "Downloading ${_url}")
    if(PDFIUM_SHA256_${PDFIUM_ARCH})
      file(DOWNLOAD "${_url}" "${_pdfium_tgz}" SHOW_PROGRESS STATUS _dl
           EXPECTED_HASH "SHA256=${PDFIUM_SHA256_${PDFIUM_ARCH}}")
    else()
      file(DOWNLOAD "${_url}" "${_pdfium_tgz}" SHOW_PROGRESS STATUS _dl)
    endif()
    list(GET _dl 0 _dl_code)
    if(NOT _dl_code EQUAL 0)
      message(FATAL_ERROR "pdfium download failed: ${_dl}")
    endif()
  endif()
  file(MAKE_DIRECTORY "${PDFIUM_DIR}")
  file(ARCHIVE_EXTRACT INPUT "${_pdfium_tgz}" DESTINATION "${PDFIUM_DIR}")
endif()

set(PDFIUM_RUNTIME "${PDFIUM_DIR}/bin/pdfium.dll")
if(NOT EXISTS "${PDFIUM_RUNTIME}")
  message(FATAL_ERROR "pdfium.dll missing from ${PDFIUM_DIR}")
endif()

# ---------------------------------------------------------------------------
# Version stamp + badge art
#
# The badge is the same build/pdf-document.ico the file association uses, so
# the thumbnail's corner and the flat icon are visibly one product.
# ---------------------------------------------------------------------------
set(UNIPDF_VERSION "0.0.0" CACHE STRING "Version stamped into the DLL (pass the app's)")
string(REPLACE "." "," _v "${UNIPDF_VERSION}")
set(UNIPDF_VERSION_COMMA "${_v},0")
set(BADGE_ICO_PATH "${CMAKE_CURRENT_SOURCE_DIR}/../../build/pdf-document.ico")
if(NOT EXISTS "${BADGE_ICO_PATH}")
  message(FATAL_ERROR "Badge art missing: ${BADGE_ICO_PATH}")
endif()
get_filename_component(BADGE_ICO_PATH "${BADGE_ICO_PATH}" ABSOLUTE)
configure_file(src/UniversalPdfThumb.rc.in "${CMAKE_BINARY_DIR}/UniversalPdfThumb.rc" @ONLY)

# ---------------------------------------------------------------------------
# The shell extension
# ---------------------------------------------------------------------------
add_library(UniversalPdfThumb SHARED
  src/dllmain.cpp
  src/ThumbnailProvider.cpp
  src/Pdfium.cpp
  src/Badge.cpp
  src/Registration.cpp
  "${CMAKE_BINARY_DIR}/UniversalPdfThumb.rc"
)
set_target_properties(UniversalPdfThumb PROPERTIES PREFIX "" OUTPUT_NAME "UniversalPdfThumb")
target_include_directories(UniversalPdfThumb PRIVATE src "${PDFIUM_DIR}/include")
target_link_libraries(UniversalPdfThumb PRIVATE windowscodecs shlwapi ole32 oleaut32 uuid gdi32 gdiplus user32 advapi32)
target_compile_definitions(UniversalPdfThumb PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)

if(MSVC)
  target_compile_options(UniversalPdfThumb PRIVATE /W4 /permissive- /GS /guard:cf)
  target_link_options(UniversalPdfThumb PRIVATE /DEF:${CMAKE_CURRENT_SOURCE_DIR}/src/exports.def /GUARD:CF /DYNAMICBASE /NXCOMPAT)
else()
  target_compile_options(UniversalPdfThumb PRIVATE -Wall -Wextra -Wno-unknown-pragmas)
  # -static so the DLL never needs libstdc++-6.dll / libgcc_s_seh-1.dll on the
  # PATH — it is loaded by dllhost.exe, whose directory is system32.
  target_link_options(UniversalPdfThumb PRIVATE
    -static -static-libgcc -static-libstdc++
    "${CMAKE_CURRENT_SOURCE_DIR}/src/exports.def")
endif()

# ---------------------------------------------------------------------------
# Test harness
# ---------------------------------------------------------------------------
add_executable(thumbtest test/thumbtest.cpp)
target_include_directories(thumbtest PRIVATE src)
target_link_libraries(thumbtest PRIVATE windowscodecs shlwapi ole32 oleaut32 uuid gdi32 user32 advapi32)
target_compile_definitions(thumbtest PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
if(NOT MSVC)
  # -municode: the harness has a wmain, and MinGW's default startup looks for
  # main/WinMain and fails to link without it.
  target_compile_options(thumbtest PRIVATE -municode)
  target_link_options(thumbtest PRIVATE -municode -static -static-libgcc -static-libstdc++)
endif()

# pdfium.dll has to sit beside UniversalPdfThumb.dll — it is loaded by full
# path from our own directory, never off the PATH.
add_custom_command(TARGET UniversalPdfThumb POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_if_different "${PDFIUM_RUNTIME}" "$<TARGET_FILE_DIR:UniversalPdfThumb>/pdfium.dll")

install(TARGETS UniversalPdfThumb RUNTIME DESTINATION .)
install(FILES "${PDFIUM_RUNTIME}" DESTINATION .)
install(FILES "${PDFIUM_DIR}/LICENSE" DESTINATION . RENAME PDFIUM-LICENSE.txt)
