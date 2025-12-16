#!/bin/bash
# Script de instalación del sistema de Jobs Asíncronos
# Para Linux/macOS

set -e

echo "=========================================="
echo "   Instalación Sistema de Jobs"
echo "   go-oracle-api"
echo "=========================================="
echo ""

# Verificar parámetros
if [ $# -lt 3 ]; then
    echo "Uso: $0 <usuario> <password> <database>"
    echo ""
    echo "Ejemplo:"
    echo "  $0 MYUSER mypassword //localhost:1521/ORCL"
    echo ""
    exit 1
fi

USUARIO=$1
PASSWORD=$2
DATABASE=$3

echo "📋 Configuración:"
echo "  Usuario: $USUARIO"
echo "  Base de datos: $DATABASE"
echo ""

# Verificar que sqlplus está disponible
if ! command -v sqlplus &> /dev/null; then
    echo "❌ Error: sqlplus no encontrado"
    echo "   Instala Oracle Instant Client primero"
    exit 1
fi

echo "✅ sqlplus encontrado"
echo ""

# Crear tabla ASYNC_JOBS
echo "📝 Creando tabla ASYNC_JOBS..."
sqlplus -S "$USUARIO/$PASSWORD@$DATABASE" @sql/create_async_jobs_table.sql > /tmp/async_jobs_install.log 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Tabla ASYNC_JOBS creada"
else
    echo "⚠️  Error creando tabla (puede ya existir)"
    echo "   Revisa: /tmp/async_jobs_install.log"
fi

# Crear procedimientos de prueba
echo "📝 Creando procedimientos de prueba..."
sqlplus -S "$USUARIO/$PASSWORD@$DATABASE" @sql/create_test_procedures.sql > /tmp/test_procedures_install.log 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Procedimientos de prueba creados"
else
    echo "⚠️  Error creando procedimientos"
    echo "   Revisa: /tmp/test_procedures_install.log"
fi

echo ""
echo "=========================================="
echo "✅ Instalación completada"
echo "=========================================="
echo ""
echo "Próximos pasos:"
echo ""
echo "1. Inicia el servidor API:"
echo "   go run main.go"
echo ""
echo "2. Prueba el sistema de jobs:"
echo "   node scripts/test_api.js async"
echo ""
echo "3. Monitorea jobs:"
echo "   node scripts/view_status.js jobs"
echo ""
echo "📚 Documentación: docs/ASYNC_JOBS.md"
echo ""
