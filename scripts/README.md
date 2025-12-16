# Scripts de Prueba - go-oracle-api

Scripts simplificados para pruebas y monitoreo de la API.

## 📦 Archivos Disponibles

### 1. **test_api.js** - Suite Completa de Pruebas

Script único que incluye todas las pruebas de funcionalidad.

**Uso:**
```bash
# Todas las pruebas
node scripts/test_api.js

# Prueba específica
node scripts/test_api.js ping
node scripts/test_api.js query
node scripts/test_api.js procedure
node scripts/test_api.js async
node scripts/test_api.js jobs
node scripts/test_api.js logging
```

**Tests incluidos:**
- ✅ **ping** - Conectividad básica
- ✅ **query** - Ejecución de SQL
- ✅ **procedure** - Procedimientos síncronos
- ✅ **async** - Jobs asíncronos con monitoreo
- ✅ **jobs** - Gestión de jobs (listar, eliminar)
- ✅ **logging** - Verificación de query logs
- ℹ️ **files** - Upload/Download (requiere curl/Postman)

---

### 2. **view_status.js** - Monitor de Estado

Visualiza y gestiona jobs y query logs en tiempo real.

**Uso:**
```bash
# Ver todos los jobs
node scripts/view_status.js jobs

# Filtrar jobs
node scripts/view_status.js jobs:active      # pending/running
node scripts/view_status.js jobs:completed   # completados
node scripts/view_status.js jobs:failed      # fallidos

# Limpiar jobs
node scripts/view_status.js jobs:clean       # elimina completed/failed

# Query logs
node scripts/view_status.js logs             # últimos 50 logs
node scripts/view_status.js logs:stats       # estadísticas
node scripts/view_status.js logs:errors      # solo errores
```

**Ejemplo de salida:**
```
📋 Jobs Asíncronos

ID                     Status      Procedimiento              Inicio           Duración  Prog.
───────────────────────────────────────────────────────────────────────────────────────────────
abc123...              running     PROC_TEST_DEMORA           16/12 14:30:15   2m 15s     45%
def456...              completed   PROC_VALIDAR               16/12 14:25:03   5s        100%

Total: 2
● running: 1
● completed: 1
```

---

## ⚙️ Configuración

Los scripts leen estas variables de entorno:

```bash
API_URL=http://localhost:3000    # URL de la API
API_TOKEN=test1                  # Token de autorización
```

O configúralas directamente:
```powershell
$env:API_URL = "http://10.6.150.91:3000"
$env:API_TOKEN = "test1"
```

---

## 🚀 Ejemplos de Uso

### Flujo completo de pruebas
```bash
# 1. Ejecutar todas las pruebas
node scripts/test_api.js

# 2. Ver estado de jobs
node scripts/view_status.js jobs

# 3. Limpiar jobs antiguos
node scripts/view_status.js jobs:clean
```

### Monitoreo continuo
```bash
# PowerShell - auto-refresh cada 5 segundos
while ($true) {
    Clear-Host
    node scripts/view_status.js jobs:active
    Start-Sleep -Seconds 5
}
```

### Pruebas específicas
```bash
# Solo jobs asíncronos
node scripts/test_api.js async

# Ver estadísticas de queries
node scripts/view_status.js logs:stats
```

---

## 📋 Requisitos

- **Node.js** v18+ o **Deno**
- Servidor `go-oracle-api` corriendo
- Oracle con tablas: `ASYNC_JOBS`, `QUERY_LOG`

---

## 🔧 Compatible con Deno

Ambos scripts funcionan con Deno sin modificaciones:

```bash
deno run --allow-net scripts/test_api.js
deno run --allow-net scripts/view_status.js jobs
```

---

## 📚 Ver también

- [USO_Y_PRUEBAS.md](../docs/USO_Y_PRUEBAS.md) - Guía completa de endpoints
- [DEPLOYMENT.md](../docs/DEPLOYMENT.md) - Despliegue del servidor
