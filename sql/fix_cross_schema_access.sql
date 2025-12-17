-- ===============================================================
-- Script para solucionar problemas de acceso a funciones/procedimientos
-- en diferentes esquemas
-- ===============================================================

-- PROBLEMA: 
-- Cuando intentas llamar a WORKFLOW.EXISTE_PROC_CAB desde el esquema USUARIO,
-- Oracle lo interpreta como PAQUETE.FUNCIÓN en lugar de ESQUEMA.FUNCIÓN

-- SOLUCIÓN 1: Otorgar permisos de ejecución (ejecutar como usuario WORKFLOW o DBA)
-- ===============================================================
GRANT EXECUTE ON WORKFLOW.EXISTE_PROC_CAB TO USUARIO;

-- SOLUCIÓN 2: Crear un sinónimo (ejecutar como USUARIO)
-- ===============================================================
CREATE OR REPLACE SYNONYM EXISTE_PROC_CAB FOR WORKFLOW.EXISTE_PROC_CAB;

-- SOLUCIÓN 3: Crear sinónimo público (ejecutar como DBA)
-- ===============================================================
CREATE OR REPLACE PUBLIC SYNONYM EXISTE_PROC_CAB FOR WORKFLOW.EXISTE_PROC_CAB;
GRANT EXECUTE ON WORKFLOW.EXISTE_PROC_CAB TO PUBLIC;

-- ===============================================================
-- VERIFICAR PERMISOS
-- ===============================================================

-- Ver qué permisos tiene el usuario actual
SELECT privilege, owner, table_name
FROM user_tab_privs
WHERE table_name LIKE '%EXISTE_PROC_CAB%';

-- Ver todos los sinónimos disponibles
SELECT synonym_name, table_owner, table_name
FROM user_synonyms
WHERE synonym_name LIKE '%EXISTE_PROC_CAB%'
UNION ALL
SELECT synonym_name, table_owner, table_name
FROM all_synonyms
WHERE synonym_name LIKE '%EXISTE_PROC_CAB%'
AND owner = 'PUBLIC';

-- ===============================================================
-- DESPUÉS DE APLICAR LA SOLUCIÓN
-- ===============================================================

-- Con sinónimo, llamar simplemente:
-- {
--   "name": "EXISTE_PROC_CAB",
--   "isFunction": true,
--   "params": [...]
-- }

-- Con permisos, Oracle resolverá automáticamente:
-- {
--   "name": "WORKFLOW.EXISTE_PROC_CAB",
--   "isFunction": true,
--   "params": [...]
-- }
