#!/usr/bin/env bash
# electron-builder shells out to a bare `python` (via its plist tooling). macOS
# has shipped only `python3` since 12.3, so on a stock Mac that call finds
# nothing and packaging dies AFTER signing and notarization have already
# succeeded — the confusing half of the failure.
#
# ⚠️ Homebrew's pythons are NOT the fix, though they look like the obvious one.
# Both python@3.12 and python@3.14 here import `pyexpat` against the system
# /usr/lib/libexpat.1.dylib and abort:
#     Symbol not found: _XML_SetAllocTrackerActivationThreshold
# and electron-builder needs pyexpat specifically, because plistlib parses XML.
# Apple's /usr/bin/python3 has a working pyexpat (2.2.8) and is the one to use.
#
# ⚠️ A symlink named `python` -> /usr/bin/python3 does NOT work: /usr/bin/python3
# is a stub that dispatches on argv[0], so called as `python` it hunts for a
# Command Line Tools binary of that name and fails with
#     xcode-select: Failed to locate 'python'
# It has to be a wrapper script that execs python3 by its real name.
#
# Does nothing when a working `python` is already on PATH (CI runners have one),
# so this is a no-op everywhere except the machine that needs it.
set -euo pipefail

if ! command -v python >/dev/null 2>&1; then
  if [ -x /usr/bin/python3 ] && /usr/bin/python3 -c 'import pyexpat' >/dev/null 2>&1; then
    shim="$(mktemp -d)"
    printf '#!/bin/sh\nexec /usr/bin/python3 "$@"\n' > "$shim/python"
    chmod +x "$shim/python"
    export PATH="$shim:$PATH"
    trap 'rm -rf "$shim"' EXIT
  else
    echo "with-python.sh: no working 'python' found and /usr/bin/python3 is unusable." >&2
    echo "  electron-builder needs a python with a working pyexpat module." >&2
    exit 1
  fi
fi

exec "$@"
