#!/bin/bash
set -u
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR" || exit 1
FTP_HOST="ftp.polidorionline.it"
FTP_PORT="21"
FTP_USER="17983806@aruba.it"
KEYCHAIN_SERVICE="Tennis Player OS - Aruba FTP"
pause_and_exit(){ local code="${1:-0}"; echo; read -r -p "Premi Invio per chiudere..." _; exit "$code"; }
fail(){ echo; echo "CONFIGURAZIONE NON COMPLETATA"; echo "$1"; pause_and_exit 1; }
command -v security >/dev/null 2>&1 || fail "Il Portachiavi macOS non è disponibile."
command -v python3 >/dev/null 2>&1 || fail "Python 3 non è disponibile su questo Mac."
echo "=========================================="
echo " Tennis Player OS — Configura Aruba FTP"
echo "=========================================="
echo
echo "Server:   $FTP_HOST"
echo "Porta:    $FTP_PORT"
echo "Utente:   $FTP_USER"
echo
echo "La password verrà salvata nel Portachiavi di macOS."
echo "Non verrà scritta nei file del progetto né su GitHub."
echo
read -r -s -p "Password Aruba/FTP: " FTP_PASSWORD
echo
[ -n "${FTP_PASSWORD:-}" ] || fail "Password non inserita."
security add-generic-password -U -a "$FTP_USER" -s "$KEYCHAIN_SERVICE" -w "$FTP_PASSWORD" >/dev/null 2>&1 || fail "Non sono riuscito a salvare la password nel Portachiavi."
echo
echo "Test connessione FTP..."
export TPOS_FTP_PASSWORD="$FTP_PASSWORD"
python3 "$APP_DIR/scripts/deploy_marketing_site.py" --host "$FTP_HOST" --port "$FTP_PORT" --user "$FTP_USER" --remote-dir "/www.polidorionline.it/tennis-player-os-site" --local-dir "$APP_DIR/tennis-player-os-site" --test || { unset TPOS_FTP_PASSWORD; fail "Connessione FTP non riuscita. Controlla password e dati Aruba."; }
unset TPOS_FTP_PASSWORD
unset FTP_PASSWORD
echo
echo "=========================================="
echo " CONFIGURAZIONE COMPLETATA"
echo "=========================================="
echo
echo "Da ora Pubblica Tennis Player OS.command"
echo "può aggiornare automaticamente anche il sito marketing su Aruba."
pause_and_exit 0
