#!/bin/bash

echo "==============================================="
echo "  LIMPIEZA DE ARCHIVOS TEMPORALES - Go Oracle API"
echo "==============================================="
echo

# Limpiar logs antiguos (más de 7 días)
if [[ -d "log" ]]; then
    echo "Limpiando logs antiguos..."
    find log -name "*.log" -mtime +7 -delete 2>/dev/null
    echo "Logs antiguos eliminados."
else
    echo "No hay carpeta de logs."
fi

# Limpiar archivos temporales
echo "Eliminando archivos temporales..."
rm -f *.tmp *.swp .DS_Store 2>/dev/null

# Limpiar ejecutables de desarrollo
if [[ -f "go-oracle-api" ]]; then
    read -p "¿Eliminar go-oracle-api? (s/n): " delete_exe
    if [[ "$delete_exe" == "s" || "$delete_exe" == "S" ]]; then
        rm go-oracle-api
        echo "Ejecutable eliminado."
    fi
fi

# Mostrar estadísticas
echo
echo "==============================================="
echo "  ESTADÍSTICAS DEL PROYECTO"
echo "==============================================="

echo "Archivos Go:"
go_count=$(ls -1 *.go 2>/dev/null | wc -l)
echo "$go_count archivo(s) .go encontrado(s)"

echo
echo "Archivos de documentación:"
if [[ -d "docs" ]]; then
    md_count=$(ls -1 docs/*.md 2>/dev/null | wc -l)
    echo "$md_count archivo(s) .md encontrado(s)"
else
    echo "0 archivos .md"
fi

echo
echo "Logs actuales:"
if [[ -d "log" ]]; then
    log_count=$(ls -1 log/*.log 2>/dev/null | wc -l)
    echo "$log_count archivo(s) de log"
else
    echo "0 archivos de log"
fi

echo
echo "Tamaño total del proyecto:"
if command -v du &> /dev/null; then
    du -sh . 2>/dev/null || echo "No se pudo calcular el tamaño"
else
    echo "Comando 'du' no disponible"
fi

echo
echo "==============================================="
echo "  Limpieza completada"
echo "==============================================="

read -p "Presiona Enter para continuar..."