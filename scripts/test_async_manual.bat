@echo off
echo ============================================
echo   Prueba Manual de Endpoints Asincronos
echo ============================================
echo.

set API_URL=http://10.6.150.91:3000
set TOKEN=test1

echo 1. Probando /ping...
curl -s -H "Authorization: Bearer %TOKEN%" %API_URL%/ping
echo.
echo.

echo 2. Iniciando procedimiento asincrono...
curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer %TOKEN%" %API_URL%/procedure/async -d "{\"name\":\"suma_simple\",\"params\":[{\"name\":\"a\",\"value\":5},{\"name\":\"b\",\"value\":7},{\"name\":\"resultado\",\"direction\":\"OUT\"}]}"
echo.
echo.

echo 3. Listando todos los jobs...
timeout /t 2 /nobreak >nul
curl -s -H "Authorization: Bearer %TOKEN%" %API_URL%/jobs
echo.
echo.

echo ============================================
echo   Pruebas completadas
echo ============================================
pause
