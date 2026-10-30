#!/bin/bash

BOT_TOKEN="8701266208:AAEGUWsj1nM5__X1aAgcaZtQguw0RO5z8_I"
CHAT_ID="8101098223"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CF_LOGFILE="$SCRIPT_DIR/cloudflared.log"
NGROK_LOGFILE="$SCRIPT_DIR/ngrok.log"

CF_URL_FILE="$SCRIPT_DIR/cloudflare-url.txt"
LAST_CF_URL_FILE="$SCRIPT_DIR/cloudflare-last-notified-url.txt"

LAST_CF_URL=""
LAST_NGROK_URL=""
NGROK_PID=""

rm -f "$CF_LOGFILE" "$NGROK_LOGFILE"

send_telegram() {
    local message="$1"
    local response

    response=$(curl -sS --max-time 15 \
        -X POST \
        "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d "chat_id=${CHAT_ID}" \
        --data-urlencode "text=${message}")

    echo "Telegram response: $response"

    if echo "$response" | grep -q '"ok":true'; then
        return 0
    else
        return 1
    fi
}

echo "Starting EventHub Cloudflare Tunnel..."

cloudflared tunnel --url http://localhost:3000 \
    > "$CF_LOGFILE" 2>&1 &

CF_PID=$!

echo "Cloudflare PID: $CF_PID"

if command -v ngrok >/dev/null 2>&1; then

    echo "Starting ngrok..."

    ngrok http 3000 --log=stdout \
        > "$NGROK_LOGFILE" 2>&1 &

    NGROK_PID=$!

    echo "ngrok PID: $NGROK_PID"

else

    send_telegram "⚠️ EventHub ngrok Tunnel chưa chạy

Không tìm thấy lệnh ngrok.
Cloudflare Tunnel vẫn đang chạy.

⏰ $(date)"

fi

cleanup() {

    echo "Cleaning up tunnels..."

    if kill -0 "$CF_PID" 2>/dev/null; then
        kill "$CF_PID"
    fi

    if [ -n "$NGROK_PID" ] &&
       kill -0 "$NGROK_PID" 2>/dev/null; then
        kill "$NGROK_PID"
    fi
}

trap cleanup EXIT INT TERM

while true
do

    # ==================================
    # Cloudflare URL
    # ==================================

    CF_URL=$(grep -oE \
        'https://[a-zA-Z0-9-]+\.trycloudflare\.com' \
        "$CF_LOGFILE" 2>/dev/null | tail -1)

    if [ -n "$CF_URL" ]; then

        echo "$CF_URL" > "$CF_URL_FILE"

        if [ "$CF_URL" != "$LAST_CF_URL" ]; then

            echo "New Cloudflare URL detected: $CF_URL"

            if send_telegram "🔄 EventHub Cloudflare Tunnel Updated

🌐 ${CF_URL}

📡 Backend: http://localhost:3000

⏰ $(date)"; then

                echo "Telegram notification sent successfully."

                LAST_CF_URL="$CF_URL"

                echo "$CF_URL" > "$LAST_CF_URL_FILE"

            else

                echo "Telegram notification FAILED. Will retry."

            fi

        fi

    fi

    # ==================================
    # Cloudflare process
    # ==================================

    if ! kill -0 "$CF_PID" 2>/dev/null; then

        echo "Cloudflare process stopped."

        send_telegram "⚠️ EventHub Cloudflare Tunnel stopped

Cloudflare tunnel process đã dừng.

⏰ $(date)"

        exit 1

    fi

    # ==================================
    # ngrok
    # ==================================

    if [ -n "$NGROK_PID" ]; then

        NGROK_URL=$(curl -s \
            http://127.0.0.1:4040/api/tunnels \
            | grep -oE \
            '"public_url":"https://[^"]+"' \
            | sed 's/"public_url":"//' \
            | sed 's/"$//' \
            | tail -1)

        if [ -z "$NGROK_URL" ]; then

            NGROK_URL=$(grep -oE \
                'https://[^ ]+\.ngrok[^ ]+' \
                "$NGROK_LOGFILE" 2>/dev/null \
                | tail -1)

        fi

        if [ -n "$NGROK_URL" ] &&
           [ "$NGROK_URL" != "$LAST_NGROK_URL" ]; then

            echo "New ngrok URL detected: $NGROK_URL"

            if send_telegram "🔄 EventHub ngrok Tunnel Updated

🌐 ${NGROK_URL}

📡 Backend: http://localhost:3000

⏰ $(date)"; then

                LAST_NGROK_URL="$NGROK_URL"

            fi

        fi

        if ! kill -0 "$NGROK_PID" 2>/dev/null; then

            send_telegram "⚠️ EventHub ngrok Tunnel stopped

Cloudflare tunnel vẫn đang chạy.

⏰ $(date)"

            NGROK_PID=""

        fi

    fi

    sleep 10

done