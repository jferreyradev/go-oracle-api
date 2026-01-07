#!/usr/bin/env node
/**
 * Test completo de la API Go Oracle
 * 
 * Ejecuta una suite de pruebas para verificar todas las funcionalidades.
 * 
 * Uso:
 *   node tests/test_completo.js
 * 
 * Variables de entorno:
 *   API_URL    - URL de la API (default: http://localhost:3000)
 *   API_TOKEN  - Token de autenticación (default: test1)
 */

const API_URL = process.env.API_URL || "http://localhost:3000";
const TOKEN = process.env.API_TOKEN || "test1";

let passed = 0;
let failed = 0;

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

function pass(msg) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function fail(msg) {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${msg}`);
}

function section(title) {
    console.log(`\n\x1b[1m\x1b[36m${title}\x1b[0m`);
}

// ======================
// Tests
// ======================

async function test1_conectividad() {
    section("TEST 1: Conectividad");
    const res = await request('GET', '/ping');
    
    if (res.ok && (res.data.status === "ok" || res.data.message === "pong")) {
        pass("API responde correctamente");
    } else {
        fail(`API no responde: ${res.error || JSON.stringify(res.data)}`);
    }
}

async function test2_query() {
    section("TEST 2: Consultas SQL");
    
    // Query simple
    const res = await request('POST', '/query', {
        query: 'SELECT USER, SYSDATE FROM DUAL'
    });
    
    if (res.ok && res.data.rows && res.data.rows.length > 0) {
        pass(`Query ejecutada: ${res.data.rows.length} filas`);
    } else {
        fail(`Query falló: ${res.error || JSON.stringify(res.data)}`);
    }
    
    // Query con error (debe manejarse)
    const resError = await request('POST', '/query', {
        query: 'SELECT * FROM TABLA_INEXISTENTE'
    });
    
    if (!resError.ok || resError.data.error) {
        pass("Errores de SQL manejados correctamente");
    } else {
        fail("Error de SQL no detectado");
    }
}

async function test3_procedimiento() {
    section("TEST 3: Procedimientos");
    
    const res = await request('POST', '/procedure', {
        name: 'PROC_TEST',
        params: [
            { name: 'p_input', value: 'Test', direction: 'IN', type: 'STRING' },
            { name: 'p_output', direction: 'OUT', type: 'STRING' }
        ]
    });
    
    if (res.ok && res.data.result) {
        pass("Procedimiento ejecutado correctamente");
    } else {
        fail(`Procedimiento falló: ${res.error || JSON.stringify(res.data)}`);
    }
}

async function test4_jobAsincrono() {
    section("TEST 4: Jobs Asíncronos");
    
    // Crear job
    const createRes = await request('POST', '/procedure/async', {
        name: 'PROC_TEST_DEMORA',
        params: [
            { name: 'segundos', value: 2, direction: 'IN', type: 'NUMBER' }
        ]
    });
    
    if (!createRes.ok || !createRes.data.job_id) {
        fail("No se pudo crear el job");
        return;
    }
    
    const jobId = createRes.data.job_id;
    pass(`Job creado: ${jobId}`);
    
    // Esperar un momento
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verificar estado
    const statusRes = await request('GET', `/jobs/${jobId}`);
    
    if (statusRes.ok && statusRes.data.status) {
        pass(`Job verificado: estado ${statusRes.data.status}`);
    } else {
        fail("No se pudo verificar el job");
    }
}

async function test5_listarJobs() {
    section("TEST 5: Listar Jobs");
    
    const res = await request('GET', '/jobs');
    
    if (res.ok && res.data.jobs) {
        pass(`Listado obtenido: ${res.data.jobs.length} jobs`);
    } else {
        fail("No se pudo listar jobs");
    }
}

async function test6_exec() {
    section("TEST 6: Ejecución SQL (EXEC)");
    
    // Crear tabla temporal
    await request('POST', '/exec', {
        query: `BEGIN EXECUTE IMMEDIATE 'DROP TABLE TEST_TEMP'; EXCEPTION WHEN OTHERS THEN NULL; END;`
    });
    
    const createRes = await request('POST', '/exec', {
        query: 'CREATE TABLE TEST_TEMP (id NUMBER)'
    });
    
    if (createRes.ok) {
        pass("Tabla temporal creada");
        
        // Insertar
        const insertRes = await request('POST', '/exec', {
            query: 'INSERT INTO TEST_TEMP VALUES (1)'
        });
        
        if (insertRes.ok) {
            pass("Datos insertados");
        } else {
            fail("No se pudo insertar datos");
        }
        
        // Limpiar
        await request('POST', '/exec', {
            query: 'DROP TABLE TEST_TEMP'
        });
    } else {
        fail("No se pudo crear tabla temporal");
    }
}

async function test7_logs() {
    section("TEST 7: Logs");
    
    const res = await request('GET', '/logs?limit=5');
    
    if (res.ok && res.data.logs) {
        pass(`Logs obtenidos: ${res.data.logs.length} registros`);
    } else {
        fail("No se pudieron obtener logs");
    }
}

// ======================
// Ejecutar tests
// ======================
async function main() {
    console.log("\x1b[1m\x1b[35m");
    console.log("╔════════════════════════════════════════════╗");
    console.log("║   TEST COMPLETO - Go Oracle API           ║");
    console.log("╚════════════════════════════════════════════╝");
    console.log("\x1b[0m");
    console.log(`API URL: ${API_URL}`);
    console.log(`Token: ${TOKEN}\n`);
    
    try {
        await test1_conectividad();
        await test2_query();
        await test3_procedimiento();
        await test4_jobAsincrono();
        await test5_listarJobs();
        await test6_exec();
        await test7_logs();
        
        console.log("\n" + "═".repeat(50));
        console.log(`\x1b[1mResultados:\x1b[0m`);
        console.log(`\x1b[32m✓ Pasados: ${passed}\x1b[0m`);
        console.log(`\x1b[31m✗ Fallidos: ${failed}\x1b[0m`);
        console.log("═".repeat(50));
        
        if (failed === 0) {
            console.log("\n\x1b[1m\x1b[32m✅ TODOS LOS TESTS PASARON\x1b[0m\n");
            process.exit(0);
        } else {
            console.log("\n\x1b[1m\x1b[31m❌ ALGUNOS TESTS FALLARON\x1b[0m\n");
            process.exit(1);
        }
    } catch (error) {
        console.error("\n\x1b[31m❌ Error fatal:", error.message, "\x1b[0m\n");
        process.exit(1);
    }
}

main();
