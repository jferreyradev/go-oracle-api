-- Migración: Agregar columna PARAMS a tabla ASYNC_JOBS
-- Ejecutar si la tabla ya existe sin la columna PARAMS

-- Verificar si la columna existe
DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM USER_TAB_COLUMNS
  WHERE TABLE_NAME = 'ASYNC_JOBS'
  AND COLUMN_NAME = 'PARAMS';
  
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE ASYNC_JOBS ADD (PARAMS CLOB)';
    DBMS_OUTPUT.PUT_LINE('✅ Columna PARAMS agregada exitosamente');
  ELSE
    DBMS_OUTPUT.PUT_LINE('ℹ️  Columna PARAMS ya existe');
  END IF;
END;
/

-- Verificar resultado
DESC ASYNC_JOBS;
