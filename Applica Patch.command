#!/bin/bash
set -u
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR=""; PATCH_SOURCE=""
cleanup(){ [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ] && rm -rf "$TMP_DIR"; }
trap cleanup EXIT
pause_and_exit(){ local code="${1:-0}"; echo; read -r -p "Premi Invio per chiudere..." _; exit "$code"; }
looks_like_tpos_patch(){ local dir="$1"; [ -d "$dir/assets" ] || [ -d "$dir/supabase" ] || [ -d "$dir/scripts" ] || [ -d "$dir/tennis-player-os-site" ] || [ -d "$dir/.github" ] || [ -f "$dir/index.html" ] || [ -f "$dir/server.py" ] || [ -f "$dir/Avvia Tennis Player OS.command" ] || [ -f "$dir/Applica Patch.command" ] || [ -f "$dir/Pubblica Tennis Player OS.command" ] || [ -f "$dir/Configura Aruba FTP.command" ] || [ -f "$dir/README.md" ] || [ -f "$dir/GITHUB_SETUP.md" ] || [ -f "$dir/.gitignore" ]; }
echo "=========================================="; echo " Tennis Player OS — Applica Patch"; echo "=========================================="; echo; echo "App:"; echo "  $APP_DIR"; echo
if [ "$#" -ge 1 ]; then PATCH_SOURCE="$1"; else PATCH_SOURCE="$(osascript <<'APPLESCRIPT'
try
  set chosenFile to choose file with prompt "Seleziona la patch di Tennis Player OS (.zip)"
  return POSIX path of chosenFile
on error number -128
  return ""
end try
APPLESCRIPT
)"; fi
[ -n "$PATCH_SOURCE" ] || { echo "Operazione annullata."; pause_and_exit 0; }
[ -e "$PATCH_SOURCE" ] || { echo "ERRORE: la patch non esiste:"; echo "  $PATCH_SOURCE"; pause_and_exit 1; }
if [ -d "$PATCH_SOURCE" ]; then SOURCE_DIR="$PATCH_SOURCE"; else case "$PATCH_SOURCE" in *.zip|*.ZIP) TMP_DIR="$(mktemp -d -t tpos_patch)"; echo "Estraggo la patch..."; /usr/bin/ditto -x -k "$PATCH_SOURCE" "$TMP_DIR" || { echo "ERRORE durante l'estrazione dello ZIP."; pause_and_exit 1; }; SOURCE_DIR="$TMP_DIR";; *) echo "ERRORE: usa una cartella oppure un file .zip."; pause_and_exit 1;; esac; fi
shopt -s dotglob nullglob; entries=("$SOURCE_DIR"/*); shopt -u dotglob nullglob
if [ "${#entries[@]}" -eq 1 ] && [ -d "${entries[0]}" ]; then candidate="${entries[0]}"; looks_like_tpos_patch "$candidate" && SOURCE_DIR="$candidate"; fi
looks_like_tpos_patch "$SOURCE_DIR" || { echo "ERRORE: la sorgente non sembra una patch di Tennis Player OS."; echo "  $SOURCE_DIR"; pause_and_exit 1; }
echo; echo "File che verranno applicati:"; echo "------------------------------------------"
FILE_LIST="$(cd "$SOURCE_DIR" && find . -type f ! -name '.DS_Store' ! -path './__MACOSX/*' | sed 's#^\./##' | sort)"
[ -n "$FILE_LIST" ] || { echo "ERRORE: la patch non contiene file."; pause_and_exit 1; }
echo "$FILE_LIST" | sed 's/^/  • /'; COUNT="$(printf "%s\n" "$FILE_LIST" | awk 'NF{c++} END{print c+0}')"; echo; echo "Totale: $COUNT file"; echo
read -r -p "Applicare la patch? [Invio = sì / n = annulla] " answer
case "${answer:-}" in n|N|no|NO|No) echo "Operazione annullata."; pause_and_exit 0;; esac
echo; echo "Applicazione in corso..."; /usr/bin/ditto "$SOURCE_DIR" "$APP_DIR" || { echo; echo "ERRORE durante l'applicazione della patch."; pause_and_exit 1; }
for launcher in "$APP_DIR/Avvia Tennis Player OS.command" "$APP_DIR/Applica Patch.command" "$APP_DIR/Pubblica Tennis Player OS.command" "$APP_DIR/Configura Aruba FTP.command"; do [ -f "$launcher" ] && chmod +x "$launcher" 2>/dev/null || true; done
[ -f "$APP_DIR/scripts/deploy_marketing_site.py" ] && chmod +x "$APP_DIR/scripts/deploy_marketing_site.py" 2>/dev/null || true
echo; echo "=========================================="; echo " PATCH APPLICATA CORRETTAMENTE"; echo "=========================================="; echo; echo "$COUNT file copiati/aggiornati."; echo "Gli altri file dell'app non sono stati toccati."; pause_and_exit 0
