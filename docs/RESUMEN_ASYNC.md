# Resumen: Procedimientos Asíncronos

## ✅ Implementado

Se ha agregado soporte completo para **ejecución asíncrona** de procedimientos Oracle de larga duración.

## 🆕 Nuevos Endpoints

### 1. POST `/procedure/async`
Ejecuta un procedimiento en segundo plano.
- Responde inmediatamente con un `job_id`
- No bloquea la conexión HTTP
- Sin límite de tiempo de ejecución

### 2. GET `/jobs/{job_id}`
Consulta el estado de un job específico.
- Estados: `pending`, `running`, `completed`, `failed`
- Incluye progreso (0-100%)
- Retorna resultados OUT cuando completa

### 3. GET `/jobs`
Lista todos los jobs activos y completados (últimas 24 horas).

## 📊 Estructura de Job

```json
{
  "id": "a3f5e8d9c2b4a1e7...",
  "status": "completed",
  "procedure_name": "PKG_ETL.PROCESO_LARGO",
  "start_time": "2025-12-10T14:30:00Z",
  "end_time": "2025-12-10T14:35:00Z",
  "duration": "5m0s",
  "progress": 100,
  "result": {
    "vRESULTADO": 12500
  }
}
```

## 🎯 Casos de Uso

✅ **Procesos ETL** que tardan minutos u horas  
✅ **Reportes pesados** con miles de registros  
✅ **Carga masiva de datos**  
✅ **Procesamiento batch nocturno**  
✅ **Exportaciones grandes**  

## 🔧 Características Técnicas

- **Goroutines**: Cada job corre en su propia goroutine
- **Thread-safe**: Usa `sync.RWMutex` para acceso concurrente
- **Limpieza automática**: Jobs > 24 horas se eliminan cada hora
- **IDs únicos**: Generados con `crypto/rand` (32 caracteres hex)
- **Progreso simulado**: 0% → 10% → 30% → 50% → 80% → 100%

## 📖 Documentación

- **[PROCEDIMIENTOS_ASINCRONOS.md](PROCEDIMIENTOS_ASINCRONOS.md)** - Guía completa con 4 ejemplos
- **[EJEMPLO_ASYNC.md](EJEMPLO_ASYNC.md)** - Ejemplo simple paso a paso
- **[test_async.js](../scripts/test_async.js)** - Script de pruebas automatizadas

## 🚀 Ejemplo Rápido

```javascript
// 1. Lanzar
const res = await fetch('http://localhost:8080/procedure/async', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer tu_token'
  },
  body: JSON.stringify({
    name: 'PKG_ETL.PROCESO_LARGO',
    params: [
      { name: 'vFECHA', value: '2025-12-10' },
      { name: 'vRESULTADO', direction: 'OUT', type: 'number' }
    ]
  })
});

const { job_id } = await res.json();

// 2. Consultar estado (polling cada 10s)
setInterval(async () => {
  const status = await fetch(`http://localhost:8080/jobs/${job_id}`, {
    headers: { 'Authorization': 'Bearer tu_token' }
  });
  const job = await status.json();
  
  console.log(`${job.status}: ${job.progress}%`);
  
  if (job.status === 'completed') {
    console.log('Resultado:', job.result);
  }
}, 10000);
```

## ⚠️ Limitaciones

- Jobs NO son persistentes (se pierden al reiniciar la API)
- NO se pueden cancelar jobs en ejecución
- Limpieza automática después de 24 horas
- Sin límite de jobs concurrentes (puede consumir memoria)

## 🧪 Pruebas

```bash
# Ejecutar script de pruebas
node scripts/test_async.js
```

El script prueba:
1. ✅ Ejecución asíncrona básica
2. ✅ Múltiples jobs en paralelo
3. ✅ Manejo de errores
4. ✅ Listado de jobs

## 📊 Comparación

| Característica | `/procedure` | `/procedure/async` |
|----------------|--------------|-------------------|
| Respuesta | Resultado inmediato | Job ID |
| Bloqueo | Sí | No |
| Timeout | Sí | No |
| Complejidad | Simple | Requiere polling |
| Uso ideal | < 30 segundos | > 1 minuto |

## 🔄 Cambios en el Código

### main.go
- Agregados `crypto/rand`, `encoding/hex`, `sync`
- Nueva estructura `AsyncJob` con estados
- `JobManager` con métodos thread-safe
- Handler `asyncProcedureHandler`
- Handler `jobsHandler` (maneja `/jobs` y `/jobs/{id}`)
- Limpieza automática cada hora

### Endpoints registrados
```go
http.HandleFunc("/procedure/async", logRequest(authMiddleware(asyncProcedureHandler)))
http.HandleFunc("/jobs/", logRequest(authMiddleware(jobsHandler)))
```

## ✅ Estado del Proyecto

- [x] Implementación completa
- [x] Compilación sin errores
- [x] Documentación detallada
- [x] Scripts de prueba
- [x] Ejemplo simple
- [x] README actualizado

## 🎉 Listo para Usar

El proyecto está completamente funcional y documentado. Puedes:

1. **Compilar**: `go build -o go-oracle-api.exe main.go`
2. **Ejecutar**: `./go-oracle-api.exe`
3. **Probar**: `node scripts/test_async.js`
4. **Leer**: Consulta `docs/PROCEDIMIENTOS_ASINCRONOS.md`

---

**Fecha de implementación**: 10 de diciembre de 2025  
**Branch**: `llamadas-async`
