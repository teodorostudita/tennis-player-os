#!/bin/bash
set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTRACT_DIR=""
STAGE_DIR=""
PATCH_SOURCE=""

cleanup() {
  [ -n "${EXTRACT_DIR:-}" ] && [ -d "$EXTRACT_DIR" ] && rm -rf "$EXTRACT_DIR"
  [ -n "${STAGE_DIR:-}" ] && [ -d "$STAGE_DIR" ] && rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

pause_and_exit() {
  local code="${1:-0}"
  echo
  read -r -p "Premi Invio per chiudere..." _
  exit "$code"
}

is_component_folder() {
  case "$(basename "$1")" in
    assets|supabase|scripts|docs|tennis-player-os-site|.github)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

looks_like_patch_payload() {
  local dir="$1"
  [ -d "$dir/assets" ] ||
  [ -d "$dir/supabase" ] ||
  [ -d "$dir/scripts" ] ||
  [ -d "$dir/docs" ] ||
  [ -d "$dir/tennis-player-os-site" ] ||
  [ -d "$dir/.github" ] ||
  [ -f "$dir/index.html" ] ||
  [ -f "$dir/install.html" ] ||
  [ -f "$dir/server.py" ] ||
  [ -f "$dir/manifest.webmanifest" ] ||
  [ -f "$dir/offline.html" ] ||
  [ -f "$dir/sw.js" ] ||
  [ -f "$dir/Avvia Tennis Player OS.command" ] ||
  [ -f "$dir/Applica Patch.command" ] ||
  [ -f "$dir/Pubblica Tennis Player OS.command" ] ||
  [ -f "$dir/Configura Aruba FTP.command" ] ||
  [ -f "$dir/README.md" ] ||
  [ -f "$dir/RELEASE_LOG.md" ] ||
  [ -f "$dir/.gitignore" ]
}

is_strong_app_path() {
  case "$1" in
    assets/js/*|assets/css/*|supabase/*|scripts/*|docs/*|.github/*|\
    server.py|install.html|manifest.webmanifest|offline.html|sw.js|\
    companion.html|companion-privacy.html|roles-refresh.js|roles-refresh.css|\
    "Avvia Tennis Player OS.command"|"Applica Patch.command"|\
    "Pubblica Tennis Player OS.command"|"Configura Aruba FTP.command"|\
    RELEASE_LOG.md|README-PATCH.txt)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_site_fingerprint_at_app_root() {
  case "$1" in
    app.js|styles.css|beta-request.php|beta-status.php|beta-program.php|.htaccess|\
    assets/product-previews/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

echo "=========================================="
echo " Tennis Player OS — Applica Patch SAFE"
echo "=========================================="
echo
echo "App:"
echo "  $APP_DIR"
echo

# Guardrail 1: this launcher must live in the real TPOS repository root.
if [ ! -d "$APP_DIR/assets" ] || \
   [ ! -d "$APP_DIR/tennis-player-os-site" ] || \
   [ ! -f "$APP_DIR/index.html" ] || \
   [ ! -f "$APP_DIR/Pubblica Tennis Player OS.command" ]; then
  echo "ERRORE: questo command non sembra trovarsi nella root di Tennis Player OS."
  echo "Non applico nulla."
  pause_and_exit 1
fi

if [ "$#" -ge 1 ]; then
  PATCH_SOURCE="$1"
else
  PATCH_SOURCE="$(osascript <<'APPLESCRIPT'
try
  set chosenFile to choose file with prompt "Seleziona la patch di Tennis Player OS (.zip)"
  return POSIX path of chosenFile
on error number -128
  return ""
end try
APPLESCRIPT
)"
fi

if [ -z "$PATCH_SOURCE" ]; then
  echo "Operazione annullata."
  pause_and_exit 0
fi

if [ ! -e "$PATCH_SOURCE" ]; then
  echo "ERRORE: la patch non esiste:"
  echo "  $PATCH_SOURCE"
  pause_and_exit 1
fi

if [ -d "$PATCH_SOURCE" ]; then
  SOURCE_DIR="$PATCH_SOURCE"
else
  case "$PATCH_SOURCE" in
    *.zip|*.ZIP)
      EXTRACT_DIR="$(mktemp -d -t tpos_patch_extract)"
      echo "Estraggo la patch..."
      /usr/bin/ditto -x -k "$PATCH_SOURCE" "$EXTRACT_DIR" || {
        echo "ERRORE durante l'estrazione dello ZIP."
        pause_and_exit 1
      }
      SOURCE_DIR="$EXTRACT_DIR"
      ;;
    *)
      echo "ERRORE: usa una cartella oppure un file .zip."
      pause_and_exit 1
      ;;
  esac
fi

shopt -s dotglob nullglob
entries=("$SOURCE_DIR"/*)
shopt -u dotglob nullglob

# Unwrap only a genuine packaging wrapper, never a project component.
if [ "${#entries[@]}" -eq 1 ] && [ -d "${entries[0]}" ]; then
  candidate="${entries[0]}"
  if ! is_component_folder "$candidate" && looks_like_patch_payload "$candidate"; then
    SOURCE_DIR="$candidate"
  fi
fi

if ! looks_like_patch_payload "$SOURCE_DIR"; then
  echo "ERRORE: la sorgente non sembra una patch di Tennis Player OS."
  echo "Cartella rilevata:"
  echo "  $SOURCE_DIR"
  pause_and_exit 1
fi

# Work on a disposable sanitized staging copy, never on the selected source.
STAGE_DIR="$(mktemp -d -t tpos_patch_stage)"
/usr/bin/ditto "$SOURCE_DIR" "$STAGE_DIR" || {
  echo "ERRORE durante la preparazione della patch."
  pause_and_exit 1
}
find "$STAGE_DIR" -name '.DS_Store' -type f -delete 2>/dev/null || true
find "$STAGE_DIR" -name '__MACOSX' -type d -prune -exec rm -rf {} + 2>/dev/null || true

# Guardrail 2: patches must contain only ordinary files/directories.
if find "$STAGE_DIR" -type l -print -quit | grep -q .; then
  echo "ERRORE: la patch contiene link simbolici. Non applico nulla."
  pause_and_exit 1
fi
if find "$STAGE_DIR" ! -type f ! -type d -print -quit | grep -q .; then
  echo "ERRORE: la patch contiene elementi speciali non consentiti."
  pause_and_exit 1
fi

FILE_LIST="$(cd "$STAGE_DIR" && find . -type f | sed 's#^\./##' | sort)"
if [ -z "$FILE_LIST" ]; then
  echo "ERRORE: la patch non contiene file."
  pause_and_exit 1
fi

# Guardrail 3: classify APP vs SITO and forbid mixed/flattened site patches.
PATCH_KIND="APP"
if printf '%s\n' "$FILE_LIST" | grep -q '^tennis-player-os-site/'; then
  PATCH_KIND="SITO"
  BAD_MIX="$(printf '%s\n' "$FILE_LIST" | grep -v '^tennis-player-os-site/' || true)"
  if [ -n "$BAD_MIX" ]; then
    echo "ERRORE: patch mista APP/SITO."
    echo "I file del sito devono stare tutti sotto tennis-player-os-site/."
    echo "File fuori scope:"
    printf '%s\n' "$BAD_MIX" | sed 's/^/  • /'
    pause_and_exit 1
  fi
else
  STRONG_APP=0
  BAD_PATHS=""
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue

    if is_site_fingerprint_at_app_root "$rel"; then
      BAD_PATHS="${BAD_PATHS}${rel}"$'\n'
      continue
    fi

    if is_strong_app_path "$rel"; then
      STRONG_APP=1
    fi

    top="${rel%%/*}"
    if [ "$top" = "$rel" ]; then
      # A root file must already belong to TPOS, unless explicitly known above.
      if [ ! -e "$APP_DIR/$rel" ] && ! is_strong_app_path "$rel"; then
        BAD_PATHS="${BAD_PATHS}${rel}"$'\n'
      fi
    else
      # A top-level directory must already be part of the repository.
      if [ ! -d "$APP_DIR/$top" ]; then
        BAD_PATHS="${BAD_PATHS}${rel}"$'\n'
      fi
    fi
  done <<< "$FILE_LIST"

  if [ "$STRONG_APP" -ne 1 ]; then
    echo "ERRORE: patch APP non identificata con sufficiente sicurezza."
    echo "Per evitare di appiattire nuovamente il sito nella root TPOS, non applico nulla."
    pause_and_exit 1
  fi

  if [ -n "$BAD_PATHS" ]; then
    echo "ERRORE: la patch contiene percorsi sospetti o non appartenenti alla root TPOS:"
    printf '%s' "$BAD_PATHS" | sed '/^$/d; s/^/  • /'
    echo
    echo "Non applico nulla."
    pause_and_exit 1
  fi
fi

echo
echo "Tipo patch rilevato: $PATCH_KIND"
echo "File che verranno applicati:"
echo "------------------------------------------"
printf '%s\n' "$FILE_LIST" | sed 's/^/  • /'
COUNT="$(printf '%s\n' "$FILE_LIST" | awk 'NF{c++} END{print c+0}')"

echo
echo "Totale: $COUNT file"
echo
read -r -p "Applicare la patch? [Invio = sì / n = annulla] " answer
case "${answer:-}" in
  n|N|no|NO|No)
    echo "Operazione annullata."
    pause_and_exit 0
    ;;
esac

echo
echo "Applicazione in corso..."
/usr/bin/ditto "$STAGE_DIR" "$APP_DIR" || {
  echo
  echo "ERRORE durante l'applicazione della patch."
  pause_and_exit 1
}

for launcher in \
  "$APP_DIR/Avvia Tennis Player OS.command" \
  "$APP_DIR/Applica Patch.command" \
  "$APP_DIR/Pubblica Tennis Player OS.command" \
  "$APP_DIR/Configura Aruba FTP.command"
do
  [ -f "$launcher" ] && chmod +x "$launcher" 2>/dev/null || true
done

[ -f "$APP_DIR/scripts/deploy_marketing_site.py" ] \
  && chmod +x "$APP_DIR/scripts/deploy_marketing_site.py" 2>/dev/null || true

echo
echo "=========================================="
echo " PATCH APPLICATA CORRETTAMENTE"
echo "=========================================="
echo
echo "$COUNT file copiati/aggiornati."
if [ "$PATCH_KIND" = "SITO" ]; then
  echo "Sono stati toccati soltanto file sotto tennis-player-os-site/."
else
  echo "La patch è stata applicata alla APP; tennis-player-os-site non è stato toccato."
fi

pause_and_exit 0
