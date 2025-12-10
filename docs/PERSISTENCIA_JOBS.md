# Persistencia de Jobs Asíncronos en Oracle

## Resumen

Los jobs asíncronos ahora se **persisten automáticamente en Oracle**, lo que significa que sobrevivirán reinicios de la API y pueden ser consultados directamente desde la base de datos.

## Componentes Implementados

### 1. Tabla Oracle: `ASYNC_JOBS`

```sql
CREATE TABLE ASYNC_JOBS (
    JOB_ID VARCHAR2(32) PRIMARY KEY,
    STATUS VARCHAR2(20) NOT NULL,
    PROCEDURE_NAME VARCHAR2(200) NOT NULL,
    START_TIME TIMESTAMP NOT NULL,
    END_TIME TIMESTAMP,
    DURATION VARCHAR2(50),
    RESULT CLOB,
    ERROR_MSG CLOB,
    PROGRESS NUMBER DEFAULT 0,
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Funciones de Persistencia en Go

#### `InitializeAsyncJobsTable()`
- Se ejecuta al iniciar la API
- Crea la tabla `ASYNC_JOBS` automáticamente si no existe
- Crea 3 índices para optimizar consultas (STATUS, START_TIME, CREATED_AT)

#### `LoadJobsFromDB()`
- Carga todos los jobs de las últimas 24 horas al iniciar la API
- Permite recuperar el estado después de un reinicio
- Deserializa el campo RESULT desde JSON

#### `saveJobToDB(job *AsyncJob)`
- Guarda un nuevo job en la base de datos
- Se ejecuta en **goroutine** (no bloquea la respuesta HTTP)
- Llamada automáticamente desde `CreateJob()`

#### `updateJobInDB(job *AsyncJob)`
- Actualiza el estado de un job existente
- Serializa el campo RESULT a JSON
- Se ejecuta en **goroutine** (no bloquea)
- Llamada automáticamente desde `UpdateJob()`

## Ciclo de Vida de un Job

```
1. Cliente hace POST /procedure/async
   ↓
2. CreateJob() crea el job en memoria
   ↓
3. saveJobToDB() guarda en Oracle (async)
   ↓
4. Procedimiento se ejecuta en goroutine
   ↓
5. UpdateJob() actualiza estado cada cambio
   ↓
6. updateJobInDB() actualiza en Oracle (async)
   ↓
7. Cliente consulta GET /jobs/{id}
   ↓
8. Respuesta desde memoria (más rápido)
```

## Ventajas de la Persistencia

✅ **Tolerancia a fallos**: Si la API se reinicia, los jobs no se pierden  
✅ **Auditoría completa**: Historial de todas las ejecuciones en la base de datos  
✅ **Consultas SQL**: Puedes analizar jobs directamente con SQL  
✅ **Sin impacto en rendimiento**: Las escrituras son asíncronas  
✅ **Sincronización automática**: Memoria y BD siempre consistentes  

## Consultas SQL Útiles

### Ver jobs recientes
```sql
SELECT * FROM V_ASYNC_JOBS_RECENT ORDER BY START_TIME DESC;
```

### Ver jobs de un procedimiento específico
```sql
SELECT 
    JOB_ID, STATUS, START_TIME, END_TIME, DURATION, PROGRESS
FROM ASYNC_JOBS 
WHERE PROCEDURE_NAME = 'PKG_ETL.PROCESO_LARGO'
ORDER BY START_TIME DESC;
```

### Ver jobs fallidos con error
```sql
SELECT 
    JOB_ID, PROCEDURE_NAME, START_TIME, ERROR_MSG
FROM ASYNC_JOBS 
WHERE STATUS = 'failed'
ORDER BY START_TIME DESC;
```

### Estadísticas de duración por procedimiento
```sql
SELECT 
    PROCEDURE_NAME,
    COUNT(*) as total_ejecuciones,
    COUNT(CASE WHEN STATUS = 'completed' THEN 1 END) as exitosos,
    COUNT(CASE WHEN STATUS = 'failed' THEN 1 END) as fallidos,
    AVG(CASE 
        WHEN STATUS = 'completed' 
        THEN (END_TIME - START_TIME) * 24 * 60 
    END) as promedio_minutos
FROM ASYNC_JOBS
GROUP BY PROCEDURE_NAME
ORDER BY total_ejecuciones DESC;
```

### Ver progreso actual de jobs en ejecución
```sql
SELECT 
    JOB_ID, 
    PROCEDURE_NAME, 
    PROGRESS || '%' as progreso,
    ROUND((SYSDATE - START_TIME) * 24 * 60, 2) as minutos_transcurridos
FROM ASYNC_JOBS
WHERE STATUS = 'running'
ORDER BY START_TIME;
```

### Jobs más lentos (top 10)
```sql
SELECT 
    JOB_ID,
    PROCEDURE_NAME,
    START_TIME,
    ROUND((END_TIME - START_TIME) * 24 * 60, 2) as duracion_minutos,
    STATUS
FROM ASYNC_JOBS
WHERE END_TIME IS NOT NULL
ORDER BY (END_TIME - START_TIME) DESC
FETCH FIRST 10 ROWS ONLY;
```

## Limpieza Automática

La API ejecuta limpieza automática cada 1 hora, eliminando jobs completados hace más de 24 horas **solo de memoria** (no de la base de datos).

### Limpieza Manual desde Oracle

Para limpiar jobs antiguos de la base de datos:

```sql
-- Limpiar jobs mayores a 7 días
BEGIN
    CLEANUP_OLD_ASYNC_JOBS(p_days_old => 7);
END;

-- Limpiar jobs mayores a 30 días
BEGIN
    CLEANUP_OLD_ASYNC_JOBS(p_days_old => 30);
END;

-- Ver cuántos jobs se limpiarían antes de ejecutar
SELECT COUNT(*) 
FROM ASYNC_JOBS 
WHERE CREATED_AT < SYSDATE - 7;
```

## Instalación

### Opción 1: Creación automática al iniciar la API

La API crea la tabla automáticamente la primera vez que se inicia. Solo verifica que el usuario tenga permisos:

```sql
GRANT CREATE TABLE TO tu_usuario;
GRANT CREATE INDEX TO tu_usuario;
```

### Opción 2: Creación manual

Ejecuta el script completo:

```bash
sqlplus usuario/contraseña@servicio @sql/create_async_jobs_table.sql
```

## Comportamiento en Caso de Error de BD

Si la base de datos no está disponible o hay error en las operaciones de persistencia:

- ✅ La API **continúa funcionando normalmente** (jobs en memoria)
- ⚠️ Se registra el error en el log: `Error guardando job X en BD: ...`
- ⚠️ Los jobs se perderán si la API se reinicia

## Verificación de Funcionamiento

### 1. Verificar que la tabla existe
```sql
SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = 'ASYNC_JOBS';
-- Debe devolver 1
```

### 2. Verificar que se están guardando jobs
```bash
# Ejecutar un procedimiento async
curl -X POST http://localhost:8080/procedure/async \
  -H "Content-Type: application/json" \
  -d '{"name": "SUMA_SIMPLE", "params": [{"name": "vA", "value": 5}, {"name": "vB", "value": 3}]}'

# Consultar en Oracle
SELECT * FROM ASYNC_JOBS ORDER BY START_TIME DESC FETCH FIRST 1 ROW ONLY;
```

### 3. Verificar carga al reiniciar
```bash
# 1. Iniciar API y crear un job
# 2. Detener API (Ctrl+C)
# 3. Reiniciar API
# 4. Consultar GET /jobs - debe mostrar el job creado antes del reinicio
```

## Logs Relacionados

Al iniciar la API, verás estos mensajes en el log:

```
Tabla ASYNC_JOBS ya existe
Cargados 3 jobs desde la base de datos
```

O si es la primera vez:

```
Creando tabla ASYNC_JOBS...
Tabla ASYNC_JOBS creada exitosamente
```

Si hay errores:

```
Advertencia: No se pudo inicializar tabla ASYNC_JOBS: ORA-XXXXX
Error guardando job abc123 en BD: connection refused
Error actualizando job xyz789 en BD: ORA-XXXXX
```

## Migración de Versiones Anteriores

Si tenías la API ejecutándose **sin persistencia** (versión anterior):

1. ✅ No hay migración necesaria
2. ✅ Al actualizar, la tabla se crea automáticamente
3. ⚠️ Jobs en memoria de la versión anterior se perderán al reiniciar
4. ✅ Nuevos jobs se guardarán automáticamente

## Consideraciones de Rendimiento

- **Escrituras asíncronas**: `saveJobToDB()` y `updateJobInDB()` usan goroutines
- **Sin bloqueo**: La respuesta HTTP no espera confirmación de BD
- **Lectura desde memoria**: `GET /jobs/{id}` es instantáneo (no consulta BD)
- **Carga inicial**: Solo al iniciar, carga jobs de últimas 24 horas
- **Índices optimizados**: Consultas SQL rápidas con 3 índices

## Troubleshooting

### "Error guardando job en BD: ORA-00942: table or view does not exist"

La tabla no existe. Solución:
```sql
-- Ejecutar manualmente
@sql/create_async_jobs_table.sql
```

### "Advertencia: No se pudieron cargar jobs desde BD"

La API arrancará normalmente pero sin jobs históricos. Verifica:
1. Conexión a Oracle (endpoint `/ping`)
2. Que la tabla existe: `SELECT * FROM USER_TABLES WHERE TABLE_NAME = 'ASYNC_JOBS'`
3. Permisos del usuario: `GRANT SELECT ON ASYNC_JOBS TO tu_usuario`

### Los jobs no aparecen después de reiniciar

Posibles causas:
1. Los jobs tienen más de 24 horas (no se cargan)
2. Error en `LoadJobsFromDB()` - revisar log
3. Usuario sin permisos de SELECT en la tabla

## Recursos Adicionales

- **Script SQL completo**: `sql/create_async_jobs_table.sql`
- **Documentación de uso**: `docs/PROCEDIMIENTOS_ASINCRONOS.md`
- **Ejemplos de test**: `scripts/test_async.js`
- **Demo con delay**: `scripts/test_demora.js`
