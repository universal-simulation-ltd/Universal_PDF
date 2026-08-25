#!/usr/bin/env bash
# Builds the Explorer thumbnail provider from a POSIX shell.
#
#   native/win-thumbnail/scripts/build.sh [Release|Debug]
#
# The target is a Windows shell extension, so this only does anything under
# Git Bash / MSYS on Windows — there is no macOS or Linux equivalent to build.
# On macOS, QuickLook already thumbnails PDFs and nothing needs installing.
set -euo pipefail

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) ;;
  Darwin)
    echo "Nothing to build on macOS: QuickLook already renders PDF thumbnails." >&2
    exit 0
    ;;
  *)
    echo "The thumbnail provider is a Windows shell extension; nothing to build here." >&2
    exit 0
    ;;
esac

config="${1:-Release}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="$(cd "$here/../.." && pwd)"
build="$here/build-x64"
dist="$here/dist"

version="$(node -p "require('$repo/package.json').version")"
echo "Universal PDF $version - thumbnail provider (x64 $config)"

cmake_bin="$(command -v cmake || true)"
if [ -z "$cmake_bin" ]; then
  cmake_bin="$(ls -d /d/Qt/cmake/cmake-*/bin/cmake.exe 2>/dev/null | sort | tail -1 || true)"
fi
[ -n "$cmake_bin" ] || { echo "cmake not found on PATH or under D:/Qt/cmake" >&2; exit 1; }

extra=()
if ! command -v cl.exe >/dev/null 2>&1; then
  mingw="/d/Qt/Tools/mingw1310_64/bin"
  [ -d "$mingw" ] || { echo "No MSVC, and no MinGW toolchain at $mingw" >&2; exit 1; }
  export PATH="$mingw:$PATH"
  extra+=(-G Ninja "-DCMAKE_BUILD_TYPE=$config")
  [ -f /d/Qt/Tools/Ninja/ninja.exe ] && extra+=("-DCMAKE_MAKE_PROGRAM=/d/Qt/Tools/Ninja/ninja.exe")
fi

"$cmake_bin" -S "$here" -B "$build" "-DUNIPDF_VERSION=$version" "${extra[@]}"
"$cmake_bin" --build "$build" --config "$config"

# Only the build products: dist/.gitignore is what keeps this directory
# present in a fresh clone, so extraResources always has a source.
rm -f "$dist"/*.dll "$dist"/*.txt 2>/dev/null || true
"$cmake_bin" --install "$build" --config "$config" --prefix "$dist"
ls -la "$dist"
echo "staged in $dist"
