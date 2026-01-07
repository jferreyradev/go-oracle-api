/**
 * Ejemplo completo de uso de la API Go Oracle
 * 
 * Este archivo demuestra todas las funcionalidades principales:
 * - Consultas SQL
 * - Procedimientos síncronos y asíncronos
 * - Jobs asíncronos
 * - Gestión de logs
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
    
    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, ok: response.ok, data };
}

function log(section, msg) {
    console.log(`\n\x1b[1m\x1b[36m[${section}]\x1b[0m ${msg}`);
}

// ======================
// Ejemplos
// ======================

async function ejemplo1_ping() {
    log("EJEMPLO 1", "Verificar conectividad");
    
    const res = await request('GET', '/ping');
    console.log("Respuesta:", res.data);
    console.log("✅ API está funcionando");
}

async function ejemplo2_query() {
    log("EJEMPLO 2", "Consulta SQL simple");
    
    const res = await request('POST', '/query', {
        query: 'SELECT USER, SYSDATE FROM DUAL'
    });
    
    console.log("Resultados:");
    console.log(res.data.rows);
    console.log(`✅ ${res.data.rows?.length || 0} filas obtenidas`);
}

async function ejemplo3_procedimientoSincrono() {
    log("EJEMPLO 3", "Ejecutar procedimiento síncrono");
    
    const res = await request('POST', '/procedure', {
        name: 'PROC_TEST',
        params: [
            { name: 'p_input', value: 'Hola desde Node.js', direction: 'IN', type: 'STRING' },
            { name: 'p_output', direction: 'OUT', type: 'STRING' }
        ]
    });
    
    console.log("Resultado:", res.data.result);
    console.log("✅ Procedimiento ejecutado exitosamente");
}

async function ejemplo4_procedimientoAsincrono() {
    log("EJEMPLO 4", "Ejecutar procedimiento asíncrono (job)");
    
    // Crear job
    const createRes = await request('POST', '/procedure/async', {
        name: 'PROC_TEST_DEMORA',
        params: [
            { name: 'segundos', value: 5, direction: 'IN', type: 'NUMBER' }
        ]
    });
    
    const jobId = createRes.data.job_id;
    console.log(`Job creado: ${jobId}`);
    
    // Monitorear progreso
    let completed = false;
    while (!completed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusRes = await request('GET', `/jobs/${jobId}`);
        const job = statusRes.data;
        
        console.log(`Estado: ${job.status} - Progreso: ${job.progress}%`);
        
        if (job.status === 'completed' || job.status === 'failed') {
            completed = true;
            console.log(job.status === 'completed' 
                ? "✅ Job completado exitosamente" 
                : `❌ Job falló: ${job.error}`);
        }
    }
}

async function ejemplo5_listarJobs() {
    log("EJEMPLO 5", "Listar todos los jobs");
    
    const res = await request('GET', '/jobs');
    console.log(`Total de jobs: ${res.data.jobs?.length || 0}`);
    
    if (res.data.jobs && res.data.jobs.length > 0) {
        res.data.jobs.forEach((job, i) => {
            console.log(`${i + 1}. ${job.job_id} - ${job.status} - ${job.procedure_name}`);
        });
    }
    console.log("✅ Listado obtenido");
}

async function ejemplo6_ejecutarSQL() {
    log("EJEMPLO 6", "Ejecutar sentencias de modificación");
    
    // Crear tabla temporal
    const create = await request('POST', '/exec', {
        query: `
            BEGIN
                EXECUTE IMMEDIATE 'DROP TABLE TEMP_TEST';
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        `
    });
    
    const createTable = await request('POST', '/exec', {
        query: 'CREATE TABLE TEMP_TEST (id NUMBER, nombre VARCHAR2(100))'
    });
    console.log("Tabla temporal creada");
    
    // Insertar datos
    const insert = await request('POST', '/exec', {
        query: "INSERT INTO TEMP_TEST VALUES (1, 'Test')"
    });
    console.log("Datos insertados");
    
    // Consultar
    const select = await request('POST', '/query', {
        query: 'SELECT * FROM TEMP_TEST'
    });
    console.log("Datos:", select.data.rows);
    
    // Limpiar
    const drop = await request('POST', '/exec', {
        query: 'DROP TABLE TEMP_TEST'
    });
    console.log("✅ Tabla temporal eliminada");
}

async function ejemplo7_logs() {
    log("EJEMPLO 7", "Consultar logs de consultas");
    
    const res = await request('GET', '/logs?limit=5');
    console.log(`Últimos ${res.data.logs?.length || 0} logs:`);
    
    if (res.data.logs) {
        res.data.logs.forEach((log, i) => {
            console.log(`${i + 1}. [${log.timestamp}] ${log.type}: ${log.query?.substring(0, 50)}...`);
        });
    }
    console.log("✅ Logs obtenidos");
}

// ======================
// Ejecutar ejemplos
// ======================
async function main() {
    console.log("\x1b[1m\x1b[35m");
    console.log("╔════════════════════════════════════════════╗");
    console.log("║   EJEMPLOS DE USO - Go Oracle API         ║");
    console.log("╚════════════════════════════════════════════╝");
    console.log("\x1b[0m");
    
    try {
        await ejemplo1_ping();
        await ejemplo2_query();
        await ejemplo3_procedimientoSincrono();
        await ejemplo4_procedimientoAsincrono();
        await ejemplo5_listarJobs();
        await ejemplo6_ejecutarSQL();
        await ejemplo7_logs();
        
        console.log("\n\x1b[1m\x1b[32m");
        console.log("╔════════════════════════════════════════════╗");
        console.log("║   ✅ TODOS LOS EJEMPLOS COMPLETADOS       ║");
        console.log("╚════════════════════════════════════════════╝");
        console.log("\x1b[0m");
    } catch (error) {
        console.error("\n\x1b[31m❌ Error:", error.message, "\x1b[0m");
        process.exit(1);
    }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

// Exportar para uso en otros módulos
export {
    ejemplo1_ping,
    ejemplo2_query,
    ejemplo3_procedimientoSincrono,
    ejemplo4_procedimientoAsincrono,
    ejemplo5_listarJobs,
    ejemplo6_ejecutarSQL,
    ejemplo7_logs
};
