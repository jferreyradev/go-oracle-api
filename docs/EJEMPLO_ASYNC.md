# Ejemplo Simple: Procedimiento Asíncrono

## Caso de uso
Tienes un procedimiento que tarda 5 minutos en ejecutarse. No quieres que tu aplicación web se quede esperando 5 minutos.

## Solución: Ejecución Asíncrona

### 1. Lanzar el procedimiento

```bash
curl -X POST http://localhost:8080/procedure/async \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer tu_token" \
  -d '{
    "name": "PKG_ETL.PROCESO_LARGO",
    "params": [
      {"name": "vFECHA", "value": "2025-12-10"},
      {"name": "vRESULTADO", "direction": "OUT", "type": "number"}
    ]
  }'
```

**Respuesta inmediata (202 Accepted):**
```json
{
  "status": "accepted",
  "job_id": "a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8",
  "message": "Procedimiento ejecutándose en segundo plano",
  "check_status_url": "/jobs/a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8"
}
```

### 2. Consultar el estado

**Mientras está ejecutándose:**
```bash
curl http://localhost:8080/jobs/a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8 \
  -H "Authorization: Bearer tu_token"
```

```json
{
  "id": "a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8",
  "status": "running",
  "procedure_name": "PKG_ETL.PROCESO_LARGO",
  "start_time": "2025-12-10T14:30:00Z",
  "progress": 50
}
```

**Cuando termina:**
```json
{
  "id": "a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8",
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

### 3. En tu código JavaScript

```javascript
// Lanzar
const response = await fetch('http://localhost:8080/procedure/async', {
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

const { job_id } = await response.json();

// Mostrar mensaje al usuario
alert('Proceso iniciado. Te notificaremos cuando termine.');

// Consultar cada 10 segundos
const checkInterval = setInterval(async () => {
  const res = await fetch(`http://localhost:8080/jobs/${job_id}`, {
    headers: { 'Authorization': 'Bearer tu_token' }
  });
  
  const job = await res.json();
  
  // Actualizar UI con progreso
  document.getElementById('progress').textContent = `${job.progress}%`;
  
  if (job.status === 'completed') {
    clearInterval(checkInterval);
    alert(`¡Completado! Resultado: ${job.result.vRESULTADO}`);
  } else if (job.status === 'failed') {
    clearInterval(checkInterval);
    alert(`Error: ${job.error}`);
  }
}, 10000);
```

## Diferencia Visual

### ❌ Modo Síncrono (el problema)
```
Usuario hace clic en "Generar Reporte"
     ↓
[⏳ Navegador esperando... 5 minutos... pantalla congelada]
     ↓
✅ Reporte listo
```

### ✅ Modo Asíncrono (la solución)
```
Usuario hace clic en "Generar Reporte"
     ↓
⚡ Respuesta inmediata: "Generando reporte..."
     ↓
[Usuario puede seguir usando la app]
     ↓
Cada 10 segundos: consultar estado
     ↓
Cuando termina: "✅ Reporte listo para descargar"
```

## Preguntas Frecuentes

**P: ¿Cuánto tiempo puede tardar un procedimiento?**  
R: Sin límite. Puede tardar horas si es necesario.

**P: ¿Puedo lanzar varios al mismo tiempo?**  
R: Sí, puedes tener múltiples procedimientos ejecutándose en paralelo.

**P: ¿Qué pasa si reinicio la API mientras un job está corriendo?**  
R: Se pierde. Los jobs no son persistentes (por ahora).

**P: ¿Cómo sé si un job falló?**  
R: El estado será `"failed"` y habrá un campo `"error"` con el mensaje.

**P: ¿Por cuánto tiempo se guardan los jobs?**  
R: 24 horas. Después se eliminan automáticamente.

---

Para más ejemplos, ver: [PROCEDIMIENTOS_ASINCRONOS.md](PROCEDIMIENTOS_ASINCRONOS.md)
