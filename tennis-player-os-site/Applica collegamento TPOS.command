#!/bin/bash

set -u

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$PATCH_DIR"

pause_and_exit() {
  local code="${1:-0}"
  echo
  read -r -p "Premi Invio per chiudere..." _
  exit "$code"
}

echo "=========================================="
echo " Tennis Player OS Beta — Install Bridge"
echo "=========================================="
echo
echo "Questa patch modifica soltanto il collegamento dei CTA."
echo "Non tocca grafica, screenshot, moduli o traduzioni."
echo

if [ ! -f "$SITE_DIR/index.html" ]; then
  echo "ERRORE: index.html non trovato."
  echo
  echo "Metti questi file nella cartella principale del sito Beta,"
  echo "accanto a index.html, e rilancia questo comando."
  pause_and_exit 1
fi

if [ ! -f "$SITE_DIR/tpos-install-bridge.js" ]; then
  echo "ERRORE: tpos-install-bridge.js non trovato."
  pause_and_exit 1
fi

BACKUP="$SITE_DIR/index.before-install-bridge.html"
if [ ! -f "$BACKUP" ]; then
  cp "$SITE_DIR/index.html" "$BACKUP" || {
    echo "ERRORE: impossibile creare il backup di index.html."
    pause_and_exit 1
  }
  echo "Backup creato:"
  echo "  $(basename "$BACKUP")"
  echo
fi

if grep -q 'tpos-install-bridge\.js' "$SITE_DIR/index.html"; then
  echo "Il collegamento è già presente in index.html."
else
  python3 - "$SITE_DIR/index.html" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
html = path.read_text(encoding="utf-8")

script = '  <script src="./tpos-install-bridge.js" defer></script>\n'

if '</body>' not in html:
    raise SystemExit("ERRORE: tag </body> non trovato in index.html.")

html = html.replace('</body>', script + '</body>', 1)
path.write_text(html, encoding="utf-8")
PY

  if [ "$?" -ne 0 ]; then
    echo "ERRORE durante la modifica di index.html."
    pause_and_exit 1
  fi

  echo "Collegamento inserito in index.html."
fi

echo
echo "Destinazioni:"
echo "  Join/Prova la Beta → https://tennis.polidorionline.it/install.html"
echo "  Sign in / Accedi   → https://tennis.polidorionline.it/"
echo
echo "=========================================="
echo " PATCH SITO APPLICATA"
echo "=========================================="
echo
echo "Ora carica sul server:"
echo "  • index.html"
echo "  • tpos-install-bridge.js"
echo
echo "Il file di backup NON va caricato."

pause_and_exit 0
