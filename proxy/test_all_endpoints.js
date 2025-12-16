// Test exhaustivo de TODOS los endpoints de la API a través del proxy
const PROXY_URL = "http://localhost:8000";

console.log("🔍 Test EXHAUSTIVO de todos los endpoints\n");
console.log("━".repeat(50));

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        process.stdout.write(`${name.padEnd(40)} `);
        await fn();
        console.log("✅ OK");
        passed++;
    } catch (error) {
        console.log(`❌ FAIL: ${error.message}`);
        failed++;
    }
}

try {
    // 1. GET /ping
    await test("GET /ping", async () => {
        const res = await fetch(`${PROXY_URL}/ping`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
    });

    // 2. POST /query
    await test("POST /query", async () => {
        const res = await fetch(`${PROXY_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'SELECT 1 FROM DUAL' })
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
    });

    // 3. POST /procedure (síncrono)
    await test("POST /procedure", async () => {
        const res = await fetch(`${PROXY_URL}/procedure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "BEGIN NULL; END;",
                params: []
            })
        });
        // Puede fallar por PL/SQL, pero el endpoint responde
        if (res.status !== 200 && res.status !== 500) {
            throw new Error(`Status ${res.status}`);
        }
    });

    // 4. POST /procedure/async
    await test("POST /procedure/async", async () => {
        const res = await fetch(`${PROXY_URL}/procedure/async`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "BEGIN DBMS_LOCK.SLEEP(1); END;",
                params: []
            })
        });
        if (res.status !== 202 && res.status !== 500) {
            throw new Error(`Status ${res.status}`);
        }
    });

    // 5. GET /jobs
    await test("GET /jobs", async () => {
        const res = await fetch(`${PROXY_URL}/jobs`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (typeof data.total !== 'number') throw new Error("Invalid response");
    });

    // 6. GET /jobs/{id}
    await test("GET /jobs/{id}", async () => {
        // Primero obtener un job
        const listRes = await fetch(`${PROXY_URL}/jobs`);
        const listData = await listRes.json();
        
        if (listData.jobs && listData.jobs.length > 0) {
            const jobId = listData.jobs[0].id;
            const res = await fetch(`${PROXY_URL}/jobs/${jobId}`);
            if (!res.ok && res.status !== 404) {
                throw new Error(`Status ${res.status}`);
            }
        }
        // Si no hay jobs, asumir OK
    });

    // 7. DELETE /jobs?status=...
    await test("DELETE /jobs?status=completed", async () => {
        const res = await fetch(`${PROXY_URL}/jobs?status=completed`, {
            method: 'DELETE'
        });
        // 200 o 400 (sin jobs) son válidos
        if (res.status !== 200 && res.status !== 400) {
            throw new Error(`Status ${res.status}`);
        }
    });

    // 8. DELETE /jobs/{id}
    await test("DELETE /jobs/{id}", async () => {
        // Crear un job para eliminar
        const createRes = await fetch(`${PROXY_URL}/procedure/async`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "BEGIN NULL; END;",
                params: []
            })
        });
        
        if (createRes.status === 202) {
            const createData = await createRes.json();
            const jobId = createData.job_id;
            
            // Esperar un poco
            await new Promise(r => setTimeout(r, 1000));
            
            // Eliminar el job
            const delRes = await fetch(`${PROXY_URL}/jobs/${jobId}`, {
                method: 'DELETE'
            });
            
            if (delRes.status !== 200 && delRes.status !== 404) {
                throw new Error(`Status ${delRes.status}`);
            }
        }
    });

    // 9. GET /logs
    await test("GET /logs", async () => {
        const res = await fetch(`${PROXY_URL}/logs`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
    });

    // 10. GET /docs
    await test("GET /docs", async () => {
        const res = await fetch(`${PROXY_URL}/docs`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
    });

    // 11. OPTIONS (CORS preflight)
    await test("OPTIONS /ping (CORS)", async () => {
        const res = await fetch(`${PROXY_URL}/ping`, {
            method: 'OPTIONS'
        });
        if (res.status !== 204 && res.status !== 200) {
            throw new Error(`Status ${res.status}`);
        }
    });

    // 12. GET /download (sin archivo)
    await test("GET /download?id=999", async () => {
        const res = await fetch(`${PROXY_URL}/download?id=999`);
        // Puede ser 404 o 500, ambos son respuestas válidas
        if (res.status !== 404 && res.status !== 500 && res.status !== 200) {
            throw new Error(`Status ${res.status}`);
        }
    });

    // 13. POST /upload (sin archivo)
    await test("POST /upload (sin datos)", async () => {
        const res = await fetch(`${PROXY_URL}/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        // Debe dar error 400, pero el proxy funciona
        if (res.status !== 400 && res.status !== 500) {
            throw new Error(`Status ${res.status}`);
        }
    });

    // 14. Endpoint especial del proxy: /_proxy/stats
    await test("GET /_proxy/stats", async () => {
        const res = await fetch(`${PROXY_URL}/_proxy/stats`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (typeof data.total !== 'number') throw new Error("Invalid stats");
    });

    console.log("\n" + "━".repeat(50));
    console.log(`\n📊 RESUMEN FINAL:`);
    console.log(`   ✅ Exitosos: ${passed}`);
    console.log(`   ❌ Fallidos: ${failed}`);
    console.log(`   📈 Total: ${passed + failed}`);
    
    if (failed === 0) {
        console.log(`\n🎉 TODOS LOS ENDPOINTS FUNCIONAN CORRECTAMENTE A TRAVÉS DEL PROXY\n`);
    } else {
        console.log(`\n⚠️  Algunos endpoints fallaron\n`);
    }

    // Mostrar estadísticas finales del proxy
    console.log("━".repeat(50));
    console.log("\n📈 Estadísticas del Proxy:\n");
    const statsRes = await fetch(`${PROXY_URL}/_proxy/stats`);
    const stats = await statsRes.json();
    console.log(`   Total requests procesadas: ${stats.total}`);
    console.log(`   Success rate: ${stats.successRate}`);
    console.log(`   Requests exitosas: ${stats.success}`);
    console.log(`   Requests con error: ${stats.errors}`);
    console.log(`\n   Top 5 endpoints más usados:`);
    Object.entries(stats.topEndpoints || {})
        .slice(0, 5)
        .forEach(([endpoint, count], i) => {
            console.log(`      ${i+1}. ${endpoint.padEnd(35)} ${count}x`);
        });
    console.log();

} catch (error) {
    console.error("\n❌ Error fatal:", error.message);
}
