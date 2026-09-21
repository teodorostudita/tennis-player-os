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

echo "=========================================="
echo " Tennis Player OS — Pubblica su GitHub"
echo "=========================================="
echo
echo "Cartella:"
echo "  $APP_DIR"
echo

if ! command -v git >/dev/null 2>&1; then
  echo "ERRORE: Git non è disponibile su questo Mac."
  echo "Installa gli strumenti da riga di comando di Xcode oppure GitHub Desktop."
  pause_and_exit 1
fi

# Prima inizializzazione del repository locale
if [ ! -d ".git" ]; then
  echo "Prima inizializzazione Git..."
  git init || pause_and_exit 1
  git branch -M main || pause_and_exit 1
fi

# Assicura il branch main
current_branch="$(git branch --show-current 2>/dev/null || true)"
if [ -z "$current_branch" ]; then
  git checkout -b main || pause_and_exit 1
elif [ "$current_branch" != "main" ]; then
  echo "Passo al branch main..."
  git checkout main 2>/dev/null || git branch -M main || pause_and_exit 1
fi

# Configurazione dell'origin al primo utilizzo
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Il repository GitHub non è ancora collegato."
  echo
  echo "1. Crea su GitHub un repository VUOTO (senza README/.gitignore/licenza)."
  echo "2. Copia l'URL HTTPS del repository, ad esempio:"
  echo "   https://github.com/USERNAME/tennis-player-os.git"
  echo
  read -r -p "Incolla qui l'URL del repository: " REPO_URL

  if [ -z "${REPO_URL:-}" ]; then
    echo "Nessun URL inserito. Operazione annullata."
    pause_and_exit 1
  fi

  git remote add origin "$REPO_URL" || pause_and_exit 1
fi

echo "Repository remoto:"
echo "  $(git remote get-url origin)"
echo

# Mostra i cambiamenti
git status --short
echo

git add -A || pause_and_exit 1

if git diff --cached --quiet; then
  echo "Nessuna modifica da registrare."
else
  DEFAULT_MSG="Update $(date '+%Y-%m-%d %H:%M')"
  read -r -p "Messaggio commit [$DEFAULT_MSG]: " COMMIT_MSG
  COMMIT_MSG="${COMMIT_MSG:-$DEFAULT_MSG}"

  if ! git config user.name >/dev/null 2>&1; then
    echo
    read -r -p "Nome da usare per Git: " GIT_NAME
    git config user.name "${GIT_NAME:-Tennis Player OS}"
  fi

  if ! git config user.email >/dev/null 2>&1; then
    read -r -p "Email da usare per Git: " GIT_EMAIL
    if [ -z "${GIT_EMAIL:-}" ]; then
      echo "Serve un'email Git per creare il commit."
      pause_and_exit 1
    fi
    git config user.email "$GIT_EMAIL"
  fi

  git commit -m "$COMMIT_MSG" || pause_and_exit 1
fi

echo
echo "Invio a GitHub..."
echo "Se è il primo utilizzo, Git/GitHub potrebbe chiederti di autenticarti."
echo

if ! git push -u origin main; then
  echo
  echo "ERRORE nel push."
  echo "Controlla l'autenticazione GitHub e riprova."
  pause_and_exit 1
fi

echo
echo "=========================================="
echo " PUSH COMPLETATO"
echo "=========================================="
echo
echo "GitHub Actions ora pubblicherà automaticamente la nuova versione."
echo "Puoi controllare lo stato nella scheda Actions del repository."

pause_and_exit 0
