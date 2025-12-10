# Procedimientos Asíncronos - Guía Completa

## Descripción General

Para procedimientos de larga duración (ETL, reportes pesados, procesamiento batch), la API ofrece **ejecución asíncrona**. Esto permite que el cliente reciba una respuesta inmediata con un ID de seguimiento, mientras el procedimiento se ejecuta en segundo plano.

## Ventajas de la Ejecución Asíncrona

✅ **No bloquea el cliente** - Respuesta inmediata (HTTP 202 Accepted)  
✅ **Sin timeouts** - El procedimiento puede ejecutarse durante horas  
✅ **Seguimiento de progreso** - Consulta el estado en cualquier momento  
✅ **Múltiples ejecuciones paralelas** - Lanza varios procedimientos simultáneamente  
✅ **Historial de ejecuciones** - Los jobs se conservan 24 horas  
✅ **Persistencia en Oracle** - Los jobs sobreviven reinicios de la API

## Persistencia de Jobs

**IMPORTANTE**: Los jobs asíncronos se guardan en la base de datos Oracle en la tabla `ASYNC_JOBS`.

### Características de Persistencia

- **Tabla automática**: Al iniciar la API, se crea automáticamente la tabla `ASYNC_JOBS` si no existe
- **Carga al inicio**: Al arrancar, la API carga todos los jobs de las últimas 24 horas
- **Actualización en tiempo real**: Cada cambio de estado se guarda en la base de datos
- **Consulta desde DB**: Puedes consultar jobs directamente en Oracle si es necesario
- **Limpieza automática**: Jobs mayores a 24 horas se eliminan automáticamente

### Consultas SQL Disponibles

```sql
-- Ver todos los jobs activos
SELECT * FROM V_ASYNC_JOBS_RECENT ORDER BY START_TIME DESC;

-- Ver jobs de un procedimiento específico
SELECT * FROM ASYNC_JOBS WHERE PROCEDURE_NAME = 'PKG_ETL.PROCESO_LARGO';

-- Ver jobs fallidos
SELECT * FROM ASYNC_JOBS WHERE STATUS = 'failed' ORDER BY START_TIME DESC;

-- Ver estadísticas de duración
SELECT 
  PROCEDURE_NAME,
  COUNT(*) as total_ejecuciones,
  AVG((END_TIME - START_TIME) * 24 * 60) as promedio_minutos
FROM ASYNC_JOBS
WHERE STATUS = 'completed'
GROUP BY PROCEDURE_NAME;

-- Limpiar jobs antiguos manualmente
BEGIN
  CLEANUP_OLD_ASYNC_JOBS(p_days_old => 7);
END;
```

## Endpoints Disponibles

### 1. Ejecutar Procedimiento Asíncrono

**POST** `/procedure/async`

Inicia la ejecución de un procedimiento en segundo plano.

**Request:**
```json
{
  "name": "PKG_ETL.PROCESO_LARGO",
  "params": [
    { "name": "vFECHA", "value": "2025-12-10" },
    { "name": "vRESULTADO", "direction": "OUT", "type": "number" }
  ]
}
```

**Response:** `202 Accepted`
```json
{
  "status": "accepted",
  "job_id": "a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8",
  "message": "Procedimiento ejecutándose en segundo plano",
  "check_status_url": "/jobs/a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8"
}
```

### 2. Consultar Estado de un Job

**GET** `/jobs/{job_id}`

Consulta el estado y resultado de un job específico.

**Response (En ejecución):**
```json
{
  "id": "a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8",
  "status": "running",
  "procedure_name": "PKG_ETL.PROCESO_LARGO",
  "start_time": "2025-12-10T14:30:00Z",
  "progress": 65
}
```

**Response (Completado):**
```json
{
  "id": "a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8",
  "status": "completed",
  "procedure_name": "PKG_ETL.PROCESO_LARGO",
  "start_time": "2025-12-10T14:30:00Z",
  "end_time": "2025-12-10T14:45:30Z",
  "duration": "15m30s",
  "progress": 100,
  "result": {
    "vRESULTADO": 1250
  }
}
```

**Response (Fallido):**
```json
{
  "id": "a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8",
  "status": "failed",
  "procedure_name": "PKG_ETL.PROCESO_LARGO",
  "start_time": "2025-12-10T14:30:00Z",
  "end_time": "2025-12-10T14:32:15Z",
  "duration": "2m15s",
  "progress": 100,
  "error": "ORA-01555: snapshot too old"
}
```

### 3. Listar Todos los Jobs

**GET** `/jobs`

Lista todos los jobs registrados en las últimas 24 horas.

**Response:**
```json
{
  "total": 3,
  "jobs": [
    {
      "id": "a3f5e8d9c2b4a1e7f6d8c9b2a1e7f6d8",
      "status": "completed",
      "procedure_name": "PKG_ETL.PROCESO_LARGO",
      "start_time": "2025-12-10T14:30:00Z",
      "end_time": "2025-12-10T14:45:30Z",
      "duration": "15m30s",
      "progress": 100
    },
    {
      "id": "b4f6e9d0c3b5a2e8f7d9c0b3a2e8f7d9",
      "status": "running",
      "procedure_name": "PKG_REPORTES.GENERAR_MENSUAL",
      "start_time": "2025-12-10T15:00:00Z",
      "progress": 45
    },
    {
      "id": "c5f7e0d1c4b6a3e9f8d0c1b4a3e9f8d0",
      "status": "pending",
      "procedure_name": "PKG_BACKUP.EXPORTAR_DATOS",
      "start_time": "2025-12-10T15:10:00Z",
      "progress": 0
    }
  ]
}
```

## Estados de un Job

| Estado | Descripción | Progress |
|--------|-------------|----------|
| `pending` | Job creado pero aún no iniciado | 0 |
| `running` | Procedimiento en ejecución | 10-80 |
| `completed` | Finalizado exitosamente | 100 |
| `failed` | Error durante la ejecución | 100 |

## Ejemplos de Uso

### Ejemplo 1: Proceso ETL de Larga Duración

```javascript
// 1. Iniciar el proceso asíncrono
const response = await fetch('http://localhost:8080/procedure/async', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer tu_token'
  },
  body: JSON.stringify({
    name: 'PKG_ETL.CARGAR_DATOS_MASIVOS',
    params: [
      { name: 'vFECHA_INICIO', value: '2025-01-01' },
      { name: 'vFECHA_FIN', value: '2025-12-31' },
      { name: 'vREGISTROS_PROCESADOS', direction: 'OUT', type: 'number' }
    ]
  })
});

const data = await response.json();
console.log('Job ID:', data.job_id);

// 2. Polling: Consultar estado cada 10 segundos
async function checkStatus(jobId) {
  const res = await fetch(`http://localhost:8080/jobs/${jobId}`, {
    headers: { 'Authorization': 'Bearer tu_token' }
  });
  const job = await res.json();
  
  console.log(`Estado: ${job.status}, Progreso: ${job.progress}%`);
  
  if (job.status === 'running') {
    // Seguir consultando
    setTimeout(() => checkStatus(jobId), 10000);
  } else if (job.status === 'completed') {
    console.log('✅ Completado!');
    console.log('Resultado:', job.result);
    console.log('Duración:', job.duration);
  } else if (job.status === 'failed') {
    console.error('❌ Error:', job.error);
  }
}

checkStatus(data.job_id);
```

### Ejemplo 2: Generación de Reporte Mensual

```python
import requests
import time

API_URL = 'http://localhost:8080'
TOKEN = 'tu_token'
headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {TOKEN}'
}

# Iniciar generación de reporte
response = requests.post(f'{API_URL}/procedure/async', 
    headers=headers,
    json={
        'name': 'PKG_REPORTES.GENERAR_REPORTE_MENSUAL',
        'params': [
            {'name': 'vMES', 'value': 12},
            {'name': 'vANIO', 'value': 2025},
            {'name': 'vTOTAL_REGISTROS', 'direction': 'OUT', 'type': 'number'}
        ]
    })

job_id = response.json()['job_id']
print(f'Job iniciado: {job_id}')

# Esperar a que termine
while True:
    status_response = requests.get(f'{API_URL}/jobs/{job_id}', 
        headers={'Authorization': f'Bearer {TOKEN}'})
    job = status_response.json()
    
    print(f"[{job['status'].upper()}] Progreso: {job['progress']}%")
    
    if job['status'] in ['completed', 'failed']:
        break
    
    time.sleep(5)  # Esperar 5 segundos antes de consultar nuevamente

if job['status'] == 'completed':
    print(f"✅ Reporte generado en {job['duration']}")
    print(f"Total de registros: {job['result']['vTOTAL_REGISTROS']}")
else:
    print(f"❌ Error: {job['error']}")
```

### Ejemplo 3: Múltiples Procesos en Paralelo

```javascript
// Lanzar varios procesos en paralelo
const procesos = [
  { name: 'PKG_ETL.PROCESO_CLIENTES', params: [] },
  { name: 'PKG_ETL.PROCESO_VENTAS', params: [] },
  { name: 'PKG_ETL.PROCESO_PRODUCTOS', params: [] }
];

const jobs = [];

// Iniciar todos los procesos
for (const proceso of procesos) {
  const response = await fetch('http://localhost:8080/procedure/async', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer tu_token'
    },
    body: JSON.stringify(proceso)
  });
  
  const data = await response.json();
  jobs.push({ id: data.job_id, name: proceso.name });
  console.log(`✓ Iniciado: ${proceso.name} (${data.job_id})`);
}

// Monitorear todos los jobs
async function monitorearTodos() {
  const response = await fetch('http://localhost:8080/jobs', {
    headers: { 'Authorization': 'Bearer tu_token' }
  });
  
  const { jobs: allJobs } = await response.json();
  
  console.clear();
  console.log('=== Estado de Procesos ===\n');
  
  allJobs.forEach(job => {
    const emoji = {
      'pending': '⏳',
      'running': '🔄',
      'completed': '✅',
      'failed': '❌'
    }[job.status];
    
    console.log(`${emoji} ${job.procedure_name}`);
    console.log(`   Estado: ${job.status} (${job.progress}%)`);
    if (job.duration) console.log(`   Duración: ${job.duration}`);
    console.log();
  });
  
  const allCompleted = allJobs.every(j => 
    j.status === 'completed' || j.status === 'failed'
  );
  
  if (!allCompleted) {
    setTimeout(monitorearTodos, 5000);
  } else {
    console.log('🎉 Todos los procesos finalizaron');
  }
}

monitorearTodos();
```

### Ejemplo 4: Con Reintentos Automáticos

```javascript
async function ejecutarConReintentos(procedimiento, maxReintentos = 3) {
  for (let intento = 1; intento <= maxReintentos; intento++) {
    console.log(`Intento ${intento}/${maxReintentos}...`);
    
    // Iniciar job
    const response = await fetch('http://localhost:8080/procedure/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer tu_token'
      },
      body: JSON.stringify(procedimiento)
    });
    
    const { job_id } = await response.json();
    
    // Esperar resultado
    const resultado = await esperarJob(job_id);
    
    if (resultado.status === 'completed') {
      console.log('✅ Éxito en intento', intento);
      return resultado;
    }
    
    console.error(`❌ Falló intento ${intento}:`, resultado.error);
    
    if (intento < maxReintentos) {
      await new Promise(r => setTimeout(r, 5000)); // Esperar 5s antes de reintentar
    }
  }
  
  throw new Error('Máximo de reintentos alcanzado');
}

async function esperarJob(jobId) {
  while (true) {
    const res = await fetch(`http://localhost:8080/jobs/${jobId}`, {
      headers: { 'Authorization': 'Bearer tu_token' }
    });
    const job = await res.json();
    
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    
    await new Promise(r => setTimeout(r, 3000));
  }
}

// Usar
try {
  const resultado = await ejecutarConReintentos({
    name: 'PKG_ETL.PROCESO_CRITICO',
    params: [
      { name: 'vFECHA', value: '2025-12-10' },
      { name: 'vRESULTADO', direction: 'OUT', type: 'number' }
    ]
  });
  console.log('Resultado final:', resultado.result);
} catch (error) {
  console.error('Error fatal:', error);
}
```

## Buenas Prácticas

### 1. Polling Inteligente

No consultes el estado demasiado frecuentemente:

```javascript
// ❌ MAL: Polling cada segundo (sobrecarga)
setInterval(() => checkStatus(jobId), 1000);

// ✅ BIEN: Polling adaptativo
async function pollingAdaptativo(jobId) {
  let intervalo = 5000; // Empezar con 5 segundos
  
  while (true) {
    const job = await checkStatus(jobId);
    
    if (job.status !== 'running') break;
    
    // Aumentar el intervalo gradualmente
    if (job.progress < 30) intervalo = 5000;   // 5s al inicio
    else if (job.progress < 70) intervalo = 10000;  // 10s en medio
    else intervalo = 3000;  // 3s cerca del final
    
    await new Promise(r => setTimeout(r, intervalo));
  }
}
```

### 2. Manejo de Errores

```javascript
async function ejecutarSeguro(procedimiento) {
  try {
    const response = await fetch('http://localhost:8080/procedure/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer tu_token'
      },
      body: JSON.stringify(procedimiento)
    });
    
    if (response.status !== 202) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    
    const { job_id } = await response.json();
    return await monitorearJob(job_id);
    
  } catch (error) {
    if (error.message.includes('fetch')) {
      console.error('Error de conexión - API no disponible');
    } else {
      console.error('Error:', error);
    }
    throw error;
  }
}
```

### 3. Timeout del Cliente

Aunque el servidor no tiene timeout, puedes implementar uno en el cliente:

```javascript
async function ejecutarConTimeout(procedimiento, timeoutMs = 600000) {
  const response = await fetch('http://localhost:8080/procedure/async', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer tu_token'
    },
    body: JSON.stringify(procedimiento)
  });
  
  const { job_id } = await response.json();
  
  return Promise.race([
    monitorearJob(job_id),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout del cliente')), timeoutMs)
    )
  ]);
}
```

### 4. Notificaciones al Usuario

```javascript
async function ejecutarConNotificaciones(procedimiento) {
  const { job_id } = await iniciarJob(procedimiento);
  
  // Mostrar notificación inicial
  showNotification('info', 'Proceso iniciado', 'El proceso se está ejecutando...');
  
  const resultado = await monitorearJob(job_id, (progress) => {
    // Actualizar UI con progreso
    updateProgressBar(progress);
  });
  
  if (resultado.status === 'completed') {
    showNotification('success', 'Completado', `Duración: ${resultado.duration}`);
  } else {
    showNotification('error', 'Error', resultado.error);
  }
  
  return resultado;
}
```

## Limpieza de Jobs

Los jobs se **eliminan automáticamente después de 24 horas** para evitar consumo de memoria.

Para limpiar manualmente:
- Reinicia la API (todos los jobs se pierden)
- Espera 24 horas (limpieza automática cada hora)

## Limitaciones

- ⚠️ **Jobs no persistentes**: Si la API se reinicia, se pierden todos los jobs en ejecución
- ⚠️ **Sin cancelación**: No se puede cancelar un job una vez iniciado
- ⚠️ **Memoria limitada**: Muchos jobs simultáneos pueden consumir memoria

## Casos de Uso Recomendados

✅ **Ideal para:**
- Procesos ETL de larga duración (> 1 minuto)
- Generación de reportes pesados
- Carga masiva de datos
- Procesamiento batch nocturno
- Exportación de datos grandes

❌ **No recomendado para:**
- Consultas simples (usar `/query` síncrono)
- Procedimientos rápidos (< 5 segundos)
- Operaciones que requieren respuesta inmediata
- Transacciones que afectan datos críticos en tiempo real

## Comparación: Síncrono vs Asíncrono

| Característica | `/procedure` (Síncrono) | `/procedure/async` (Asíncrono) |
|----------------|------------------------|-------------------------------|
| Respuesta | Inmediata con resultado | Job ID para seguimiento |
| Tiempo máximo | Limitado por timeouts | Sin límite |
| Bloqueo | Bloquea conexión HTTP | No bloquea |
| Uso de memoria | Mínimo | Moderado (por job) |
| Ideal para | Procesos < 30 segundos | Procesos > 1 minuto |
| Complejidad | Simple | Requiere polling |

## Troubleshooting

### Problema: Job se queda en "pending"

**Causa:** Puede no haberse iniciado la goroutine.

**Solución:** Verifica los logs de la API para errores de ejecución.

### Problema: No encuentro un job antiguo

**Causa:** Los jobs se limpian después de 24 horas.

**Solución:** Guarda los resultados importantes antes de las 24 horas.

### Problema: Muchos jobs en "running" pero no avanzan

**Causa:** Posible deadlock en Oracle o conexión perdida.

**Solución:** 
1. Verifica la sesión en Oracle: `SELECT * FROM v$session WHERE username = 'TU_USUARIO'`
2. Reinicia la API si es necesario

### Problema: Error "Job no encontrado"

**Causa:** Job ID incorrecto o job ya eliminado (> 24 horas).

**Solución:** Verifica el ID con `/jobs` para listar todos los disponibles.

## Monitoreo y Logs

Los jobs asíncronos NO generan logs especiales. Para depuración, revisa el log general de la API:

```powershell
# Windows
type log\Produccion_2025-12-10_08-00-00.log

# Linux/macOS
tail -f log/Produccion_2025-12-10_08-00-00.log
```

## Próximas Mejoras Posibles

- [ ] Persistencia de jobs en base de datos
- [ ] Cancelación de jobs en ejecución
- [ ] Webhooks para notificaciones automáticas
- [ ] Límite de jobs concurrentes
- [ ] Priorización de jobs
- [ ] Logs específicos por job

---

**¿Necesitas ayuda?** Consulta los otros documentos:
- [USO_Y_PRUEBAS.md](USO_Y_PRUEBAS.md) - Guía de uso general
- [FUNCIONALIDADES_AVANZADAS.md](FUNCIONALIDADES_AVANZADAS.md) - Características avanzadas
