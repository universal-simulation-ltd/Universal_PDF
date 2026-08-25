# Builds the Explorer thumbnail provider and stages it for electron-builder.
#
#   pwsh native/win-thumbnail/scripts/build.ps1
#
# Output lands in native/win-thumbnail/dist/, which package.json picks up as a
# Windows extraResources entry. If that folder is empty the installer is still
# valid — it just ships without thumbnails — so a dev box with no C++ toolchain
# can still run `npm run dist:win`.

[CmdletBinding()]
param(
  [ValidateSet('Release', 'Debug')][string]$Config = 'Release',
  [ValidateSet('x64', 'ARM64')][string]$Arch = 'x64',
  [string]$PdfiumArchive = ''   # a pre-downloaded pdfium-win-<arch>.tgz, for offline builds
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSScriptRoot
$repo = Resolve-Path (Join-Path $here '..\..')
$build = Join-Path $here "build-$Arch"
$dist = Join-Path $here 'dist'

$version = (Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
Write-Host "Universal PDF $version - thumbnail provider ($Arch $Config)"

function Find-Cmake {
  $cmd = Get-Command cmake -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  # The Windows dev box has no Visual Studio; CMake comes with the Qt tooling.
  $qt = Get-ChildItem 'D:\Qt\cmake' -Filter 'cmake-*' -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
  if ($qt) {
    $exe = Join-Path $qt.FullName 'bin\cmake.exe'
    if (Test-Path $exe) { return $exe }
  }
  throw 'cmake not found on PATH or under D:\Qt\cmake'
}

$cmake = Find-Cmake
$args = @('-S', $here, '-B', $build, "-DUNIPDF_VERSION=$version")
if ($PdfiumArchive) { $args += "-DPDFIUM_ARCHIVE=$PdfiumArchive" }

# MSVC where it exists (that is CI), the MinGW toolchain otherwise (that is the
# Windows dev box). The source is the same either way.
$hasMsvc = $null -ne (Get-Command cl.exe -ErrorAction SilentlyContinue) -or
           (Test-Path 'C:\Program Files\Microsoft Visual Studio\*\*\VC\Tools\MSVC')
if ($hasMsvc) {
  $args += @('-A', $Arch)
} else {
  $mingw = 'D:\Qt\Tools\mingw1310_64\bin'
  $ninja = 'D:\Qt\Tools\Ninja\ninja.exe'
  if (-not (Test-Path $mingw)) { throw "No MSVC, and the MinGW toolchain is missing at $mingw" }
  if ($Arch -ne 'x64') { throw "The MinGW fallback only builds x64; $Arch needs MSVC." }
  $env:PATH = "$mingw;$env:PATH"
  $args += @('-G', 'Ninja', "-DCMAKE_BUILD_TYPE=$Config")
  if (Test-Path $ninja) { $args += "-DCMAKE_MAKE_PROGRAM=$ninja" }
}

& $cmake @args
if ($LASTEXITCODE -ne 0) { throw 'cmake configure failed' }

& $cmake --build $build --config $Config
if ($LASTEXITCODE -ne 0) { throw 'build failed' }

# -Exclude .gitignore: that file is what keeps this directory present in a
# fresh clone, so electron-builder's extraResources source always exists.
if (Test-Path $dist) { Get-ChildItem $dist -File -Exclude '.gitignore' | Remove-Item -Force }
& $cmake --install $build --config $Config --prefix $dist
if ($LASTEXITCODE -ne 0) { throw 'install failed' }

Get-ChildItem $dist -File | ForEach-Object { '  {0,-28} {1,10:N0} bytes' -f $_.Name, $_.Length }
Write-Host "staged in $dist"
