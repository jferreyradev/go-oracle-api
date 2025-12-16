#!/usr/bin/env node
/**
 * Utilidad para ver y gestionar Jobs y Query Logs
 * Uso: node scripts/view_status.js [opción]
 * 
 * Opciones:
 *   jobs              - Muestra todos los jobs
 *   jobs:active       - Solo jobs activos (pending/running)
 *   jobs:completed    - Solo jobs completados
 *   jobs:failed       - Solo jobs fallidos
 *   jobs:clean        - Limpia jobs completados/fallidos
 *   logs              - Muestra query logs recientes
 *   logs:stats        - Estadísticas de query logs
 *   logs:errors       - Solo logs con errores
 */

const API_URL = process.env.API_URL || "http://localhost:3000";
const TOKEN = process.env.API_TOKEN || "test1";

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

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('es-ES', { 
        day: '2-digit', 
        month: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
}

function formatDuration(start, end) {
    if (!start || !end) return 'N/A';
    const diff = new Date(end) - new Date(start);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// ======================
// Jobs
// ======================

async function showJobs(filter = null) {
    console.log('\x1b[1m\x1b[36m📋 Jobs Asíncronos\x1b[0m\n');
    
    const res = await request('GET', '/jobs');
    if (!res.ok) {
        console.error('\x1b[31m✗ Error obteniendo jobs\x1b[0m');
        return;
    }
    
    let jobs = res.data.jobs || [];
    
    // Aplicar filtro
    if (filter === 'active') {
        jobs = jobs.filter(j => j.status === 'pending' || j.status === 'running');
    } else if (filter === 'completed') {
        jobs = jobs.filter(j => j.status === 'completed');
    } else if (filter === 'failed') {
        jobs = jobs.filter(j => j.status === 'failed');
    }
    
    if (jobs.length === 0) {
        console.log('  \x1b[90m(sin jobs)\x1b[0m\n');
        return;
    }
    
    // Ordenar: running > pending > completed > failed
    const statusOrder = { running: 0, pending: 1, completed: 2, failed: 3 };
    jobs.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || new Date(b.start_time) - new Date(a.start_time));
    
    // Tabla
    console.log('  ID                     Status      Procedimiento              Inicio           Duración  Prog.');
    console.log('  ' + '─'.repeat(95));
    
    jobs.forEach(job => {
        const statusColors = {
            pending: '\x1b[33m',    // amarillo
            running: '\x1b[36m',    // cyan
            completed: '\x1b[32m',  // verde
            failed: '\x1b[31m'      // rojo
        };
        
        const color = statusColors[job.status] || '';
        const id = job.id.substring(0, 20).padEnd(20);
        const status = job.status.padEnd(11);
        const proc = (job.proc_name || 'N/A').substring(0, 25).padEnd(25);
        const start = formatDate(job.start_time).padEnd(16);
        const duration = formatDuration(job.start_time, job.end_time).padEnd(9);
        const progress = `${job.progress || 0}%`.padStart(4);
        
        console.log(`  ${id} ${color}${status}\x1b[0m ${proc} ${start} ${duration} ${progress}`);
        
        // Mostrar error si existe
        if (job.error) {
            console.log(`    \x1b[90m└─ Error: ${job.error.substring(0, 80)}\x1b[0m`);
        }
    });
    
    // Estadísticas
    const stats = jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
    }, {});
    
    console.log('\n  Total: ' + jobs.length);
    Object.entries(stats).forEach(([status, count]) => {
        const statusColors = {
            pending: '\x1b[33m',
            running: '\x1b[36m',
            completed: '\x1b[32m',
            failed: '\x1b[31m'
        };
        const color = statusColors[status] || '';
        console.log(`  ${color}●\x1b[0m ${status}: ${count}`);
    });
    console.log();
}

async function cleanJobs() {
    console.log('\x1b[1m\x1b[36m🗑️  Limpiando Jobs\x1b[0m\n');
    
    const res = await request('DELETE', '/jobs?status=completed,failed');
    
    if (res.ok) {
        console.log(`  \x1b[32m✓ Jobs eliminados: ${res.data.deleted}\x1b[0m\n`);
    } else if (res.status === 400) {
        console.log('  \x1b[90m(sin jobs para eliminar)\x1b[0m\n');
    } else {
        console.log(`  \x1b[31m✗ Error: ${res.data.error}\x1b[0m\n`);
    }
}

// ======================
// Query Logs
// ======================

async function showQueryLogs(filter = null) {
    console.log('\x1b[1m\x1b[36m📝 Query Logs (últimos 50)\x1b[0m\n');
    
    let sql = `
        SELECT LOG_ID, QUERY_TYPE, QUERY_TEXT, EXECUTION_TIME, DURATION, 
               ROWS_AFFECTED, SUCCESS, ERROR_MSG
        FROM QUERY_LOG
        WHERE CREATED_AT > SYSDATE - INTERVAL '1' HOUR
        ORDER BY CREATED_AT DESC
        FETCH FIRST 50 ROWS ONLY
    `;
    
    if (filter === 'errors') {
        sql = sql.replace('WHERE CREATED_AT', 'WHERE SUCCESS = 0 AND CREATED_AT');
    }
    
    const res = await request('POST', '/query', { query: sql });
    
    if (!res.ok) {
        console.error('\x1b[31m✗ Error obteniendo logs\x1b[0m');
        return;
    }
    
    const logs = res.data.rows || [];
    
    if (logs.length === 0) {
        console.log('  \x1b[90m(sin logs)\x1b[0m\n');
        return;
    }
    
    logs.forEach(log => {
        const success = log.SUCCESS === 1 || log.SUCCESS === '1';
        const icon = success ? '\x1b[32m✓' : '\x1b[31m✗';
        const type = log.QUERY_TYPE.padEnd(10);
        const query = (log.QUERY_TEXT || '').substring(0, 60).replace(/\n/g, ' ');
        const rows = log.ROWS_AFFECTED || 0;
        const duration = log.DURATION || 'N/A';
        
        console.log(`${icon}\x1b[0m ${type} ${query}`);
        console.log(`  \x1b[90m└─ ${rows} filas, ${duration}\x1b[0m`);
        
        if (log.ERROR_MSG) {
            console.log(`  \x1b[90m└─ Error: ${log.ERROR_MSG}\x1b[0m`);
        }
        console.log();
    });
}

async function showQueryStats() {
    console.log('\x1b[1m\x1b[36m📊 Estadísticas Query Logs (última hora)\x1b[0m\n');
    
    const sql = `
        SELECT 
            QUERY_TYPE,
            COUNT(*) as TOTAL,
            SUM(CASE WHEN SUCCESS = 1 THEN 1 ELSE 0 END) as SUCCESS_COUNT,
            SUM(CASE WHEN SUCCESS = 0 THEN 1 ELSE 0 END) as ERROR_COUNT,
            AVG(ROWS_AFFECTED) as AVG_ROWS
        FROM QUERY_LOG
        WHERE CREATED_AT > SYSDATE - INTERVAL '1' HOUR
        GROUP BY QUERY_TYPE
        ORDER BY TOTAL DESC
    `;
    
    const res = await request('POST', '/query', { query: sql });
    
    if (!res.ok) {
        console.error('\x1b[31m✗ Error obteniendo estadísticas\x1b[0m');
        return;
    }
    
    const stats = res.data.rows || [];
    
    if (stats.length === 0) {
        console.log('  \x1b[90m(sin datos)\x1b[0m\n');
        return;
    }
    
    console.log('  Tipo       Total   ✓ OK    ✗ Error  Filas Prom.');
    console.log('  ' + '─'.repeat(50));
    
    stats.forEach(stat => {
        const type = stat.QUERY_TYPE.padEnd(10);
        const total = String(stat.TOTAL).padStart(5);
        const success = String(stat.SUCCESS_COUNT).padStart(5);
        const errors = String(stat.ERROR_COUNT).padStart(7);
        const avgRows = String(Math.round(stat.AVG_ROWS || 0)).padStart(11);
        
        console.log(`  ${type} ${total}   ${success}   ${errors}   ${avgRows}`);
    });
    console.log();
}

// ======================
// Main
// ======================

async function main() {
    const option = process.argv[2] || 'jobs';
    
    try {
        switch(option) {
            case 'jobs':
                await showJobs();
                break;
            case 'jobs:active':
                await showJobs('active');
                break;
            case 'jobs:completed':
                await showJobs('completed');
                break;
            case 'jobs:failed':
                await showJobs('failed');
                break;
            case 'jobs:clean':
                await cleanJobs();
                await showJobs();
                break;
            case 'logs':
                await showQueryLogs();
                break;
            case 'logs:stats':
                await showQueryStats();
                break;
            case 'logs:errors':
                await showQueryLogs('errors');
                break;
            default:
                console.log('\x1b[31m✗ Opción no válida\x1b[0m\n');
                console.log('Opciones disponibles:');
                console.log('  jobs, jobs:active, jobs:completed, jobs:failed, jobs:clean');
                console.log('  logs, logs:stats, logs:errors');
                process.exit(1);
        }
    } catch (error) {
        console.error(`\n\x1b[31m✗ Error: ${error.message}\x1b[0m\n`);
        process.exit(1);
    }
}

main();
