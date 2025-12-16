-- ==============================================================================
-- Script de creación de tabla ASYNC_JOBS
-- Propósito: Almacenar información de jobs asíncronos ejecutados
-- ==============================================================================

-- Eliminar tabla si existe (solo para desarrollo/reinstalación)
BEGIN
    EXECUTE IMMEDIATE 'DROP TABLE ASYNC_JOBS CASCADE CONSTRAINTS';
    DBMS_OUTPUT.PUT_LINE('Tabla ASYNC_JOBS eliminada');
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -942 THEN -- -942 = table does not exist
            RAISE;
        END IF;
END;
/

-- Crear tabla de jobs con validaciones
CREATE TABLE ASYNC_JOBS (
    JOB_ID VARCHAR2(32) PRIMARY KEY,
    STATUS VARCHAR2(20) NOT NULL CHECK (STATUS IN ('pending', 'running', 'completed', 'failed')),
    PROCEDURE_NAME VARCHAR2(200) NOT NULL,
    PARAMS CLOB,
    START_TIME TIMESTAMP NOT NULL,
    END_TIME TIMESTAMP,
    DURATION VARCHAR2(50),
    RESULT CLOB,
    ERROR_MSG CLOB,
    PROGRESS NUMBER DEFAULT 0 CHECK (PROGRESS BETWEEN 0 AND 100),
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para mejorar rendimiento
CREATE INDEX IDX_ASYNC_JOBS_STATUS ON ASYNC_JOBS(STATUS);
CREATE INDEX IDX_ASYNC_JOBS_START_TIME ON ASYNC_JOBS(START_TIME);
CREATE INDEX IDX_ASYNC_JOBS_CREATED_AT ON ASYNC_JOBS(CREATED_AT);

-- Comentarios en columnas
COMMENT ON TABLE ASYNC_JOBS IS 'Almacena información de jobs asíncronos ejecutados por la API';
COMMENT ON COLUMN ASYNC_JOBS.JOB_ID IS 'ID único del job (32 caracteres hex)';
COMMENT ON COLUMN ASYNC_JOBS.STATUS IS 'Estado del job: pending, running, completed, failed';
COMMENT ON COLUMN ASYNC_JOBS.PROCEDURE_NAME IS 'Nombre del procedimiento ejecutado';
COMMENT ON COLUMN ASYNC_JOBS.PARAMS IS 'Parámetros del procedimiento en formato JSON';
COMMENT ON COLUMN ASYNC_JOBS.START_TIME IS 'Hora de inicio del job';
COMMENT ON COLUMN ASYNC_JOBS.END_TIME IS 'Hora de finalización del job';
COMMENT ON COLUMN ASYNC_JOBS.DURATION IS 'Duración de la ejecución (formato legible)';
COMMENT ON COLUMN ASYNC_JOBS.RESULT IS 'Resultado de la ejecución en formato JSON';
COMMENT ON COLUMN ASYNC_JOBS.ERROR_MSG IS 'Mensaje de error si el job falló';
COMMENT ON COLUMN ASYNC_JOBS.PROGRESS IS 'Progreso del job (0-100)';
COMMENT ON COLUMN ASYNC_JOBS.CREATED_AT IS 'Timestamp de creación del registro';

-- Procedimiento de limpieza de jobs antiguos
CREATE OR REPLACE PROCEDURE CLEANUP_OLD_ASYNC_JOBS (
    p_days_old IN NUMBER DEFAULT 7,
    p_deleted_count OUT NUMBER
) AS
BEGIN
    DELETE FROM ASYNC_JOBS
    WHERE START_TIME < SYSDATE - p_days_old
    AND STATUS IN ('completed', 'failed');
    
    p_deleted_count := SQL%ROWCOUNT;
    COMMIT;
    
    DBMS_OUTPUT.PUT_LINE('Jobs eliminados: ' || p_deleted_count);
END;
/

-- Verificar estructura de la tabla
SELECT table_name, column_name, data_type, nullable
FROM user_tab_columns
WHERE table_name = 'ASYNC_JOBS'
ORDER BY column_id;

-- Verificar índices creados
SELECT index_name, table_name, uniqueness
FROM user_indexes
WHERE table_name = 'ASYNC_JOBS';

-- Mostrar resultados
PROMPT ========================================
PROMPT Tabla ASYNC_JOBS creada exitosamente
PROMPT Índices creados:
PROMPT - IDX_ASYNC_JOBS_STATUS
PROMPT - IDX_ASYNC_JOBS_START_TIME
PROMPT - IDX_ASYNC_JOBS_CREATED_AT
PROMPT 
PROMPT Procedimiento CLEANUP_OLD_ASYNC_JOBS creado
PROMPT ========================================

    v_deleted := SQL%ROWCOUNT;
    COMMIT;
    
    DBMS_OUTPUT.PUT_LINE('Eliminados ' || v_deleted || ' jobs antiguos');
END;
/

-- Verificar creación
SELECT 'Tabla ASYNC_JOBS creada exitosamente' AS STATUS FROM DUAL;
