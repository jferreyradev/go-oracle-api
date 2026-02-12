#!/usr/bin/env node
/**
 * Suite completa de tests para Go Oracle API
 * 
 * Uso:
 *   node tests/test.js              # Ejecutar todos los tests
 *   node tests/test.js ping         # Ejecutar solo ping
 *   node tests/test.js query        # Ejecutar solo query
 * 
 * Tests disponibles:
 *   - ping: Conectividad básica
 *   - query: Ejecución de queries SQL
 *   - procedure: Procedimientos almacenados
 *   - async: Jobs asíncronos
 *   - jobs: Gestión de jobs
 *   - exec: Ejecución DDL/DML
 *   - logging: Logging de queries
 * 
 * Variables de entorno:
 *   API_URL    - URL de la API (default: http://localhost:3000)
 *   API_TOKEN  - Token de autenticación (default: test1)
 */

const API_URL = process.env.API_URL || "http://10.6.46.114:3013";
const TOKEN = process.env.API_TOKEN || "test1";

// ======================
// Utilidades de Request
// ======================

/**
 * Realiza una petición HTTP JSON a la API
 * @param {string} method - Método HTTP (GET, POST, etc)
 * @param {string} endpoint - Endpoint de la API (ej: /query, /ping)
 * @param {object} body - Cuerpo de la petición (opcional)
 * @returns {object} Respuesta con status, ok y data
 */
async function request(method, endpoint, body = null) {
    const url = `${API_URL}${endpoint}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const response = await fetch(url, options);
        const data = await response.json();
        return { status: response.status, ok: response.ok, data };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Realiza una petición HTTP que devuelve texto plano
 * Usada para endpoints como /logs que no devuelven JSON
 * @param {string} method - Método HTTP (GET, POST, etc)
 * @param {string} endpoint - Endpoint de la API
 * @returns {object} Respuesta con status, ok y data (string)
 */
async function requestText(method, endpoint) {
    const url = `${API_URL}${endpoint}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${TOKEN}`
        }
    };
    
    try {
        const response = await fetch(url, options);
        const data = await response.text();
        return { status: response.status, ok: response.ok, data };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Muestra un mensaje con color en la consola
 * @param {string} msg - Mensaje a mostrar
 * @param {string} type - Tipo de mensaje (success, error, info, warn)
 */
function log(msg, type = 'info') {
    const colors = {
        success: '\x1b[32m✓',
        error: '\x1b[31m✗',
        info: '\x1b[36mℹ',
        warn: '\x1b[33m⚠',
    };
    console.log(`${colors[type]}\x1b[0m ${msg}`);
}

/**
 * Muestra un título de sección en la consola
 * @param {string} title - Título de la sección
 */
function section(title) {
    console.log(`\n\x1b[1m\x1b[35m=== ${title} ===\x1b[0m`);
}

// ======================
// Suite de Tests
// ======================

/**
 * TEST: Conectividad básica
 * Verifica que el servidor responde correctamente al endpoint /ping
 */
async function testPing() {
    section("Test: Ping");
    const res = await request('GET', '/ping');
    if (res.ok && (res.data.status === "ok" || res.data.message === "pong")) {
        log("API responde correctamente", 'success');
        return true;
    } else {
        log(`Error en ping: ${res.error || res.data}`, 'error');
        return false;
    }
}

/**
 * TEST: Ejecución de queries SQL
 * Verifica:
 * - Query simple con SELECT
 * - Manejo correcto de errores SQL
 */
async function testQuery() {
    section("Test: Query SQL");
    
    // Query simple
    const res1 = await request('POST', '/query', { query: 'SELECT USER, SYSDATE FROM DUAL' });
    if (res1.ok && res1.data.results && res1.data.results.length > 0) {
        log(`Query exitosa: ${res1.data.results.length} fila(s)`, 'success');
    } else {
        log(`Error en query: ${res1.error || JSON.stringify(res1.data)}`, 'error');
        return false;
    }
    
    // Query con error (debe manejarse)
    const res2 = await request('POST', '/query', { query: 'SELECT * FROM TABLA_INEXISTENTE' });
    if (res2.status === 500 || res2.data.error) {
        log("Errores SQL manejados correctamente", 'success');
    } else {
        log("Error no detectado", 'warn');
    }
    
    return true;
}

async function testProcedure() {
    section("Test: Procedimientos");
    
    // Crear procedimiento temporal
    // Crea un procedimiento PL/SQL simple con entrada y salida
    const createProc = await request('POST', '/exec', {
        query: `CREATE OR REPLACE PROCEDURE TEST_PROC_TEMP (p_input IN VARCHAR2, p_output OUT VARCHAR2) AS
                BEGIN
                    p_output := 'Resultado: ' || p_input;
                END TEST_PROC_TEMP;`
    });
    
    if (!createProc.ok) {
        log("No se pudo crear el procedimiento temporal", 'warn');
        return false;
    }
    log("Procedimiento temporal creado", 'info');
    
    // Ejecutar procedimiento
    // Llama al procedimiento con parámetros IN/OUT
    const execProc = await request('POST', '/procedure', {
        name: 'TEST_PROC_TEMP',
        params: [
            { name: 'p_input', value: 'Test', direction: 'IN', type: 'STRING' },
            { name: 'p_output', direction: 'OUT', type: 'STRING' }
        ]
    });
    
    if (execProc.ok) {
        log("Procedimiento ejecutado correctamente", 'success');
    } else {
        log(`Error ejecutando procedimiento: ${JSON.stringify(execProc.data)}`, 'error');
    }
    
    // Limpiar: Eliminar procedimiento temporal
    await request('POST', '/exec', {
        query: 'DROP PROCEDURE TEST_PROC_TEMP'
    });
    log("Procedimiento temporal eliminado", 'info');
    
    return execProc.ok;
}

async function testAsyncJobs() {
    section("Test: Jobs Asíncronos");
    
    // Crear job asíncrono
    // Ejecuta un procedimiento de forma asíncrona (sin esperar respuesta)
    log("Creando job asíncrono...", 'info');
    const createRes = await request('POST', '/procedure/async', {
        name: 'PROC_TEST_DEMORA',
        params: [
            { name: 'segundos', value: 2, direction: 'IN', type: 'NUMBER' }
        ]
    });
    
    if (!createRes.ok || !createRes.data.job_id) {
        log(`Error creando job: ${JSON.stringify(createRes.data)}`, 'error');
        return false;
    }
    
    const jobId = createRes.data.job_id;
    log(`Job creado: ${jobId}`, 'success');
    
    // Esperar a que el job se complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verificar estado del job
    const statusRes = await request('GET', `/jobs/${jobId}`);
    
    if (statusRes.ok && statusRes.data.status) {
        log(`Job verificado: estado ${statusRes.data.status}`, 'success');
        return true;
    } else {
        log("No se pudo verificar el job", 'error');
        return false;
    }
}

/**
 * TEST: Gestión de jobs asíncronos
 * Verifica:
 * - Listar jobs existentes
 * - Ver estado y conteos de jobs
 * - Eliminar jobs completados/fallidos
 */
async function testJobsManagement() {
    section("Test: Gestión de Jobs");
    
    // Listar todos los jobs
    const listRes = await request('GET', '/jobs');
    if (!listRes.ok) {
        log("Error listando jobs", 'error');
        return false;
    }
    
    log(`Total de jobs: ${listRes.data.total || listRes.data.jobs?.length || 0}`, 'info');
    
    if (listRes.data.jobs && listRes.data.jobs.length > 0) {
        // Mostrar primeros 3 jobs
        listRes.data.jobs.slice(0, 3).forEach(job => {
            console.log(`  - ${job.id}: ${job.status} (${job.proc_name || 'N/A'})`);
        });
        
        // Contar jobs por estado
        const byStatus = listRes.data.jobs.reduce((acc, job) => {
            acc[job.status] = (acc[job.status] || 0) + 1;
            return acc;
        }, {});
        log(`Por estado: ${JSON.stringify(byStatus)}`, 'success');
    }
    
    // Limpiar jobs completados/fallidos
    const deleteRes = await request('DELETE', '/jobs?status=completed,failed');
    if (deleteRes.ok) {
        const deleted = deleteRes.data.deleted || 0;
        if (deleted > 0) {
            log(`Jobs eliminados: ${deleted}`, 'success');
        }
    }
    
    return true;
}

/**
 * TEST: Ejecución SQL (EXEC)
 * Verifica operaciones DDL/DML:
 * - Crear tabla temporal
 * - Insertar datos
 * - Limpiar recursos
 */
async function testExec() {
    section("Test: Ejecución SQL (EXEC)");
    
    // Intentar limpiar tabla si existe
    await request('POST', '/exec', {
        query: `BEGIN EXECUTE IMMEDIATE 'DROP TABLE TEST_TEMP'; EXCEPTION WHEN OTHERS THEN NULL; END;`
    });
    
    // Crear tabla temporal
    const createRes = await request('POST', '/exec', {
        query: 'CREATE TABLE TEST_TEMP (id NUMBER)'
    });
    
    if (createRes.ok) {
        log("Tabla temporal creada", 'success');
        
        // Insertar datos en la tabla
        const insertRes = await request('POST', '/exec', {
            query: 'INSERT INTO TEST_TEMP VALUES (1)'
        });
        
        if (insertRes.ok) {
            log("Datos insertados", 'success');
        } else {
            log("No se pudo insertar datos", 'warn');
        }
        
        // Limpiar: Eliminar tabla temporal
        await request('POST', '/exec', {
            query: 'DROP TABLE TEST_TEMP'
        });
        
        return true;
    } else {
        log("No se pudo crear tabla temporal", 'error');
        return false;
    }
}

/**
 * TEST: Logging de consultas
 * Verifica:
 * - Se registran las queries ejecutadas
 * - Se puede consultar el log del servidor
 */
async function testLogging() {
    section("Test: Query Logging");
    
    // Ejecutar una query para generar un log
    await request('POST', '/query', { query: 'SELECT * FROM DUAL' });
    
    // Esperar a que se escriba en el log
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Consultar el archivo de logs del servidor (devuelve texto plano)
    const logsRes = await requestText('GET', '/logs');
    
    if (logsRes.ok && logsRes.data && logsRes.data.length > 0) {
        const lines = logsRes.data.split('\n').filter(l => l.trim()).length;
        log(`Logs obtenidos: ${lines} líneas`, 'success');
        return true;
    } else {
        log(`Error obteniendo logs: ${logsRes.error || 'sin contenido'}`, 'warn');
        return false;
    }
}

// ======================
// Runner
// ======================

async function runTests(filter = null) {
    const tests = {
        ping: testPing,
        query: testQuery,
        procedure: testProcedure,
        async: testAsyncJobs,
        jobs: testJobsManagement,
        exec: testExec,
        logging: testLogging
    };
    
    console.log(`\x1b[1m\x1b[36m🚀 Test Suite - go-oracle-api\x1b[0m`);
    console.log(`API: ${API_URL}`);
    console.log(`Token: ${TOKEN}`);
    
    const toRun = filter 
        ? (tests[filter] ? { [filter]: tests[filter] } : null)
        : tests;
    
    if (filter && !toRun) {
        console.error(`\n\x1b[31m✗ Test '${filter}' no encontrado\x1b[0m`);
        console.log(`\nTests disponibles: ${Object.keys(tests).join(', ')}\n`);
        process.exit(1);
    }
    
    const results = [];
    
    for (const [name, testFn] of Object.entries(toRun)) {
        try {
            const passed = await testFn();
            results.push({ name, passed });
        } catch (error) {
            log(`Error en test ${name}: ${error.message}`, 'error');
            results.push({ name, passed: false });
        }
    }
    
    // Resumen
    section("Resumen Final");
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    
    console.log(`\nTests ejecutados: ${total}`);
    console.log(`\x1b[32m✓ Exitosos: ${passed}\x1b[0m`);
    console.log(`\x1b[31m✗ Fallidos: ${total - passed}\x1b[0m\n`);
    
    if (passed === total) {
        console.log(`\x1b[1m\x1b[32m🎉 Todos los tests pasaron!\x1b[0m\n`);
        process.exit(0);
    } else {
        console.log(`\x1b[1m\x1b[31m⚠️  Algunos tests fallaron\x1b[0m\n`);
        process.exit(1);
    }
}

// Ejecutar
const testFilter = process.argv[2];
runTests(testFilter).catch(error => {
    console.error(`\n\x1b[31m✗ Error fatal: ${error.message}\x1b[0m\n`);
    process.exit(1);
});
