@echo off
echo ===============================================
echo  Iniciando multiples instancias de Go Oracle API
echo ===============================================

REM Verificar que existe el ejecutable
if not exist "go-oracle-api.exe" (
    echo Error: No se encuentra go-oracle-api.exe
    echo Ejecuta primero: go build -o go-oracle-api.exe main.go
    pause
    exit /b 1
)

REM Crear archivos .env de ejemplo si no existen
if not exist ".env1" (
    echo Creando .env1 de ejemplo...
    copy .env .env1 >nul 2>&1
)

if not exist ".env2" (
    echo Creando .env2 de ejemplo...
    copy .env .env2 >nul 2>&1
)

echo.
echo Iniciando instancias...
echo.

REM Instancia 1 - Produccion
echo [1/3] Iniciando: Produccion (Puerto 8081)
start "Go Oracle API - Produccion" cmd /k "go-oracle-api.exe .env1 8081 Produccion"
timeout /t 2 >nul

REM Instancia 2 - Testing  
echo [2/3] Iniciando: Testing (Puerto 8082)
start "Go Oracle API - Testing" cmd /k "go-oracle-api.exe .env2 8082 Testing"
timeout /t 2 >nul

REM Instancia 3 - Desarrollo
echo [3/3] Iniciando: Desarrollo (Puerto 8083)
start "Go Oracle API - Desarrollo" cmd /k "go-oracle-api.exe .env 8083 Desarrollo"

echo.
echo ===============================================
echo  Instancias iniciadas:
echo  - Produccion:  http://localhost:8081
echo  - Testing:     http://localhost:8082  
echo  - Desarrollo:  http://localhost:8083
echo.
echo  Logs individuales en carpeta log/:
echo  - log/Produccion_YYYY-MM-DD_HH-MM-SS.log
echo  - log/Testing_YYYY-MM-DD_HH-MM-SS.log
echo  - log/Desarrollo_YYYY-MM-DD_HH-MM-SS.log
echo ===============================================
echo.

pause