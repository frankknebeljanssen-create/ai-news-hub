#!/bin/bash
# Startet die Pipeline mit minimalem PATH (so wie launchd es auch tut).
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
# caffeinate -i verhindert, dass der Mac waehrend des Laufs in den Ruhezustand geht (sonst scheitern Kuratierungsaufrufe)
exec /usr/bin/caffeinate -i .venv/bin/python pipeline.py "$@"
