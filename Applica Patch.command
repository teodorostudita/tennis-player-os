#!/bin/bash

# Tennis Player OS — Applica Patch
# Posizionare questo file nella cartella principale dell'app.
# Accetta una patch .zip oppure una cartella già scompattata.

set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR=""
PATCH_SOURCE=""

cleanup() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}

trap cleanup EXIT

pause_and_exit() {
  local code="${1:-0}"
  echo
  read -r -p "Premi Invio per chiudere..." _
  exit "$code"
}

looks_like_tpos_patch() {
  local dir="$1"

  [ -d "$dir/assets" ] ||
  [ -d "$dir/supabase" ] ||
  [ -d "$dir/.github" ] ||
  [ -f "$dir/index.html" ] ||
  [ -f "$dir/server.py" ] ||
  [ -f "$dir/Avvia Tennis Player OS.command" ] ||
  [ -f "$dir/Applica Patch.command" ] ||
  [ -f "$dir/Pubblica Tennis Player OS.command" ] ||
  [ -f "$dir/README.md" ] ||
  [ -f "$dir/GITHUB_SETUP.md" ] ||
  [ -f "$dir/.gitignore" ]
}

echo "=========================================="
echo " Tennis Player OS — Applica Patch"
echo "=========================================="
echo
echo "App:"
echo "  $APP_DIR"
echo

# Se il file/cartella è stato trascinato sopra il launcher, Finder lo passa come argomento.
if [ "$#" -ge 1 ]; then
  PATCH_SOURCE="$1"
else
  # In assenza di argomenti, consente di scegliere uno ZIP dal Finder.
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

# Prepara la sorgente.
if [ -d "$PATCH_SOURCE" ]; then
  SOURCE_DIR="$PATCH_SOURCE"
else
  case "$PATCH_SOURCE" in
    *.zip|*.ZIP)
      TMP_DIR="$(mktemp -d -t tpos_patch)"
      echo "Estraggo la patch..."
      /usr/bin/ditto -x -k "$PATCH_SOURCE" "$TMP_DIR" || {
        echo "ERRORE durante l'estrazione dello ZIP."
        pause_and_exit 1
      }
      SOURCE_DIR="$TMP_DIR"
      ;;
    *)
      echo "ERRORE: usa una cartella oppure un file .zip."
      pause_and_exit 1
      ;;
  esac
fi

# Se lo ZIP contiene un'unica cartella contenitore, entra automaticamente in quella cartella.
shopt -s dotglob nullglob
entries=("$SOURCE_DIR"/*)
shopt -u dotglob nullglob

if [ "${#entries[@]}" -eq 1 ] && [ -d "${entries[0]}" ]; then
  candidate="${entries[0]}"
  if looks_like_tpos_patch "$candidate"; then
    SOURCE_DIR="$candidate"
  fi
fi

# Controllo minimo per evitare di copiare per sbaglio una cartella qualsiasi.
# Sono riconosciute anche patch infrastrutturali contenenti soltanto supabase/ o .github/.
if ! looks_like_tpos_patch "$SOURCE_DIR"; then
  echo "ERRORE: la sorgente non sembra una patch di Tennis Player OS."
  echo "Cartella rilevata:"
  echo "  $SOURCE_DIR"
  pause_and_exit 1
fi

echo
echo "File che verranno applicati:"
echo "------------------------------------------"

FILE_LIST="$(cd "$SOURCE_DIR" && find . -type f \
  ! -name '.DS_Store' \
  ! -path './__MACOSX/*' \
  | sed 's#^\./##' \
  | sort)"

if [ -z "$FILE_LIST" ]; then
  echo "ERRORE: la patch non contiene file."
  pause_and_exit 1
fi

echo "$FILE_LIST" | sed 's/^/  • /'

COUNT="$(printf "%s\n" "$FILE_LIST" | awk 'NF{c++} END{print c+0}')"

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

# ditto effettua un merge ricorsivo:
# - sovrascrive i file omonimi
# - aggiunge i file nuovi
# - NON elimina gli altri file presenti nell'app
/usr/bin/ditto "$SOURCE_DIR" "$APP_DIR" || {
  echo
  echo "ERRORE durante l'applicazione della patch."
  pause_and_exit 1
}

# Ripristina l'eseguibilità dei launcher se presenti.
for launcher in \
  "$APP_DIR/Avvia Tennis Player OS.command" \
  "$APP_DIR/Applica Patch.command" \
  "$APP_DIR/Pubblica Tennis Player OS.command"
do
  if [ -f "$launcher" ]; then
    chmod +x "$launcher" 2>/dev/null || true
  fi
done

echo
echo "=========================================="
echo " PATCH APPLICATA CORRETTAMENTE"
echo "=========================================="
echo
echo "$COUNT file copiati/aggiornati."
echo "Gli altri file dell'app non sono stati toccati."

pause_and_exit 0
