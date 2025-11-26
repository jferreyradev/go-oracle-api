#!/bin/bash

echo "==============================================="
echo "  Iniciando múltiples instancias de Go Oracle API"
echo "==============================================="

# Verificar que existe el ejecutable o código fuente
if [[ ! -f "go-oracle-api" && ! -f "main.go" ]]; then
    echo "Error: No se encuentra ejecutable ni main.go"
    echo "Compila primero: go build -o go-oracle-api main.go"
    exit 1
fi

# Determinar comando a usar
if [[ -f "go-oracle-api" ]]; then
    CMD="./go-oracle-api"
else
    CMD="go run main.go"
fi

# Crear archivos .env de ejemplo si no existen
if [[ ! -f ".env1" ]]; then
    echo "Creando .env1 de ejemplo..."
    cp .env .env1 2>/dev/null || true
fi

if [[ ! -f ".env2" ]]; then
    echo "Creando .env2 de ejemplo..."
    cp .env .env2 2>/dev/null || true
fi

echo
echo "Iniciando instancias..."
echo

# Función para iniciar instancia en background
start_instance() {
    local env_file=$1
    local port=$2
    local name=$3
    
    echo "[$4/3] Iniciando: $name (Puerto $port)"
    
    # Detectar terminal disponible
    if command -v gnome-terminal &> /dev/null; then
        gnome-terminal --title="Go Oracle API - $name" -- bash -c "$CMD $env_file $port $name; exec bash"
    elif command -v xterm &> /dev/null; then
        xterm -title "Go Oracle API - $name" -e "$CMD $env_file $port $name" &
    elif command -v konsole &> /dev/null; then
        konsole --title "Go Oracle API - $name" -e "$CMD $env_file $port $name" &
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - usar Terminal.app
        osascript -e "tell application \"Terminal\" to do script \"cd $(pwd) && $CMD $env_file $port $name\""
    else
        # Fallback: ejecutar en background con nohup
        echo "No se detectó terminal gráfico, ejecutando en background..."
        nohup $CMD $env_file $port $name > "log/${name}_console.log" 2>&1 &
        echo "Salida redirigida a: log/${name}_console.log"
    fi
    
    sleep 2
}

# Crear directorio de logs si no existe
mkdir -p log

# Iniciar instancias
start_instance ".env1" "8081" "Produccion" "1"
start_instance ".env2" "8082" "Testing" "2"
start_instance ".env" "8083" "Desarrollo" "3"

echo
echo "==============================================="
echo "  Instancias iniciadas:"
echo "  - Producción:  http://localhost:8081"
echo "  - Testing:     http://localhost:8082"
echo "  - Desarrollo:  http://localhost:8083"
echo
echo "  Logs individuales en carpeta log/:"
echo "  - log/Produccion_YYYY-MM-DD_HH-MM-SS.log"
echo "  - log/Testing_YYYY-MM-DD_HH-MM-SS.log" 
echo "  - log/Desarrollo_YYYY-MM-DD_HH-MM-SS.log"
echo "==============================================="
echo
echo "Para monitorear: ./scripts/monitor_instances.sh"
echo "Para detener: pkill -f go-oracle-api"
echo

read -p "Presiona Enter para continuar..."