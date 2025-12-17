-- ============================================
-- Script para crear funciones de prueba
-- ============================================
-- Ejecutar como usuario de la aplicación

-- Función simple de suma
CREATE OR REPLACE FUNCTION FUNC_TEST_SUMA(
    p_num1 IN NUMBER,
    p_num2 IN NUMBER
) RETURN NUMBER IS
    v_resultado NUMBER;
BEGIN
    v_resultado := p_num1 + p_num2;
    RETURN v_resultado;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END FUNC_TEST_SUMA;
/

-- Función que retorna texto
CREATE OR REPLACE FUNCTION FUNC_TEST_SALUDO(
    p_nombre IN VARCHAR2
) RETURN VARCHAR2 IS
    v_saludo VARCHAR2(200);
BEGIN
    v_saludo := 'Hola ' || p_nombre || ', bienvenido desde Oracle!';
    RETURN v_saludo;
END FUNC_TEST_SALUDO;
/

-- Función que calcula el factorial
CREATE OR REPLACE FUNCTION FUNC_TEST_FACTORIAL(
    p_numero IN NUMBER
) RETURN NUMBER IS
    v_resultado NUMBER := 1;
    v_i NUMBER;
BEGIN
    IF p_numero < 0 THEN
        RAISE_APPLICATION_ERROR(-20001, 'El número debe ser positivo');
    END IF;
    
    IF p_numero = 0 OR p_numero = 1 THEN
        RETURN 1;
    END IF;
    
    FOR v_i IN 2..p_numero LOOP
        v_resultado := v_resultado * v_i;
    END LOOP;
    
    RETURN v_resultado;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END FUNC_TEST_FACTORIAL;
/

-- Función que valida un email
CREATE OR REPLACE FUNCTION FUNC_TEST_VALIDAR_EMAIL(
    p_email IN VARCHAR2
) RETURN VARCHAR2 IS
    v_valido VARCHAR2(10);
BEGIN
    IF REGEXP_LIKE(p_email, '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$') THEN
        v_valido := 'VALIDO';
    ELSE
        v_valido := 'INVALIDO';
    END IF;
    
    RETURN v_valido;
END FUNC_TEST_VALIDAR_EMAIL;
/

-- Función con fecha
CREATE OR REPLACE FUNCTION FUNC_TEST_DIAS_HASTA_FIN_ANIO RETURN NUMBER IS
    v_dias NUMBER;
BEGIN
    v_dias := TO_DATE('31-DEC-' || TO_CHAR(SYSDATE, 'YYYY'), 'DD-MON-YYYY') - TRUNC(SYSDATE);
    RETURN v_dias;
END FUNC_TEST_DIAS_HASTA_FIN_ANIO;
/

COMMIT;

-- Verificar creación
SELECT 'FUNC_TEST_SUMA' AS funcion, 
       CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'NO CREADA' END AS estado
FROM user_objects
WHERE object_name = 'FUNC_TEST_SUMA'
  AND object_type = 'FUNCTION'
UNION ALL
SELECT 'FUNC_TEST_SALUDO' AS funcion, 
       CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'NO CREADA' END AS estado
FROM user_objects
WHERE object_name = 'FUNC_TEST_SALUDO'
  AND object_type = 'FUNCTION'
UNION ALL
SELECT 'FUNC_TEST_FACTORIAL' AS funcion, 
       CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'NO CREADA' END AS estado
FROM user_objects
WHERE object_name = 'FUNC_TEST_FACTORIAL'
  AND object_type = 'FUNCTION'
UNION ALL
SELECT 'FUNC_TEST_VALIDAR_EMAIL' AS funcion, 
       CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'NO CREADA' END AS estado
FROM user_objects
WHERE object_name = 'FUNC_TEST_VALIDAR_EMAIL'
  AND object_type = 'FUNCTION'
UNION ALL
SELECT 'FUNC_TEST_DIAS_HASTA_FIN_ANIO' AS funcion, 
       CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'NO CREADA' END AS estado
FROM user_objects
WHERE object_name = 'FUNC_TEST_DIAS_HASTA_FIN_ANIO'
  AND object_type = 'FUNCTION';

-- Pruebas rápidas
SELECT FUNC_TEST_SUMA(10, 20) AS suma FROM DUAL;
SELECT FUNC_TEST_SALUDO('Usuario') AS saludo FROM DUAL;
SELECT FUNC_TEST_FACTORIAL(5) AS factorial FROM DUAL;
SELECT FUNC_TEST_VALIDAR_EMAIL('test@example.com') AS email_valido FROM DUAL;
SELECT FUNC_TEST_DIAS_HASTA_FIN_ANIO() AS dias_restantes FROM DUAL;
