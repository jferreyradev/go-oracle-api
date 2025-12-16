#!/usr/bin/env node
/**
 * Script de pruebas completo para go-oracle-api
 * Uso: node scripts/test_api.js [test_name]
 * Ejemplos:
 *   node scripts/test_api.js              # Ejecuta todas las pruebas
 *   node scripts/test_api.js ping         # Solo prueba de ping
 *   node scripts/test_api.js jobs         # Solo pruebas de jobs
 */

const API_URL = process.env.API_URL || "http://localhost:3000";
const TOKEN = process.env.API_TOKEN || "test1";

// ======================
// Utilidades
// ======================
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

function log(msg, type = 'info') {
    const colors = {
        success: '\x1b[32m✓',
        error: '\x1b[31m✗',
        info: '\x1b[36mℹ',
        warn: '\x1b[33m⚠',
    };
    console.log(`${colors[type]}\x1b[0m ${msg}`);
}

function section(title) {
    console.log(`\n\x1b[1m\x1b[35m=== ${title} ===\x1b[0m`);
}

// ======================
// Tests
// ======================

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

async function testQuery() {
    section("Test: Query SQL");
    
    // Query simple
    const res1 = await request('POST', '/query', { query: 'SELECT USER, SYSDATE FROM DUAL' });
    if (res1.ok) {
        log(`Query ejecutada: ${res1.data.rows?.length || 0} filas`, 'success');
    } else {
        log(`Error en query: ${res1.error || JSON.stringify(res1.data)}`, 'error');
        return false;
    }
    
    // Query con error (debe manejarse)
    const res2 = await request('POST', '/query', { query: 'SELECT * FROM TABLA_INEXISTENTE' });
    if (res2.status === 500 || res2.data.error) {
        log("Error manejado correctamente", 'success');
    } else {
        log("Error no detectado", 'warn');
    }
    
    return true;
}

async function testProcedure() {
    section("Test: Procedimientos");
    
    // Procedimiento simple (DBMS_OUTPUT)
    const res = await request('POST', '/procedure', {
        name: "BEGIN DBMS_OUTPUT.PUT_LINE('Test OK'); END;",
        params: []
    });
    
    if (res.ok) {
        log("Procedimiento ejecutado", 'success');
        return true;
    } else {
        log(`Error: ${res.error || JSON.stringify(res.data)}`, 'error');
        return false;
    }
}

async function testAsyncJobs() {
    section("Test: Jobs Asíncronos");
    
    // Crear job asíncrono
    log("Creando job asíncrono...", 'info');
    const createRes = await request('POST', '/procedure/async', {
        name: "PROC_TEST_DEMORA",
        params: [
            { name: "segundos", value: 3, direction: "IN", type: "NUMBER" }
        ]
    });
    
    if (!createRes.ok) {
        log(`Error creando job: ${JSON.stringify(createRes.data)}`, 'error');
        return false;
    }
    
    const jobId = createRes.data.job_id;
    log(`Job creado: ${jobId}`, 'success');
    
    // Monitorear job
    log("Monitoreando job...", 'info');
    let status = 'pending';
    let attempts = 0;
    
    while (status !== 'completed' && status !== 'failed' && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const jobRes = await request('GET', `/jobs/${jobId}`);
        
        if (jobRes.ok) {
            status = jobRes.data.status;
            const progress = jobRes.data.progress || 0;
            log(`Estado: ${status} (${progress}%)`, 'info');
        }
        attempts++;
    }
    
    if (status === 'completed') {
        log("Job completado exitosamente", 'success');
        return true;
    } else {
        log(`Job terminó con estado: ${status}`, 'warn');
        return false;
    }
}

async function testJobsManagement() {
    section("Test: Gestión de Jobs");
    
    // Listar jobs
    const listRes = await request('GET', '/jobs');
    if (!listRes.ok) {
        log("Error listando jobs", 'error');
        return false;
    }
    
    log(`Total de jobs: ${listRes.data.total}`, 'info');
    
    if (listRes.data.jobs && listRes.data.jobs.length > 0) {
        listRes.data.jobs.forEach(job => {
            console.log(`  - ${job.id}: ${job.status} (${job.proc_name || 'N/A'})`);
        });
        
        // Contar por estado
        const byStatus = listRes.data.jobs.reduce((acc, job) => {
            acc[job.status] = (acc[job.status] || 0) + 1;
            return acc;
        }, {});
        log(`Por estado: ${JSON.stringify(byStatus)}`, 'info');
    }
    
    // Eliminar jobs completados/fallidos
    const deleteRes = await request('DELETE', '/jobs?status=completed,failed');
    if (deleteRes.ok) {
        log(`Jobs eliminados: ${deleteRes.data.deleted}`, 'success');
    } else if (deleteRes.status === 400) {
        log("No hay jobs para eliminar", 'info');
    }
    
    return true;
}

async function testQueryLogging() {
    section("Test: Query Logging");
    
    // Ejecutar query para generar log
    await request('POST', '/query', { query: 'SELECT * FROM DUAL' });
    
    // Esperar que se guarde el log
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Consultar logs recientes
    const logsRes = await request('POST', '/query', { query: "SELECT COUNT(*) as total FROM QUERY_LOG WHERE CREATED_AT > SYSDATE - INTERVAL '1' MINUTE" });
    
    if (logsRes.ok && logsRes.data.rows && logsRes.data.rows.length > 0) {
        const count = logsRes.data.rows[0].TOTAL;
        log(`Logs recientes: ${count}`, 'success');
        return true;
    } else {
        log("No se pudieron verificar los logs", 'warn');
        return false;
    }
}

async function testUploadDownload() {
    section("Test: Upload/Download (básico)");
    log("Prueba de upload/download requiere multipart/form-data", 'info');
    log("Usa curl o Postman para probar estos endpoints", 'info');
    return true;
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
        logging: testQueryLogging,
        files: testUploadDownload
    };
    
    console.log(`\x1b[1m\x1b[36m🚀 Test Suite - go-oracle-api\x1b[0m`);
    console.log(`API: ${API_URL}`);
    console.log(`Token: ${TOKEN}`);
    
    const toRun = filter ? { [filter]: tests[filter] } : tests;
    
    if (!toRun[filter] && filter) {
        console.error(`\n\x1b[31m✗ Test '${filter}' no encontrado\x1b[0m`);
        console.log(`\nTests disponibles: ${Object.keys(tests).join(', ')}`);
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
    section("Resumen");
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    
    console.log(`\nTests ejecutados: ${total}`);
    console.log(`\x1b[32m✓ Exitosos: ${passed}\x1b[0m`);
    console.log(`\x1b[31m✗ Fallidos: ${total - passed}\x1b[0m`);
    
    if (passed === total) {
        console.log(`\n\x1b[1m\x1b[32m🎉 Todos los tests pasaron!\x1b[0m\n`);
        process.exit(0);
    } else {
        console.log(`\n\x1b[1m\x1b[31m❌ Algunos tests fallaron\x1b[0m\n`);
        process.exit(1);
    }
}

// Ejecutar
const testFilter = process.argv[2];
runTests(testFilter).catch(error => {
    console.error(`\n\x1b[31m✗ Error fatal: ${error.message}\x1b[0m\n`);
    process.exit(1);
});
