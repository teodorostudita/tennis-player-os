#!/bin/bash
set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR" || exit 1

FTP_HOST="ftp.polidorionline.it"
FTP_PORT="21"
FTP_USER="17983806@aruba.it"
FTP_REMOTE_DIR="/www.polidorionline.it/tennis-player-os-site"
FTP_KEYCHAIN_SERVICE="Tennis Player OS - Aruba FTP"
MARKETING_CHANGES_FILE="${TMPDIR:-/tmp}/tpos-marketing-changes.$$"

: > "$MARKETING_CHANGES_FILE"
trap 'rm -f "$MARKETING_CHANGES_FILE"' EXIT

pause_and_exit() {
  local code="${1:-0}"
  echo
  read -r -p "Premi Invio per chiudere..." _
  exit "$code"
}

fail() {
  echo
  echo "=========================================="
  echo " PUBBLICAZIONE INTERROTTA"
  echo "=========================================="
  echo "$1"
  echo
  echo "Copia questo output in ChatGPT: controlleremo solo il punto che non è andato a buon fine."
  pause_and_exit 1
}

collect_marketing_changes() {
  : > "$MARKETING_CHANGES_FILE"

  [ -d "$APP_DIR/tennis-player-os-site" ] || return 0

  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    {
      git diff --name-only HEAD -- tennis-player-os-site 2>/dev/null || true
      git ls-files --others --exclude-standard -- tennis-player-os-site 2>/dev/null || true
    } \
      | sed -n 's#^tennis-player-os-site/##p' \
      | awk 'NF' \
      | sort -u \
      > "$MARKETING_CHANGES_FILE"
  else
    find "$APP_DIR/tennis-player-os-site" -type f \
      | sed "s#^$APP_DIR/tennis-player-os-site/##" \
      | sort -u \
      > "$MARKETING_CHANGES_FILE"
  fi
}

deploy_marketing_site() {
  [ -d "$APP_DIR/tennis-player-os-site" ] || {
    echo "Sito marketing non presente: deploy Aruba saltato."
    return 0
  }

  if [ ! -s "$MARKETING_CHANGES_FILE" ]; then
    echo
    echo "Sito marketing invariato: deploy Aruba saltato."
    return 0
  fi

  command -v python3 >/dev/null 2>&1 \
    || fail "Python 3 non è disponibile: non posso sincronizzare il sito Aruba."
  command -v security >/dev/null 2>&1 \
    || fail "Il Portachiavi macOS non è disponibile."

  FTP_PASSWORD="$(security find-generic-password -a "$FTP_USER" -s "$FTP_KEYCHAIN_SERVICE" -w 2>/dev/null || true)"
  [ -n "$FTP_PASSWORD" ] \
    || fail "Password FTP non configurata. Esegui una sola volta «Configura Aruba FTP.command», poi rilancia questa pubblicazione."

  echo
  echo "Sincronizzo SOLO i file modificati del sito marketing su Aruba..."
  echo "  ftp://$FTP_HOST$FTP_REMOTE_DIR/"
  echo

  export TPOS_FTP_PASSWORD="$FTP_PASSWORD"
  python3 "$APP_DIR/scripts/deploy_marketing_site.py" \
    --host "$FTP_HOST" \
    --port "$FTP_PORT" \
    --user "$FTP_USER" \
    --remote-dir "$FTP_REMOTE_DIR" \
    --local-dir "$APP_DIR/tennis-player-os-site" \
    --changed-list "$MARKETING_CHANGES_FILE" \
    || {
      unset TPOS_FTP_PASSWORD
      unset FTP_PASSWORD
      fail "Deploy del sito marketing su Aruba non riuscito."
    }

  unset TPOS_FTP_PASSWORD
  unset FTP_PASSWORD
  echo "  Sito marketing aggiornato in modo incrementale."
}

echo "=========================================="
echo " Tennis Player OS — Pubblicazione automatica"
echo "=========================================="
echo
echo "Cartella:"
echo "  $APP_DIR"
echo

command -v git >/dev/null 2>&1 || fail "Git non è disponibile su questo Mac."

if [ ! -d ".git" ]; then
  echo "Prima inizializzazione Git..."
  git init || fail "Impossibile inizializzare Git."
  git branch -M main || fail "Impossibile impostare il branch main."
fi

current_branch="$(git branch --show-current 2>/dev/null || true)"
if [ -z "$current_branch" ]; then
  git checkout -b main || fail "Impossibile creare il branch main."
elif [ "$current_branch" != "main" ]; then
  echo "Passo al branch main..."
  git checkout main 2>/dev/null \
    || git branch -M main \
    || fail "Impossibile passare al branch main."
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Il repository GitHub non è ancora collegato."
  echo
  read -r -p "Incolla l'URL HTTPS del repository GitHub: " REPO_URL
  [ -n "${REPO_URL:-}" ] || fail "Nessun URL GitHub inserito."
  git remote add origin "$REPO_URL" \
    || fail "Impossibile configurare il repository GitHub."
fi

echo "Repository:"
echo "  $(git remote get-url origin)"
echo

if git ls-files --error-unmatch "tennis-player-os-site/mail-config.php" >/dev/null 2>&1; then
  echo "Protezione credenziali: rimuovo mail-config.php dal tracciamento Git..."
  git rm --cached --quiet "tennis-player-os-site/mail-config.php" \
    || fail "Non sono riuscito a rimuovere mail-config.php dall'indice Git."
  echo "  Il file resta presente sul Mac e non verrà toccato su Aruba."
  echo
fi

# Snapshot dei soli file marketing realmente modificati PRIMA del commit.
# Il file temporaneo resta disponibile fino alla fine del comando, così dopo
# il push possiamo fare un deploy FTP incrementale invece di ricaricare tutto.
collect_marketing_changes

STATUS="$(git status --porcelain)"
if [ -z "$STATUS" ]; then
  echo "Nessuna modifica locale da registrare."
  echo
  echo "Controllo che GitHub sia aggiornato..."
  git push -u origin main || fail "Il push GitHub non è riuscito."
  deploy_marketing_site
  echo
  echo "=========================================="
  echo " PUBBLICAZIONE COMPLETATA"
  echo "=========================================="
  echo
  echo "GitHub è aggiornato."
  echo "Il sito marketing non viene toccato se non contiene modifiche locali."
  pause_and_exit 0
fi

echo "Modifiche rilevate:"
git status --short
echo

if find assets/js -type f -name '*.js' -print -quit 2>/dev/null | grep -q .; then
  command -v node >/dev/null 2>&1 \
    || fail "Node.js non è disponibile: non posso verificare automaticamente la sintassi JavaScript."
  echo "Verifica sintassi JavaScript..."
  while IFS= read -r -d '' file; do
    node --check "$file" >/dev/null 2>&1 \
      || fail "Errore di sintassi JavaScript in: $file"
  done < <(find assets/js -type f -name '*.js' -print0)
  echo "  OK"
  echo
fi

if [ -f "tennis-player-os-site/app.js" ]; then
  command -v node >/dev/null 2>&1 \
    || fail "Node.js non è disponibile: non posso verificare tennis-player-os-site/app.js."
  node --check "tennis-player-os-site/app.js" >/dev/null 2>&1 \
    || fail "Errore di sintassi JavaScript in tennis-player-os-site/app.js"
fi

MIGRATION_STATUS="$(git status --porcelain -- supabase/migrations 2>/dev/null || true)"
if [ -n "$MIGRATION_STATUS" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    code="${line:0:2}"
    path="${line:3}"
    case "$code" in
      "??"|"A "|" A") ;;
      *) fail "È stata modificata una migrazione già esistente: $path
Per sicurezza Tennis Player OS pubblica solo nuove migrazioni SQL; non riscrive quelle già applicate." ;;
    esac
  done <<< "$MIGRATION_STATUS"

  command -v supabase >/dev/null 2>&1 \
    || fail "Supabase CLI non è disponibile, ma ci sono nuove migrazioni da applicare."

  echo "Nuove migrazioni Supabase rilevate:"
  echo "$MIGRATION_STATUS"
  echo
  read -r -p "Applicarle ora al database remoto? [S/n]: " APPLY_DB
  case "${APPLY_DB:-}" in
    n|N|no|NO|No)
      fail "Migrazioni non applicate. La pubblicazione è stata fermata prima del commit."
      ;;
    *)
      echo
      echo "Applico le migrazioni..."
      supabase db push || fail "supabase db push non è riuscito."
      echo "  Database aggiornato."
      echo
      ;;
  esac
fi

FUNCTIONS="$(git status --porcelain -- supabase/functions \
  | awk '{print $2}' \
  | sed -n 's#^supabase/functions/\([^/]*\)/.*#\1#p' \
  | sort -u)"

if [ -n "$FUNCTIONS" ]; then
  command -v supabase >/dev/null 2>&1 \
    || fail "Supabase CLI non è disponibile, ma ci sono Edge Functions modificate o eliminate."

  echo "Gestisco le Edge Functions modificate..."
  while IFS= read -r function_name; do
    [ -z "$function_name" ] && continue
    function_entry="supabase/functions/$function_name/index.ts"

    if [ ! -f "$function_entry" ]; then
      echo "  → $function_name (rimossa localmente)"
      read -r -p "    Eliminarla anche da Supabase remoto? [S/n]: " DELETE_REMOTE
      case "${DELETE_REMOTE:-}" in
        n|N|no|NO|No)
          echo "    Eliminazione remota saltata."
          ;;
        *)
          supabase functions delete "$function_name" \
            || fail "Eliminazione remota della funzione $function_name non riuscita."
          echo "    Funzione eliminata anche da Supabase."
          ;;
      esac
      continue
    fi

    echo "  → $function_name"
    if [ "$function_name" = "remove-user" ]; then
      supabase functions deploy "$function_name" --no-verify-jwt \
        || fail "Deploy della funzione $function_name non riuscito."
    else
      supabase functions deploy "$function_name" \
        || fail "Deploy della funzione $function_name non riuscito."
    fi
  done <<< "$FUNCTIONS"
  echo "  Edge Functions aggiornate."
  echo
fi

git add -A || fail "git add non è riuscito."

if git diff --cached --quiet; then
  echo "Nessuna modifica da registrare in Git."
else
  VERSION="$(sed -n "s/.*APP_VERSION = '\([^']*\)'.*/\1/p" assets/js/version.js | head -n 1)"
  if [ -n "$VERSION" ]; then
    DEFAULT_MSG="Release v$VERSION"
  else
    DEFAULT_MSG="Update $(date '+%Y-%m-%d %H:%M')"
  fi

  echo
  read -r -p "Messaggio commit [$DEFAULT_MSG]: " COMMIT_MSG
  COMMIT_MSG="${COMMIT_MSG:-$DEFAULT_MSG}"

  if ! git config user.name >/dev/null 2>&1; then
    read -r -p "Nome da usare per Git: " GIT_NAME
    git config user.name "${GIT_NAME:-Tennis Player OS}"
  fi

  if ! git config user.email >/dev/null 2>&1; then
    read -r -p "Email da usare per Git: " GIT_EMAIL
    [ -n "${GIT_EMAIL:-}" ] || fail "Serve un'email Git per creare il commit."
    git config user.email "$GIT_EMAIL"
  fi

  git commit -m "$COMMIT_MSG" || fail "Il commit Git non è riuscito."
fi

echo
echo "Invio a GitHub..."
git push -u origin main || fail "Il push GitHub non è riuscito."

deploy_marketing_site

echo
echo "=========================================="
echo " PUBBLICAZIONE COMPLETATA"
echo "=========================================="
echo
echo "Supabase è aggiornato quando necessario."
echo "GitHub è aggiornato."
echo "Il frontend app viene pubblicato da GitHub Actions."
if [ -s "$MARKETING_CHANGES_FILE" ]; then
  echo "Il sito marketing è stato aggiornato solo nei file modificati."
else
  echo "Il sito marketing era invariato ed è stato lasciato intatto."
fi
echo
echo "Se non sono comparsi errori non serve copiare qui l'output:"
echo "scrivi semplicemente «pubblicato»."
pause_and_exit 0
