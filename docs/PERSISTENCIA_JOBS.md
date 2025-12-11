# Persistencia de Jobs Asíncronos en Oracle

## Resumen

Los jobs asíncronos se persisten automáticamente en Oracle Database, sobreviviendo reinicios de la API.

## Tabla ASYNC_JOBS

La tabla se **crea automáticamente** al iniciar la API si no existe.

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

**Instalación manual (opcional):**
```bash
sqlplus usuario/password@servicio @sql/create_async_jobs_table.sql
```

## Cómo Funciona

1. **Al iniciar API** → Crea tabla `ASYNC_JOBS` si no existe + carga jobs de últimas 24h
2. **Al crear un job** → `saveJobToDB()` guarda en Oracle (asíncrono)
3. **Al actualizar estado** → `updateJobInDB()` actualiza BD (asíncrono)

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
# 1. Crear un job usando Node.js
node scripts/test_persistencia.js

# 2. Ver jobs en Oracle (opción 1: script visual)
node scripts/view_jobs.js

# 3. Ver jobs en Oracle (opción 2: SQL directo)
sqlplus usuario/password@servicio @sql/consultas_jobs.sql

# 4. Reiniciar API y verificar carga
go run main.go
# Buscar en log: "✅ Cargados N jobs desde Oracle"
```

## Consultar Jobs

**Script interactivo (recomendado):**
```bash
node scripts/view_jobs.js
```

**Consultas SQL directas:**
Ver `sql/consultas_jobs.sql` con 10 queries predefinidas:
- Jobs de últimas 24h
- Jobs por estado
- Jobs fallidos
- Duración promedio
- Y más...

## Troubleshooting

**"Tabla ASYNC_JOBS no existe al conectar manualmente"**
- La API la crea automáticamente al iniciar
- Si necesitas crearla manualmente: `sqlplus usuario/password@servicio @sql/create_async_jobs_table.sql`

**Jobs no se cargan al reiniciar**
- Verificar log: buscar "✅ Tabla ASYNC_JOBS ya existe" o "✅ Tabla ASYNC_JOBS creada"
- Solo se cargan jobs de últimas 24 horas
- Verificar permisos: `GRANT SELECT, INSERT, UPDATE ON ASYNC_JOBS TO usuario`

## Recursos

- **Tabla SQL**: `sql/create_async_jobs_table.sql` (opcional, se crea automáticamente)
- **Consultas**: `sql/consultas_jobs.sql` (10 queries útiles)
- **Visualizador**: `scripts/view_jobs.js` (tabla interactiva)
- **Test**: `scripts/test_persistencia.js` (prueba completa)
- **Documentación**: `docs/PROCEDIMIENTOS_ASINCRONOS.md`
- **Test**: `scripts/test_persistencia.js`
