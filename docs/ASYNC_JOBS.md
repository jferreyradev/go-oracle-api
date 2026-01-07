# 📋 Sistema de Jobs Asíncronos

Documentación completa del sistema de jobs asíncronos de go-oracle-api.

## 📑 Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Configuración Inicial](#configuración-inicial)
- [Uso Básico](#uso-básico)
- [API Reference](#api-reference)
- [Almacenamiento en BD](#almacenamiento-en-bd)
- [Monitoreo](#monitoreo)
- [Limpieza de Jobs](#limpieza-de-jobs)
- [Solución de Problemas](#solución-de-problemas)

## 🎯 Descripción General

El sistema de jobs asíncronos permite ejecutar procedimientos almacenados de Oracle de forma no bloqueante. Esto es útil para:

- **Procedimientos lentos**: Operaciones que toman varios segundos o minutos
- **Procesamiento en lote**: Operaciones que procesan grandes cantidades de datos
- **Tareas programadas**: Ejecutar operaciones sin esperar su finalización
- **Mejor experiencia de usuario**: La API responde inmediatamente con un job_id

### Estados de Jobs

| Estado | Descripción |
|--------|-------------|
| `pending` | Job creado, esperando ejecución |
| `running` | Job ejecutándose actualmente |
| `completed` | Job finalizado exitosamente |
| `failed` | Job terminó con error |

### Progreso

Cada job tiene un campo `progress` (0-100) que indica el avance:
- 0% - Creado
- 30% - Parámetros procesados
- 50% - Statement preparado
- 80% - Ejecución completa
- 100% - Finalizado (success o error)

## ⚙️ Configuración Inicial

### 1. Crear Tabla ASYNC_JOBS

Ejecuta el script SQL para crear la tabla que almacena los jobs:

```bash
# Desde SQL*Plus o tu cliente SQL favorito
sqlplus usuario/password@database @sql/create_async_jobs_table.sql
```

O desde la API (si tienes permisos):
```bash
curl -X POST http://localhost:3000/setup/tables \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. Crear Procedimientos de Prueba

Para testing, crea los procedimientos de ejemplo:

```bash
sqlplus usuario/password@database @sql/create_test_procedures.sql
```

Procedimientos creados:
- `PROC_TEST` - Procedimiento simple
- `PROC_TEST_DEMORA` - Simula operación lenta (útil para async)
- `PROC_TEST_PARAMS` - Múltiples tipos de parámetros
- `PROC_TEST_CURSOR` - Retorna cursor
- `PROC_TEST_ERROR` - Manejo de errores
- `PROC_TEST_DML` - Operaciones DML

## 🚀 Uso Básico

### Crear Job Asíncrono

```javascript
const response = await fetch('http://localhost:3000/procedure/async', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test1'
  },
  body: JSON.stringify({
    name: "PROC_TEST_DEMORA",
    params: [
      { 
        name: "segundos", 
        value: 5, 
        direction: "IN", 
        type: "NUMBER" 
      }
    ]
  })
});

const data = await response.json();
console.log('Job ID:', data.job_id);
// Output: Job ID: a1b2c3d4e5f6...
```

### Consultar Estado del Job

```javascript
const jobId = "a1b2c3d4e5f6...";
const response = await fetch(`http://localhost:3000/jobs/${jobId}`, {
  headers: {
    'Authorization': 'Bearer test1'
  }
});

const job = await response.json();
console.log('Estado:', job.status);
console.log('Progreso:', job.progress + '%');

if (job.status === 'completed') {
  console.log('Resultado:', job.result);
} else if (job.status === 'failed') {
  console.log('Error:', job.error);
}
```

### Monitorear Job hasta Completar

```javascript
async function waitForJob(jobId, maxAttempts = 30, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`http://localhost:3000/jobs/${jobId}`);
    const job = await response.json();
    
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    
    console.log(`Progreso: ${job.progress}%`);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timeout esperando job');
}

// Uso
const job = await waitForJob('a1b2c3d4e5f6...');
```

## 📚 API Reference

### POST /procedure/async

Crea y ejecuta un job asíncrono.

**Request:**
```json
{
  "name": "NOMBRE_PROCEDIMIENTO",
  "params": [
    {
      "name": "param1",
      "value": "valor",
      "direction": "IN|OUT|INOUT",
      "type": "STRING|NUMBER|DATE"
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "status": "ok",
  "job_id": "a1b2c3d4e5f6...",
  "message": "Job creado y ejecutándose"
}
```

### GET /jobs

Lista todos los jobs.

**Response:**
```json
{
  "total": 5,
  "jobs": [
    {
      "id": "a1b2c3d4...",
      "status": "completed",
      "procedure_name": "PROC_TEST",
      "start_time": "2024-12-16T15:30:00Z",
      "end_time": "2024-12-16T15:30:05Z",
      "duration": "5.2s",
      "progress": 100,
      "result": { "output": "valor" }
    }
  ]
}
```

### GET /jobs/:id

Obtiene un job específico por ID.

**Response:**
```json
{
  "id": "a1b2c3d4...",
  "status": "running",
  "procedure_name": "PROC_LARGO",
  "params": { "param1": "valor" },
  "start_time": "2024-12-16T15:30:00Z",
  "progress": 50
}
```

### DELETE /jobs/:id

Elimina un job específico.

**Response:**
```json
{
  "message": "Job eliminado correctamente",
  "job_id": "a1b2c3d4..."
}
```

### DELETE /jobs?status=...&older_than=...

Elimina múltiples jobs según filtros.

**Parámetros:**
- `status`: Estados a eliminar (comma-separated): `completed,failed`
- `older_than`: Días de antigüedad (número): `7`

**Ejemplos:**
```bash
# Eliminar todos los jobs completados
DELETE /jobs?status=completed

# Eliminar jobs completados o fallidos
DELETE /jobs?status=completed,failed

# Eliminar jobs con más de 7 días
DELETE /jobs?older_than=7

# Combinar filtros
DELETE /jobs?status=completed&older_than=7
```

**Response:**
```json
{
  "message": "Jobs eliminados correctamente",
  "deleted": 15
}
```

## 💾 Almacenamiento en BD

Los jobs se guardan automáticamente en la tabla `ASYNC_JOBS`:

```sql
-- Ver todos los jobs
SELECT * FROM ASYNC_JOBS ORDER BY START_TIME DESC;

-- Jobs activos
SELECT * FROM ASYNC_JOBS 
WHERE STATUS IN ('pending', 'running');

-- Jobs completados hoy
SELECT * FROM ASYNC_JOBS 
WHERE STATUS = 'completed' 
AND TRUNC(START_TIME) = TRUNC(SYSDATE);

-- Jobs que fallaron
SELECT JOB_ID, PROCEDURE_NAME, ERROR_MSG
FROM ASYNC_JOBS 
WHERE STATUS = 'failed'
ORDER BY START_TIME DESC;
```

### Estructura de la Tabla

```sql
CREATE TABLE ASYNC_JOBS (
    JOB_ID VARCHAR2(32) PRIMARY KEY,
    STATUS VARCHAR2(20) CHECK (STATUS IN ('pending', 'running', 'completed', 'failed')),
    PROCEDURE_NAME VARCHAR2(200) NOT NULL,
    PARAMS CLOB,                    -- JSON
    START_TIME TIMESTAMP NOT NULL,
    END_TIME TIMESTAMP,
    DURATION VARCHAR2(50),
    RESULT CLOB,                    -- JSON
    ERROR_MSG CLOB,
    PROGRESS NUMBER CHECK (PROGRESS BETWEEN 0 AND 100),
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 📊 Monitoreo

### Herramienta CLI

Usa el script `view_status.js` para monitorear jobs:

```bash
# Ver todos los jobs
node scripts/view_status.js jobs

# Ver solo jobs activos
node scripts/view_status.js jobs:active

# Ver jobs completados
node scripts/view_status.js jobs:completed

# Ver jobs fallidos
node scripts/view_status.js jobs:failed
```

### Suite de Pruebas

Ejecuta tests de jobs:

```bash
# Test de jobs asíncronos
node scripts/test_api.js async

# Test de gestión de jobs
node scripts/test_api.js jobs
```

## 🧹 Limpieza de Jobs

### Limpieza Manual

```bash
# Eliminar jobs completados hace más de 7 días
curl -X DELETE "http://localhost:3000/jobs?status=completed&older_than=7" \
  -H "Authorization: Bearer test1"
```

### Limpieza desde Oracle

```sql
-- Procedimiento de limpieza
DECLARE
  v_deleted NUMBER;
BEGIN
  CLEANUP_OLD_ASYNC_JOBS(
    p_days_old => 7,
    p_deleted_count => v_deleted
  );
  DBMS_OUTPUT.PUT_LINE('Jobs eliminados: ' || v_deleted);
END;
/
```

### Limpieza Automática

El servidor limpia automáticamente jobs antiguos al iniciar:

```go
// En main.go - se ejecuta cada 24 horas
go func() {
    ticker := time.NewTicker(24 * time.Hour)
    for range ticker.C {
        jobManager.CleanupOldJobs()
    }
}()
```

## 🔧 Solución de Problemas

### Error: "Procedimiento no encontrado"

**Problema:** El job falla inmediatamente con error PLS-00201.

**Solución:**
1. Verifica que el procedimiento existe:
   ```sql
   SELECT object_name, status 
   FROM user_objects 
   WHERE object_name = 'TU_PROCEDIMIENTO';
   ```
2. Verifica que el usuario tiene permisos de ejecución
3. Usa el nombre correcto (mayúsculas en Oracle por defecto)

### Error: "Parámetros incorrectos"

**Problema:** El job falla con error PLS-00306.

**Solución:**
1. Verifica la firma del procedimiento:
   ```sql
   SELECT argument_name, data_type, in_out, position
   FROM user_arguments
   WHERE object_name = 'TU_PROCEDIMIENTO'
   ORDER BY position;
   ```
2. Asegúrate de pasar el número correcto de parámetros
3. Verifica que los tipos coincidan (NUMBER, VARCHAR2, DATE, etc.)

### Jobs Quedan en Estado "pending"

**Problema:** Los jobs no pasan de estado pending.

**Solución:**
1. Verifica que el servidor esté ejecutándose
2. Revisa los logs del servidor para errores
3. Verifica la conexión a la base de datos
4. Reinicia el servidor si es necesario

### Jobs No Se Guardan en BD

**Problema:** Los jobs funcionan pero no aparecen en ASYNC_JOBS.

**Solución:**
1. Verifica que la tabla existe:
   ```sql
   SELECT * FROM user_tables WHERE table_name = 'ASYNC_JOBS';
   ```
2. Si no existe, ejecuta: `@sql/create_async_jobs_table.sql`
3. Verifica permisos de INSERT en la tabla

### Error de Conversión de Tipos (ORA-06502)

**Problema:** El job falla con "Error de conversión de tipos".

**Solución:**
1. Verifica que los tipos en el JSON coincidan con Oracle:
   - `type: "NUMBER"` para números
   - `type: "STRING"` para texto
   - `type: "DATE"` para fechas
2. Para fechas, usa formato ISO: `"2024-12-16T15:30:00Z"`
3. Para números, envía valores numéricos no strings: `value: 123` no `"123"`

## 📝 Ejemplos Completos

### Ejemplo 1: Procedimiento Simple

```javascript
// Crear job
const createRes = await fetch('http://localhost:3000/procedure/async', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test1'
  },
  body: JSON.stringify({
    name: "PROC_TEST",
    params: [
      { name: "p_input", value: "Test", direction: "IN" },
      { name: "p_output", direction: "OUT", type: "STRING" }
    ]
  })
});

const { job_id } = await createRes.json();

// Esperar resultado
await new Promise(resolve => setTimeout(resolve, 2000));

// Obtener resultado
const resultRes = await fetch(`http://localhost:3000/jobs/${job_id}`);
const job = await resultRes.json();

console.log(job.result); // { p_output: "Procesado: Test" }
```

### Ejemplo 2: Procedimiento con Demora

```javascript
const createRes = await fetch('http://localhost:3000/procedure/async', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test1'
  },
  body: JSON.stringify({
    name: "PROC_TEST_DEMORA",
    params: [
      { name: "segundos", value: 10, direction: "IN", type: "NUMBER" }
    ]
  })
});

const { job_id } = await createRes.json();

// Monitorear progreso
const interval = setInterval(async () => {
  const res = await fetch(`http://localhost:3000/jobs/${job_id}`);
  const job = await res.json();
  
  console.log(`[${job.status}] ${job.progress}%`);
  
  if (job.status === 'completed' || job.status === 'failed') {
    clearInterval(interval);
  }
}, 1000);
```

## 🎓 Mejores Prácticas

1. **Siempre especifica el tipo de parámetro**: Ayuda a evitar errores de conversión
2. **Monitorea jobs largos**: Usa polling con intervalos razonables (1-5 segundos)
3. **Limpia jobs antiguos**: Configura limpieza automática o manual regular
4. **Maneja errores**: Siempre verifica el estado del job antes de usar el resultado
5. **Usa nombres descriptivos**: Facilita el debugging y monitoreo
6. **Documenta procedimientos**: Mantén documentación de parámetros esperados

---

**Documentación actualizada:** 16 de diciembre de 2024  
**go-oracle-api** - Sistema de Jobs Asíncronos
