const API_BASE = 'http://10.6.46.114:3013';
const API_TOKEN = 'test1';

async function testQueryLogging() {
    try {
        console.log('🧪 Probando registro de logs en QUERY_LOG...\n');

        // 1. Verificar que la tabla existe
        console.log('1️⃣ Verificando tabla QUERY_LOG...');
        const checkResponse = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`
            },
            body: JSON.stringify({
                query: "SELECT COUNT(*) as TOTAL FROM QUERY_LOG"
            })
        });

        if (!checkResponse.ok) {
            console.log('   ❌ Tabla QUERY_LOG no existe o hay error');
            console.log('   💡 Reinicia el servidor para crear la tabla automáticamente');
            return;
        }

        const checkData = await checkResponse.json();
        const totalBefore = checkData.results[0].TOTAL;
        console.log(`   ✅ Tabla existe. Registros actuales: ${totalBefore}`);

        // 2. Ejecutar una query de prueba
        console.log('\n2️⃣ Ejecutando query de prueba...');
        const testQuery = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`
            },
            body: JSON.stringify({
                query: 'SELECT USER, SYSDATE FROM DUAL'
            })
        });
        console.log(`   Status: ${testQuery.status} ${testQuery.ok ? '✅' : '❌'}`);

        // 3. Ejecutar un INSERT de prueba
        console.log('\n3️⃣ Ejecutando INSERT de prueba en tabla temporal...');
        
        // Crear tabla temporal
        await fetch(`${API_BASE}/exec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`
            },
            body: JSON.stringify({
                query: 'CREATE TABLE TEST_LOGS_TEMP (ID NUMBER, NOMBRE VARCHAR2(50))'
            })
        });

        // Insert de prueba
        const testInsert = await fetch(`${API_BASE}/exec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`
            },
            body: JSON.stringify({
                query: "INSERT INTO TEST_LOGS_TEMP VALUES (1, 'Test')"
            })
        });
        console.log(`   Status: ${testInsert.status} ${testInsert.ok ? '✅' : '❌'}`);

        // Limpiar
        await fetch(`${API_BASE}/exec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`
            },
            body: JSON.stringify({
                query: 'DROP TABLE TEST_LOGS_TEMP'
            })
        });

        // 4. Esperar a que se guarden los logs
        console.log('\n⏳ Esperando 3 segundos para que se guarden los logs...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 5. Contar cuántos logs nuevos hay
        console.log('\n4️⃣ Verificando logs nuevos...');
        const countResponse = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`
            },
            body: JSON.stringify({
                query: `
                    SELECT COUNT(*) as TOTAL 
                    FROM QUERY_LOG 
                    WHERE EXECUTION_TIME >= SYSDATE - INTERVAL '1' MINUTE
                `
            })
        });

        const countData = await countResponse.json();
        const recentLogs = countData.results[0].TOTAL;
        console.log(`   📊 Logs en el último minuto: ${recentLogs}`);

        // 6. Mostrar últimos logs
        console.log('\n5️⃣ Últimos 5 logs registrados:\n');
        const logsResponse = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_TOKEN}`
            },
            body: JSON.stringify({
                query: `
                    SELECT 
                        QUERY_TYPE,
                        SUBSTR(QUERY_TEXT, 1, 60) as QUERY,
                        TO_CHAR(EXECUTION_TIME, 'HH24:MI:SS') as TIME,
                        DURATION,
                        SUCCESS,
                        ROWS_AFFECTED
                    FROM QUERY_LOG
                    WHERE EXECUTION_TIME >= SYSDATE - INTERVAL '5' MINUTE
                    ORDER BY EXECUTION_TIME DESC
                    FETCH FIRST 5 ROWS ONLY
                `
            })
        });

        const logsData = await logsResponse.json();
        const logs = logsData.results || [];

        if (logs.length === 0) {
            console.log('   ⚠️  No se encontraron logs recientes');
            console.log('   💡 Posible causa: Los logs no se están guardando');
            console.log('   💡 Verifica el archivo log/ para ver si hay errores al guardar');
        } else {
            console.log('═'.repeat(90));
            logs.forEach((log, idx) => {
                const success = log.SUCCESS === 1 ? '✅' : '❌';
                console.log(`${idx + 1}. ${success} [${log.QUERY_TYPE}] ${log.TIME} - ${log.DURATION}`);
                console.log(`   Query: ${log.QUERY}`);
                console.log(`   Filas: ${log.ROWS_AFFECTED || 0}`);
                console.log('─'.repeat(90));
            });

            console.log(`\n✅ ¡Sistema de logging funcionando correctamente!`);
            console.log(`📊 Se registraron ${recentLogs} operaciones en el último minuto\n`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

testQueryLogging();
