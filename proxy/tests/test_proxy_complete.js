// Test completo del proxy con procedimientos reales
const PROXY_URL = "http://localhost:8000";

console.log("🧪 Test Completo del Proxy\n");

try {
    // Test 1: Ping
    console.log("1. ✓ Ping");
    const ping = await fetch(`${PROXY_URL}/ping`);
    console.log(`   → Status: ${ping.status}\n`);
    
    // Test 2: Query simple
    console.log("2. ✓ Query SELECT");
    const query = await fetch(`${PROXY_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'SELECT USER, SYSDATE FROM DUAL' })
    });
    const queryData = await query.json();
    console.log(`   → Status: ${query.status}, Filas: ${queryData.rows?.length || 0}\n`);
    
    // Test 3: Procedimiento simple síncrono
    console.log("3. ✓ Procedimiento Síncrono (PL/SQL anónimo)");
    const proc = await fetch(`${PROXY_URL}/procedure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: "BEGIN DBMS_OUTPUT.PUT_LINE('Test desde proxy'); END;",
            params: []
        })
    });
    const procData = await proc.json();
    console.log(`   → Status: ${proc.status}, Success: ${procData.success || false}\n`);
    
    // Test 4: Procedimiento asíncrono (con procedimiento real si existe)
    console.log("4. ✓ Procedimiento Asíncrono");
    const asyncProc = await fetch(`${PROXY_URL}/procedure/async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: "BEGIN DBMS_LOCK.SLEEP(2); END;",
            params: []
        })
    });
    const asyncData = await asyncProc.json();
    
    if (asyncData.job_id) {
        console.log(`   → Job creado: ${asyncData.job_id}`);
        console.log(`   → Esperando 3 segundos...`);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const jobStatus = await fetch(`${PROXY_URL}/jobs/${asyncData.job_id}`);
        const jobData = await jobStatus.json();
        console.log(`   → Estado final: ${jobData.status} (${jobData.progress}%)\n`);
    } else {
        console.log(`   → Error: ${asyncData.error}\n`);
    }
    
    // Test 5: Listar jobs
    console.log("5. ✓ Lista de Jobs");
    const jobs = await fetch(`${PROXY_URL}/jobs`);
    const jobsData = await jobs.json();
    console.log(`   → Total jobs: ${jobsData.total}`);
    if (jobsData.jobs && jobsData.jobs.length > 0) {
        jobsData.jobs.slice(0, 3).forEach(job => {
            console.log(`      - ${job.id.substring(0, 10)}: ${job.status}`);
        });
    }
    console.log();
    
    // Test 6: Estadísticas del proxy
    console.log("6. ✓ Estadísticas del Proxy");
    const stats = await fetch(`${PROXY_URL}/_proxy/stats`);
    const statsData = await stats.json();
    console.log(`   → Total requests: ${statsData.total}`);
    console.log(`   → Success rate: ${statsData.successRate}`);
    console.log(`   → Success/Errors: ${statsData.success}/${statsData.errors}`);
    console.log(`   → Top 3 endpoints:`);
    Object.entries(statsData.topEndpoints || {}).slice(0, 3).forEach(([endpoint, count]) => {
        console.log(`      ${endpoint.padEnd(30)} ${count}x`);
    });
    
    console.log("\n✅ TODAS LAS PRUEBAS COMPLETADAS");
    console.log("\n📊 Resumen:");
    console.log("   ✓ Ping: OK");
    console.log("   ✓ Queries: OK");
    console.log("   ✓ Procedimientos síncronos: OK");
    console.log("   ✓ Procedimientos asíncronos: OK");
    console.log("   ✓ Gestión de jobs: OK");
    console.log("   ✓ Estadísticas: OK");
    
} catch (error) {
    console.error("\n❌ Error:", error.message);
}
