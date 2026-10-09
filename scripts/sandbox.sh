#!/usr/bin/env bash
# ==============================================================================
# cortex-sandbox.sh - Isolated Headless GUI & VNC Sandbox for Development
# ==============================================================================
set -euo pipefail

DISPLAY_NUM=":99"
VNC_PORT="5999"
RESOLUTION="1920x1080x24"
LOCK_FILE="/tmp/.X${DISPLAY_NUM#:}-lock"
SOCKET_FILE="/tmp/.X11-unix/X${DISPLAY_NUM#:}"

start_sandbox() {
    echo "🚀 Запуск изолированного стенда Cortex (DISPLAY=${DISPLAY_NUM}, VNC=${VNC_PORT})..."

    # 1. Проверяем наличие необходимых утилит
    local missing=()
    for cmd in Xvfb x11vnc openbox; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "❌ Ошибка: Не установлены необходимые компоненты: ${missing[*]}"
        echo "👉 Установите их командой: sudo pacman -S --needed xorg-server-xvfb x11vnc openbox tigervnc"
        exit 1
    fi

    # 2. Проверяем, запущен ли уже Xvfb на этом дисплее
    if [[ -f "$LOCK_FILE" ]] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
        echo "ℹ️  Xvfb уже работает на ${DISPLAY_NUM} (PID: $(cat "$LOCK_FILE"))."
    else
        rm -f "$LOCK_FILE" "$SOCKET_FILE"
        echo "  • Запуск Xvfb (${RESOLUTION})..."
        Xvfb "${DISPLAY_NUM}" -screen 0 "${RESOLUTION}" -ac +extension GLX +render -noreset &
        local xvfb_pid=$!

        # Ожидание готовности сокета X11
        local tries=0
        while [[ ! -S "$SOCKET_FILE" ]]; do
            sleep 0.1
            tries=$((tries + 1))
            if [[ $tries -gt 30 ]]; then
                echo "❌ Не удалось дождаться запуска Xvfb"
                exit 1
            fi
        done
        echo "  ✔ Xvfb успешно запущен (PID: ${xvfb_pid})"
    fi

    # 3. Запуск оконного менеджера Openbox внутри :99
    if ! pgrep -x openbox &>/dev/null; then
        echo "  • Запуск Openbox WM на ${DISPLAY_NUM}..."
        DISPLAY="${DISPLAY_NUM}" openbox --sm-disable &
        sleep 0.2
        echo "  ✔ Openbox запущен"
    fi

    # 4. Запуск x11vnc (строго на 127.0.0.1, без внешнего доступа)
    if ! pgrep -f "x11vnc.*${DISPLAY_NUM}" &>/dev/null; then
        echo "  • Запуск VNC сервера (порт ${VNC_PORT}, 127.0.0.1)..."
        x11vnc -display "${DISPLAY_NUM}" \
               -listen 127.0.0.1 \
               -rfbport "${VNC_PORT}" \
               -forever \
               -shared \
               -bg \
               -nopw \
               -repeat \
               -quiet
        echo "  ✔ x11vnc активен"
    fi

    echo ""
    echo "=================================================================="
    echo "✅ Изолированный графический стенд готов к работе!"
    echo "=================================================================="
    echo "  • Переменная дисплея для агента : export DISPLAY=${DISPLAY_NUM}"
    echo "  • Подключение для просмотра (режим наблюдения без перехвата мыши):"
    echo "      vncviewer -ViewOnly localhost:${VNC_PORT}"
    echo "  • Подключение для интерактивного управления:"
    echo "      vncviewer localhost:${VNC_PORT}"
    echo "=================================================================="
}

stop_sandbox() {
    echo "🛑 Остановка изолированного стенда (${DISPLAY_NUM})..."
    pkill -f "x11vnc.*${DISPLAY_NUM}" 2>/dev/null || true
    pkill -f "openbox.*${DISPLAY_NUM}" 2>/dev/null || true
    pkill -f "Xvfb ${DISPLAY_NUM}" 2>/dev/null || true
    rm -f "$LOCK_FILE" "$SOCKET_FILE"
    echo "✔ Все процессы стенда остановлены."
}

status_sandbox() {
    echo "📊 Статус стенда (${DISPLAY_NUM}):"
    if [[ -f "$LOCK_FILE" ]] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
        echo "  • Xvfb    : 🟢 РАБОТАЕТ (PID: $(cat "$LOCK_FILE"))"
    else
        echo "  • Xvfb    : 🔴 ОСТАНОВЛЕН"
    fi

    if pgrep -x openbox &>/dev/null; then
        echo "  • Openbox : 🟢 РАБОТАЕТ"
    else
        echo "  • Openbox : 🔴 ОСТАНОВЛЕН"
    fi

    if pgrep -f "x11vnc.*${DISPLAY_NUM}" &>/dev/null; then
        echo "  • x11vnc  : 🟢 РАБОТАЕТ (порт ${VNC_PORT})"
    else
        echo "  • x11vnc  : 🔴 ОСТАНОВЛЕН"
    fi
}

view_sandbox() {
    local view_only="${1:-true}"
    if ! command -v vncviewer &>/dev/null; then
        echo "❌ Утилита vncviewer не найдена. Установите: sudo pacman -S tigervnc"
        exit 1
    fi

    if [[ "$view_only" == "true" ]]; then
        echo "👁️  Запуск VNC Viewer в режиме наблюдения (View-Only)..."
        vncviewer -ViewOnly "localhost:${VNC_PORT}" &
    else
        echo "🎮 Запуск VNC Viewer в интерактивном режиме..."
        vncviewer "localhost:${VNC_PORT}" &
    fi
}

case "${1:-status}" in
    start)
        start_sandbox
        ;;
    stop)
        stop_sandbox
        ;;
    restart)
        stop_sandbox
        sleep 0.5
        start_sandbox
        ;;
    status)
        status_sandbox
        ;;
    view)
        view_sandbox true
        ;;
    interactive)
        view_sandbox false
        ;;
    *)
        echo "Использование: $0 {start|stop|restart|status|view|interactive}"
        exit 1
        ;;
esac
