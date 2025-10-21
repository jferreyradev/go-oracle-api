@echo off
echo ===============================================
echo  LIMPIEZA DE ARCHIVOS TEMPORALES - Go Oracle API
echo ===============================================
echo.

REM Limpiar logs antiguos (más de 7 días)
if exist "log\" (
    echo Limpiando logs antiguos...
    forfiles /p log /s /m *.log /d -7 /c "cmd /c del @path" 2>nul
    echo Logs antiguos eliminados.
) else (
    echo No hay carpeta de logs.
)

REM Limpiar archivos temporales
if exist "*.tmp" (
    echo Eliminando archivos temporales...
    del /q *.tmp 2>nul
)

REM Limpiar ejecutables de desarrollo
if exist "go-oracle-api.exe" (
    set /p delete_exe="¿Eliminar go-oracle-api.exe? (s/n): "
    if /i "!delete_exe!"=="s" (
        del go-oracle-api.exe
        echo Ejecutable eliminado.
    )
)

REM Mostrar estadísticas
echo.
echo ===============================================
echo  ESTADÍSTICAS DEL PROYECTO
echo ===============================================
echo Archivos Go:
dir /b *.go 2>nul | find /c /v "" && echo archivo(s) .go encontrado(s)

echo.
echo Archivos de documentación:
dir /b docs\*.md 2>nul | find /c /v "" && echo archivo(s) .md encontrado(s)

echo.
echo Logs actuales:
if exist "log\" (
    dir /b log\*.log 2>nul | find /c /v "" && echo archivo(s) de log
) else (
    echo 0 archivos de log
)

echo.
echo Tamaño total del proyecto:
for /f "tokens=3" %%i in ('dir /s /-c ^| findstr "bytes"') do set size=%%i
echo %size% bytes

echo.
echo ===============================================
echo  Limpieza completada
echo ===============================================
pause