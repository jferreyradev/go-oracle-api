const API_BASE = 'http://10.6.46.114:3013';
const API_TOKEN = 'test1';

async function viewQueryLogs() {
    try {
        console.log('Consultando logs de queries desde la BD Oracle...\n');

        const response = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`
            },
            body: JSON.stringify({
                query: `
                    SELECT 
                        LOG_ID,
                        QUERY_TYPE,
                        SUBSTR(QUERY_TEXT, 1, 100) as QUERY_TEXT,
                        EXECUTION_TIME,
                        DURATION,
                        ROWS_AFFECTED,
                        SUCCESS,
                        SUBSTR(ERROR_MSG, 1, 200) as ERROR_MSG,
                        USER_IP
                    FROM QUERY_LOG
                    ORDER BY EXECUTION_TIME DESC
                    FETCH FIRST 20 ROWS ONLY
                `
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('❌ Error:', error.error);
            return;
        }

        const data = await response.json();
        const logs = data.results || [];

        if (logs.length === 0) {
            console.log('📭 No hay logs registrados aún\n');
            return;
        }

        console.log(`📊 Últimos ${logs.length} logs:\n`);
        console.log('═'.repeat(120));

        logs.forEach((log, idx) => {
            const success = log.SUCCESS === 1 ? '✅' : '❌';
            console.log(`${idx + 1}. ${success} ${log.QUERY_TYPE} - ${log.LOG_ID}`);
            console.log(`   Query: ${log.QUERY_TEXT}`);
            console.log(`   Tiempo: ${log.EXECUTION_TIME} | Duración: ${log.DURATION}`);
            console.log(`   Filas: ${log.ROWS_AFFECTED || 0} | IP: ${log.USER_IP || 'N/A'}`);
            if (log.ERROR_MSG) {
                console.log(`   ⚠️  Error: ${log.ERROR_MSG}`);
            }
            console.log('─'.repeat(120));
        });

        // Estadísticas
        const successCount = logs.filter(l => l.SUCCESS === 1).length;
        const failCount = logs.filter(l => l.SUCCESS === 0).length;
        const queryCount = logs.filter(l => l.QUERY_TYPE === 'QUERY').length;
        const execCount = logs.filter(l => l.QUERY_TYPE === 'EXEC').length;
        const procCount = logs.filter(l => l.QUERY_TYPE === 'PROCEDURE').length;

        console.log('\n📈 Estadísticas:');
        console.log(`   Total: ${logs.length}`);
        console.log(`   Exitosos: ${successCount} (${(successCount/logs.length*100).toFixed(1)}%)`);
        console.log(`   Fallidos: ${failCount} (${(failCount/logs.length*100).toFixed(1)}%)`);
        console.log(`   Por tipo: QUERY=${queryCount}, EXEC=${execCount}, PROCEDURE=${procCount}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

viewQueryLogs();
