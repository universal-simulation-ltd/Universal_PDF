#!/usr/bin/env node
// The phone apps' web bundle: the desktop build (`--mode desktop`: base `./`,
// no service worker) plus every OCR language model, so OCR works offline
// (James, 2026-10-20: the phone apps are fully offline). `PDF_OCR_MODELS` is
// read by `ocrModels()` in vite.config.ts.
//
//   npm run build:mobile        (npm run cap:sync runs it for you)
//
// A Node script rather than `PDF_OCR_MODELS=bundle npm run …` in package.json,
// because that spelling doesn't run in Windows' shell.
import { spawnSync } from 'node:child_process'

const r = spawnSync('npm', ['run', 'build:desktop'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PDF_OCR_MODELS: 'bundle' },
})
process.exit(r.status ?? 1)
