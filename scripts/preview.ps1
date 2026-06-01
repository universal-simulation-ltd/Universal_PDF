# Launch a local preview of Universal PDF (Vite + React 18, local-first PWA).
# Runs the dev server in the foreground — press Ctrl-C to stop.
# Windows equivalent of preview.sh.
#
# Usage:  .\scripts\preview.ps1 [port]     (default 5175)
#
# Default port is offset from Vite's 5173 so PDF / Webinar / Images / QR can
# run at the same time without clashing. First run installs deps if missing.

$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    $port = if ($args.Count -ge 1) { $args[0] } else { '5175' }

    if (-not (Test-Path 'node_modules')) {
        Write-Host "Installing dependencies (first run)..." -ForegroundColor Cyan
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    }

    Write-Host "Universal PDF -> http://localhost:$port" -ForegroundColor Green
    npm run dev -- --port $port
} finally {
    Pop-Location
}
