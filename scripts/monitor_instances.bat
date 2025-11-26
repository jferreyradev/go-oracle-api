@echo off
title Monitor de Instancias - Go Oracle API

:menu
cls
echo ===============================================
echo     MONITOR DE INSTANCIAS - GO ORACLE API
echo ===============================================
echo.
echo 1. Ver estado de todas las instancias
echo 2. Ver logs de Produccion
echo 3. Ver logs de Testing  
echo 4. Ver logs de Desarrollo
echo 5. Ver ultimo log de cualquier instancia
echo 6. Detener todas las instancias
echo 7. Salir
echo.
set /p option="Selecciona una opcion (1-7): "

if "%option%"=="1" goto :status
if "%option%"=="2" goto :logs_prod
if "%option%"=="3" goto :logs_test
if "%option%"=="4" goto :logs_dev
if "%option%"=="5" goto :logs_last
if "%option%"=="6" goto :kill_all
if "%option%"=="7" goto :exit
goto :menu

:status
echo.
echo ===============================================
echo  ESTADO DE INSTANCIAS
echo ===============================================
echo.
echo Verificando puertos...
netstat -an | findstr ":8081.*LISTENING" >nul && echo [✓] Produccion (8081) - ACTIVA || echo [✗] Produccion (8081) - INACTIVA
netstat -an | findstr ":8082.*LISTENING" >nul && echo [✓] Testing (8082) - ACTIVA || echo [✗] Testing (8082) - INACTIVA  
netstat -an | findstr ":8083.*LISTENING" >nul && echo [✓] Desarrollo (8083) - ACTIVA || echo [✗] Desarrollo (8083) - INACTIVA
echo.

echo Procesos go-oracle-api en ejecucion:
tasklist | findstr "go-oracle-api.exe" 2>nul || echo No hay procesos activos
echo.
pause
goto :menu

:logs_prod
echo.
echo ===============================================
echo  LOGS DE PRODUCCION
echo ===============================================
for %%f in (log\Produccion_*.log) do (
    echo Archivo: %%f
    echo Ultimas 20 lineas:
    powershell "Get-Content '%%f' | Select-Object -Last 20"
    echo.
)
pause
goto :menu

:logs_test
echo.
echo ===============================================
echo  LOGS DE TESTING
echo ===============================================
for %%f in (log\Testing_*.log) do (
    echo Archivo: %%f
    echo Ultimas 20 lineas:
    powershell "Get-Content '%%f' | Select-Object -Last 20"
    echo.
)
pause
goto :menu

:logs_dev
echo.
echo ===============================================
echo  LOGS DE DESARROLLO
echo ===============================================
for %%f in (log\Desarrollo_*.log) do (
    echo Archivo: %%f
    echo Ultimas 20 lineas:
    powershell "Get-Content '%%f' | Select-Object -Last 20"
    echo.
)
pause
goto :menu

:logs_last
echo.
echo ===============================================
echo  ULTIMO LOG MODIFICADO
echo ===============================================
for /f "delims=" %%f in ('dir log\*.log /b /o-d 2^>nul ^| findstr /n "^" ^| findstr "^1:"') do (
    set "lastlog=%%f"
    set "lastlog=!lastlog:~2!"
)
if defined lastlog (
    echo Archivo: log\%lastlog%
    echo Ultimas 30 lineas:
    powershell "Get-Content 'log\%lastlog%' | Select-Object -Last 30"
) else (
    echo No se encontraron archivos de log.
)
echo.
pause
goto :menu

:kill_all
echo.
echo ===============================================
echo  DETENIENDO TODAS LAS INSTANCIAS
echo ===============================================
echo.
taskkill /f /im "go-oracle-api.exe" 2>nul && echo Instancias detenidas exitosamente. || echo No hay instancias activas para detener.
echo.
pause
goto :menu

:exit
echo.
echo Saliendo del monitor...
exit /b 0