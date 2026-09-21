#!/bin/bash
set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR" || exit 1

if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python)"
else
    osascript -e 'display dialog "Tennis Player OS richiede Python 3 per avviare il server locale." buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1
    exit 1
fi

if [ ! -f "$APP_DIR/server.py" ]; then
    osascript -e 'display dialog "Manca server.py nella cartella di Tennis Player OS." buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1
    exit 1
fi

PORT=8080
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
    PORT=$((PORT + 1))
    if [ "$PORT" -gt 8099 ]; then
        osascript -e 'display dialog "Nessuna porta libera tra 8080 e 8099." buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1
        exit 1
    fi
done

URL="http://127.0.0.1:${PORT}/"
LOG_FILE="$APP_DIR/.tennis-player-os-server.log"

echo ""
echo "=================================================="
echo "               TENNIS PLAYER OS"
echo "=================================================="
echo "Cartella: $APP_DIR"
echo "Server:   $URL"
echo "Cache:    disabilitata per lo sviluppo"
echo ""
echo "Per spegnere il server premi Ctrl+C."
echo ""

"$PYTHON_BIN" "$APP_DIR/server.py" --host 127.0.0.1 --port "$PORT" --directory "$APP_DIR" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
    if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM HUP

for _ in {1..30}; do
    if curl -fsS "$URL" >/dev/null 2>&1; then
        break
    fi
    sleep 0.1
done

if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Il server non è riuscito ad avviarsi. Log: $LOG_FILE"
    read -r -p "Premi Invio per chiudere..."
    exit 1
fi

open "$URL"
wait "$SERVER_PID"
