-- Script para crear la tabla de jobs asíncronos
-- Este script se puede ejecutar desde la API o manualmente

-- Crear tabla de jobs
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

-- Índices para mejorar rendimiento
CREATE INDEX IDX_ASYNC_JOBS_STATUS ON ASYNC_JOBS(STATUS);
CREATE INDEX IDX_ASYNC_JOBS_START_TIME ON ASYNC_JOBS(START_TIME);
CREATE INDEX IDX_ASYNC_JOBS_CREATED_AT ON ASYNC_JOBS(CREATED_AT);

-- Comentarios
COMMENT ON TABLE ASYNC_JOBS IS 'Tabla para almacenar jobs asíncronos de procedimientos';
COMMENT ON COLUMN ASYNC_JOBS.JOB_ID IS 'ID único del job (32 caracteres hex)';
COMMENT ON COLUMN ASYNC_JOBS.STATUS IS 'Estado: pending, running, completed, failed';
COMMENT ON COLUMN ASYNC_JOBS.PROCEDURE_NAME IS 'Nombre del procedimiento ejecutado';
COMMENT ON COLUMN ASYNC_JOBS.START_TIME IS 'Fecha/hora de inicio';
COMMENT ON COLUMN ASYNC_JOBS.END_TIME IS 'Fecha/hora de finalización';
COMMENT ON COLUMN ASYNC_JOBS.DURATION IS 'Duración del job (formato Go)';
COMMENT ON COLUMN ASYNC_JOBS.RESULT IS 'Resultado JSON de parámetros OUT';
COMMENT ON COLUMN ASYNC_JOBS.ERROR_MSG IS 'Mensaje de error si falló';
COMMENT ON COLUMN ASYNC_JOBS.PROGRESS IS 'Progreso 0-100';
COMMENT ON COLUMN ASYNC_JOBS.CREATED_AT IS 'Timestamp de creación del registro';

-- Vista para consultas rápidas
CREATE OR REPLACE VIEW V_ASYNC_JOBS_RECENT AS
SELECT 
    JOB_ID,
    STATUS,
    PROCEDURE_NAME,
    START_TIME,
    END_TIME,
    DURATION,
    PROGRESS,
    CASE 
        WHEN END_TIME IS NOT NULL THEN 
            ROUND((EXTRACT(DAY FROM (END_TIME - START_TIME)) * 24 * 60 * 60 +
                   EXTRACT(HOUR FROM (END_TIME - START_TIME)) * 60 * 60 +
                   EXTRACT(MINUTE FROM (END_TIME - START_TIME)) * 60 +
                   EXTRACT(SECOND FROM (END_TIME - START_TIME))), 2)
        ELSE NULL
    END AS DURATION_SECONDS,
    CREATED_AT
FROM ASYNC_JOBS
WHERE CREATED_AT >= SYSDATE - 7  -- Últimos 7 días
ORDER BY START_TIME DESC;

COMMENT ON VIEW V_ASYNC_JOBS_RECENT IS 'Vista de jobs de los últimos 7 días';

-- Procedimiento para limpiar jobs antiguos
CREATE OR REPLACE PROCEDURE CLEANUP_OLD_ASYNC_JOBS(
    p_days_old IN NUMBER DEFAULT 7
) AS
    v_deleted NUMBER;
BEGIN
    DELETE FROM ASYNC_JOBS
    WHERE CREATED_AT < SYSDATE - p_days_old
    AND STATUS IN ('completed', 'failed');
    
    v_deleted := SQL%ROWCOUNT;
    COMMIT;
    
    DBMS_OUTPUT.PUT_LINE('Eliminados ' || v_deleted || ' jobs antiguos');
END;
/

-- Verificar creación
SELECT 'Tabla ASYNC_JOBS creada exitosamente' AS STATUS FROM DUAL;
