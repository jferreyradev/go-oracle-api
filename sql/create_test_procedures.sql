-- ==============================================================================
-- Script de creación de procedimientos de prueba
-- Propósito: Crear procedimientos almacenados para testing de la API
-- ==============================================================================

-- Procedimiento simple de prueba
CREATE OR REPLACE PROCEDURE PROC_TEST (
    p_input IN VARCHAR2,
    p_output OUT VARCHAR2
) AS
BEGIN
    p_output := 'Procesado: ' || p_input;
END PROC_TEST;
/

-- Procedimiento con demora (para jobs asíncronos)
CREATE OR REPLACE PROCEDURE PROC_TEST_DEMORA (
    segundos IN NUMBER
) AS
BEGIN
    -- Simular procesamiento largo
    DBMS_LOCK.SLEEP(segundos);
    
    -- Log de ejemplo
    DBMS_OUTPUT.PUT_LINE('Procesamiento completado después de ' || segundos || ' segundos');
END PROC_TEST_DEMORA;
/

-- Procedimiento con múltiples parámetros
CREATE OR REPLACE PROCEDURE PROC_TEST_PARAMS (
    p_number IN NUMBER,
    p_varchar IN VARCHAR2,
    p_date IN DATE,
    p_result OUT VARCHAR2
) AS
BEGIN
    p_result := 'Number: ' || p_number || 
                ', String: ' || p_varchar || 
                ', Date: ' || TO_CHAR(p_date, 'DD/MM/YYYY');
END PROC_TEST_PARAMS;
/

-- Procedimiento que retorna cursor
CREATE OR REPLACE PROCEDURE PROC_TEST_CURSOR (
    p_limit IN NUMBER,
    p_cursor OUT SYS_REFCURSOR
) AS
BEGIN
    OPEN p_cursor FOR
        SELECT LEVEL as ID, 
               'Item ' || LEVEL as NOMBRE,
               SYSDATE as FECHA
        FROM DUAL
        CONNECT BY LEVEL <= p_limit;
END PROC_TEST_CURSOR;
/

-- Procedimiento con manejo de errores
CREATE OR REPLACE PROCEDURE PROC_TEST_ERROR (
    p_should_fail IN NUMBER
) AS
BEGIN
    IF p_should_fail = 1 THEN
        RAISE_APPLICATION_ERROR(-20001, 'Error intencional de prueba');
    END IF;
    
    DBMS_OUTPUT.PUT_LINE('Ejecución exitosa');
END PROC_TEST_ERROR;
/

-- Procedimiento con operaciones DML
CREATE OR REPLACE PROCEDURE PROC_TEST_DML (
    p_table_name IN VARCHAR2,
    p_rows_created OUT NUMBER
) AS
    v_sql VARCHAR2(4000);
BEGIN
    -- Este procedimiento requiere que tengas una tabla temporal
    -- Por simplicidad, solo simula la operación
    p_rows_created := 100;
    
    DBMS_OUTPUT.PUT_LINE('Operación DML simulada en tabla: ' || p_table_name);
END PROC_TEST_DML;
/

-- Verificar procedimientos creados
SELECT object_name, object_type, status
FROM user_objects
WHERE object_name LIKE 'PROC_TEST%'
ORDER BY object_name;

-- Mostrar resultados
PROMPT ========================================
PROMPT Procedimientos de prueba creados:
PROMPT - PROC_TEST (simple)
PROMPT - PROC_TEST_DEMORA (para async)
PROMPT - PROC_TEST_PARAMS (múltiples params)
PROMPT - PROC_TEST_CURSOR (con cursor)
PROMPT - PROC_TEST_ERROR (manejo errores)
PROMPT - PROC_TEST_DML (operaciones DML)
PROMPT ========================================
