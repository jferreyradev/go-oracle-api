// Test del proxy
const PROXY_URL = "http://localhost:8000";

console.log("Probando proxy en", PROXY_URL);

try {
    // Test 1: Ping
    console.log("\n1. Test Ping...");
    const res1 = await fetch(`${PROXY_URL}/ping`);
    console.log("   Status:", res1.status);
    const data1 = await res1.json();
    console.log("   Respuesta:", data1);
    
    // Test 2: Query
    console.log("\n2. Test Query...");
    const res2 = await fetch(`${PROXY_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'SELECT USER, SYSDATE FROM DUAL' })
    });
    console.log("   Status:", res2.status);
    const data2 = await res2.json();
    console.log("   Filas:", data2.rows?.length || 0);
    
    // Test 3: Jobs
    console.log("\n3. Test Jobs...");
    const res3 = await fetch(`${PROXY_URL}/jobs`);
    console.log("   Status:", res3.status);
    const data3 = await res3.json();
    console.log("   Total jobs:", data3.total);
    
    // Test 4: Procedimiento síncrono
    console.log("\n4. Test Procedimiento Síncrono...");
    const res4 = await fetch(`${PROXY_URL}/procedure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: "BEGIN NULL; END;",
            params: []
        })
    });
    console.log("   Status:", res4.status);
    const data4 = await res4.json();
    console.log("   Resultado:", data4.success ? "✓ OK" : "✗ Error");
    
    // Test 5: Procedimiento Asíncrono
    console.log("\n5. Test Procedimiento Asíncrono...");
    const res5 = await fetch(`${PROXY_URL}/procedure/async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: "PROC_TEST_DEMORA",
            params: [
                { name: "segundos", value: 2, direction: "IN", type: "NUMBER" }
            ]
        })
    });
    console.log("   Status:", res5.status);
    const data5 = await res5.json();
    if (data5.job_id) {
        console.log("   ✓ Job creado:", data5.job_id);
        
        // Monitorear el job
        console.log("   Monitoreando job...");
        let jobStatus = "pending";
        let attempts = 0;
        while (jobStatus !== "completed" && jobStatus !== "failed" && attempts < 5) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const jobRes = await fetch(`${PROXY_URL}/jobs/${data5.job_id}`);
            const jobData = await jobRes.json();
            jobStatus = jobData.status;
            console.log(`   → Estado: ${jobStatus} (${jobData.progress || 0}%)`);
            attempts++;
        }
    } else {
        console.log("   ✗ Error:", data5.error || "No se pudo crear el job");
    }
    
    // Test 6: Stats del Proxy
    console.log("\n6. Estadísticas del Proxy...");
    const res6 = await fetch(`${PROXY_URL}/_proxy/stats`);
    console.log("   Status:", res6.status);
    const data6 = await res6.json();
    console.log("   Total requests:", data6.total);
    console.log("   Success rate:", data6.successRate);
    console.log("   Top endpoints:", Object.keys(data6.topEndpoints || {}).slice(0, 3).join(", "));
    
    console.log("\n✅ Todos los tests OK");
    
} catch (error) {
    console.error("\n❌ Error:", error.message);
}
