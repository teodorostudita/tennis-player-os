#!/bin/bash

set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR" || exit 1

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

echo "=========================================="
echo " Tennis Player OS — Pubblicazione automatica"
echo "=========================================="
echo
echo "Cartella:"
echo "  $APP_DIR"
echo

if ! command -v git >/dev/null 2>&1; then
  fail "Git non è disponibile su questo Mac."
fi

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
  git checkout main 2>/dev/null || git branch -M main || fail "Impossibile passare al branch main."
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Il repository GitHub non è ancora collegato."
  echo
  read -r -p "Incolla l'URL HTTPS del repository GitHub: " REPO_URL

  if [ -z "${REPO_URL:-}" ]; then
    fail "Nessun URL GitHub inserito."
  fi

  git remote add origin "$REPO_URL" || fail "Impossibile configurare il repository GitHub."
fi

echo "Repository:"
echo "  $(git remote get-url origin)"
echo

STATUS="$(git status --porcelain)"

if [ -z "$STATUS" ]; then
  echo "Nessuna modifica locale da pubblicare."
  echo
  echo "Controllo comunque che il branch remoto sia aggiornato..."
  git push -u origin main || fail "Il push GitHub non è riuscito."
  echo
  echo "=========================================="
  echo " PUBBLICAZIONE COMPLETATA"
  echo "=========================================="
  pause_and_exit 0
fi

echo "Modifiche rilevate:"
git status --short
echo

# ---------------------------------------------------------------------------
# 1. Verifica JavaScript
# ---------------------------------------------------------------------------

if find assets/js -type f -name '*.js' -print -quit 2>/dev/null | grep -q .; then
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js non è disponibile: non posso verificare automaticamente la sintassi JavaScript."
  fi

  echo "Verifica sintassi JavaScript..."

  while IFS= read -r -d '' file; do
    node --check "$file" >/dev/null 2>&1 || fail "Errore di sintassi JavaScript in: $file"
  done < <(find assets/js -type f -name '*.js' -print0)

  echo "  OK"
  echo
fi

# ---------------------------------------------------------------------------
# 2. Migrazioni Supabase
#    Le migrazioni già versionate non devono essere modificate.
# ---------------------------------------------------------------------------

MIGRATION_STATUS="$(git status --porcelain -- supabase/migrations 2>/dev/null || true)"

if [ -n "$MIGRATION_STATUS" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    code="${line:0:2}"
    path="${line:3}"

    case "$code" in
      "??"|"A "|" A")
        ;;
      *)
        fail "È stata modificata una migrazione già esistente: $path
Per sicurezza Tennis Player OS pubblica solo nuove migrazioni SQL; non riscrive quelle già applicate."
        ;;
    esac
  done <<< "$MIGRATION_STATUS"

  if ! command -v supabase >/dev/null 2>&1; then
    fail "Supabase CLI non è disponibile, ma ci sono nuove migrazioni da applicare."
  fi

  echo "Nuove migrazioni Supabase rilevate:"
  echo "$MIGRATION_STATUS"
  echo
  read -r -p "Applicarle ora al database remoto? [s/N]: " APPLY_DB

  case "${APPLY_DB:-}" in
    s|S|si|SI|sì|SÌ|y|Y|yes|YES)
      echo
      echo "Applico le migrazioni..."
      supabase db push || fail "supabase db push non è riuscito."
      echo "  Database aggiornato."
      echo
      ;;
    *)
      fail "Migrazioni non applicate. La pubblicazione è stata fermata prima del commit."
      ;;
  esac
fi

# ---------------------------------------------------------------------------
# 3. Edge Functions modificate
# ---------------------------------------------------------------------------

FUNCTIONS="$(
  git status --porcelain \
    | awk '{print $2}' \
    | sed -n 's#^supabase/functions/\([^/]*\)/.*#\1#p' \
    | sort -u
)"

if [ -n "$FUNCTIONS" ]; then
  if ! command -v supabase >/dev/null 2>&1; then
    fail "Supabase CLI non è disponibile, ma ci sono Edge Functions da pubblicare."
  fi

  echo "Pubblico le Edge Functions modificate..."

  while IFS= read -r function_name; do
    [ -z "$function_name" ] && continue
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

# ---------------------------------------------------------------------------
# 4. Commit e push GitHub
# ---------------------------------------------------------------------------

git add -A || fail "git add non è riuscito."

if git diff --cached --quiet; then
  echo "Nessuna modifica da registrare in Git."
else
  VERSION="$(
    sed -n "s/.*APP_VERSION = '\([^']*\)'.*/\1/p" assets/js/version.js \
      | head -n 1
  )"

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

    if [ -z "${GIT_EMAIL:-}" ]; then
      fail "Serve un'email Git per creare il commit."
    fi

    git config user.email "$GIT_EMAIL"
  fi

  git commit -m "$COMMIT_MSG" || fail "Il commit Git non è riuscito."
fi

echo
echo "Invio a GitHub..."
git push -u origin main || fail "Il push GitHub non è riuscito."

echo
echo "=========================================="
echo " PUBBLICAZIONE COMPLETATA"
echo "=========================================="
echo
echo "Supabase è già aggiornato."
echo "GitHub Actions sta pubblicando il frontend."
echo
echo "Se non sono comparsi errori non serve copiare qui l'output:"
echo "scrivi semplicemente «pubblicato»."

pause_and_exit 0
