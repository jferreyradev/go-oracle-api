# Persistencia de Jobs Asíncronos en Oracle

## Resumen

Los jobs asíncronos se persisten automáticamente en Oracle Database, sobreviviendo reinicios de la API.

## Tabla ASYNC_JOBS

```sql
CREATE TABLE ASYNC_JOBS (
    JOB_ID VARCHAR2(32) PRIMARY KEY,
    STATUS VARCHAR2(20) NOT NULL,
    PROCEDURE_NAME VARCHAR2(200) NOT NULL,
    START_TIME TIMESTAMP NOT NULL,
    END_TIME TIMESTAMP,
    DURATION VARCHAR2(50),
    RESULT CLOB,              -- Resultado en JSON
    ERROR_MSG CLOB,           -- Error si falla
    PROGRESS NUMBER DEFAULT 0,
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Instalación:**
```bash
sqlplus usuario/password@servicio @sql/create_async_jobs_table.sql
```

## Cómo Funciona

1. **Al crear un job** → `saveJobToDB()` guarda en Oracle (asíncrono)
2. **Al actualizar estado** → `updateJobInDB()` actualiza BD (asíncrono)
3. **Al iniciar API** → `LoadJobsFromDB()` carga jobs de últimas 24h

Las operaciones de BD usan goroutines y no bloquean las respuestas HTTP.

## Consultas SQL Útiles

### Ver jobs recientes
```sql
SELECT * FROM V_ASYNC_JOBS_RECENT ORDER BY START_TIME DESC;
```

### Jobs por estado
```sql
SELECT JOB_ID, STATUS, PROCEDURE_NAME, START_TIME, PROGRESS
FROM ASYNC_JOBS 
WHERE STATUS = 'running'
ORDER BY START_TIME DESC;
```

### Estadísticas por procedimiento
```sql
SELECT 
    PROCEDURE_NAME,
    COUNT(*) as total,
    COUNT(CASE WHEN STATUS = 'completed' THEN 1 END) as exitosos,
    AVG(CASE WHEN STATUS = 'completed' 
        THEN (END_TIME - START_TIME) * 24 * 60 END) as promedio_minutos
FROM ASYNC_JOBS
GROUP BY PROCEDURE_NAME;
```

### Limpiar jobs antiguos
```sql
BEGIN
    CLEANUP_OLD_ASYNC_JOBS(p_days_old => 7);
END;
```

## Probar Persistencia

```bash
# 1. Crear un job
curl -X POST http://localhost:3000/procedure/async \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mi_token_secreto" \
  -d '{"name": "SUMA_SIMPLE", "params": [{"name": "vA", "value": 10}]}'

# 2. Ver en Oracle
SELECT * FROM ASYNC_JOBS ORDER BY START_TIME DESC FETCH FIRST 1 ROW ONLY;

# 3. Reiniciar API

# 4. Consultar job - debe seguir existiendo
curl http://localhost:3000/jobs/{job_id} -H "Authorization: Bearer mi_token_secreto"
```

## Troubleshooting

**"Tabla ASYNC_JOBS no existe"**
```bash
sqlplus usuario/password@servicio @sql/create_async_jobs_table.sql
```

**Jobs no se cargan al reiniciar**
- Verificar que tengan menos de 24 horas
- Revisar log: buscar "✅ Cargados N jobs desde Oracle"
- Verificar permisos: `GRANT SELECT ON ASYNC_JOBS TO usuario`

## Recursos

- **Script SQL**: `sql/create_async_jobs_table.sql`
- **Documentación**: `docs/PROCEDIMIENTOS_ASINCRONOS.md`
- **Test**: `scripts/test_persistencia.js`
