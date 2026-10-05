#!/bin/bash
# Startet die Pipeline mit minimalem PATH (so wie launchd es auch tut).
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
exec .venv/bin/python pipeline.py "$@"
