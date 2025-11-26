#!/bin/bash

# Monitor de instancias para Linux/macOS

show_menu() {
    clear
    echo "==============================================="
    echo "     MONITOR DE INSTANCIAS - GO ORACLE API"
    echo "==============================================="
    echo
    echo "1. Ver estado de todas las instancias"
    echo "2. Ver logs de Produccion"
    echo "3. Ver logs de Testing"
    echo "4. Ver logs de Desarrollo" 
    echo "5. Ver último log de cualquier instancia"
    echo "6. Detener todas las instancias"
    echo "7. Salir"
    echo
    read -p "Selecciona una opción (1-7): " option
    echo
}

check_status() {
    echo "==============================================="
    echo "  ESTADO DE INSTANCIAS"
    echo "==============================================="
    echo
    echo "Verificando puertos..."
    
    if netstat -ln 2>/dev/null | grep -q ":8081.*LISTEN" || ss -ln 2>/dev/null | grep -q ":8081"; then
        echo "[✓] Produccion (8081) - ACTIVA"
    else
        echo "[✗] Produccion (8081) - INACTIVA"
    fi
    
    if netstat -ln 2>/dev/null | grep -q ":8082.*LISTEN" || ss -ln 2>/dev/null | grep -q ":8082"; then
        echo "[✓] Testing (8082) - ACTIVA"
    else
        echo "[✗] Testing (8082) - INACTIVA"
    fi
    
    if netstat -ln 2>/dev/null | grep -q ":8083.*LISTEN" || ss -ln 2>/dev/null | grep -q ":8083"; then
        echo "[✓] Desarrollo (8083) - ACTIVA"
    else
        echo "[✗] Desarrollo (8083) - INACTIVA"
    fi
    
    echo
    echo "Procesos go-oracle-api en ejecución:"
    if pgrep -f "go-oracle-api" >/dev/null || pgrep -f "main.go.*808[1-3]" >/dev/null; then
        ps aux | grep -E "(go-oracle-api|main.go.*808[1-3])" | grep -v grep
    else
        echo "No hay procesos activos"
    fi
    echo
}

show_logs() {
    local instance=$1
    echo "==============================================="
    echo "  LOGS DE $instance"
    echo "==============================================="
    
    local log_files=(log/${instance}_*.log)
    if [[ -f "${log_files[0]}" ]]; then
        for log_file in "${log_files[@]}"; do
            echo "Archivo: $log_file"
            echo "Últimas 20 líneas:"
            tail -20 "$log_file"
            echo
        done
    else
        echo "No se encontraron logs para $instance"
    fi
}

show_last_log() {
    echo "==============================================="
    echo "  ÚLTIMO LOG MODIFICADO"
    echo "==============================================="
    
    local last_log=$(ls -t log/*.log 2>/dev/null | head -1)
    if [[ -n "$last_log" ]]; then
        echo "Archivo: $last_log"
        echo "Últimas 30 líneas:"
        tail -30 "$last_log"
    else
        echo "No se encontraron archivos de log."
    fi
    echo
}

kill_all() {
    echo "==============================================="
    echo "  DETENIENDO TODAS LAS INSTANCIAS"
    echo "==============================================="
    echo
    
    if pgrep -f "go-oracle-api" >/dev/null || pgrep -f "main.go.*808[1-3]" >/dev/null; then
        pkill -f "go-oracle-api"
        pkill -f "main.go.*808[1-3]"
        echo "Instancias detenidas exitosamente."
    else
        echo "No hay instancias activas para detener."
    fi
    echo
}

# Bucle principal
while true; do
    show_menu
    
    case $option in
        1)
            check_status
            read -p "Presiona Enter para continuar..."
            ;;
        2)
            show_logs "Produccion"
            read -p "Presiona Enter para continuar..."
            ;;
        3)
            show_logs "Testing"
            read -p "Presiona Enter para continuar..."
            ;;
        4)
            show_logs "Desarrollo"
            read -p "Presiona Enter para continuar..."
            ;;
        5)
            show_last_log
            read -p "Presiona Enter para continuar..."
            ;;
        6)
            kill_all
            read -p "Presiona Enter para continuar..."
            ;;
        7)
            echo "Saliendo del monitor..."
            exit 0
            ;;
        *)
            echo "Opción inválida. Intenta de nuevo."
            sleep 2
            ;;
    esac
done