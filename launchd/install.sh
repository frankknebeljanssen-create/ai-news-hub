#!/bin/bash
# Installiert (oder aktualisiert) den launchd-Job. Entfernen: launchd/install.sh --uninstall
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL=com.frank.ai-news-hub
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
if [ "$1" = "--uninstall" ]; then rm -f "$DEST"; echo "Entfernt."; exit 0; fi
sed -e "s#__REPO__#$REPO#g" -e "s#__HOME__#$HOME#g" "$REPO/launchd/$LABEL.plist.template" > "$DEST"
plutil -lint "$DEST" >/dev/null
launchctl bootstrap "$DOMAIN" "$DEST"
echo "Installiert: $DEST"
launchctl print "$DOMAIN/$LABEL" | grep -E 'state|run interval|runs' | head -5
