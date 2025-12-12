-- Procedimiento de prueba que demora 2 minutos
-- Para probar que los jobs largos no pierden conexión

CREATE OR REPLACE PROCEDURE PROCESO_LARGO_TEST (
    p_segundos IN NUMBER,
    p_resultado OUT VARCHAR2
) IS
BEGIN
    -- Esperar la cantidad de segundos especificada
    DBMS_LOCK.SLEEP(p_segundos);
    
    -- Retornar resultado
    p_resultado := 'Proceso completado después de ' || p_segundos || ' segundos';
    
    DBMS_OUTPUT.PUT_LINE('✅ Proceso largo completado exitosamente');
END PROCESO_LARGO_TEST;
/

-- Procedimiento alternativo si DBMS_LOCK no está disponible
CREATE OR REPLACE PROCEDURE PROCESO_LARGO_TEST_ALT (
    p_iteraciones IN NUMBER,
    p_resultado OUT NUMBER
) IS
    v_total NUMBER := 0;
BEGIN
    -- Hacer operaciones que tomen tiempo
    FOR i IN 1..p_iteraciones LOOP
        v_total := v_total + i;
        
        -- Cada 1000 iteraciones hacer una pausa mínima
        IF MOD(i, 1000) = 0 THEN
            DBMS_OUTPUT.PUT_LINE('Progreso: ' || i || '/' || p_iteraciones);
        END IF;
    END LOOP;
    
    p_resultado := v_total;
    DBMS_OUTPUT.PUT_LINE('✅ Proceso largo completado. Total: ' || v_total);
END PROCESO_LARGO_TEST_ALT;
/
