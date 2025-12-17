// TEST FINAL - Verificación completa del sistema

const PROXY_URL = "http://localhost:8000";
const BACKEND_URL = "http://10.6.46.114:3013";
const BACKEND_TOKEN = "test1";

async function testFinal() {
    console.log("╔═══════════════════════════════════════════╗");
    console.log("║     🚀 TEST FINAL DEL SISTEMA             ║");
    console.log("╚═══════════════════════════════════════════╝\n");

    let passed = 0;
    let failed = 0;

    // Test 1: Backend conectividad
    console.log("1️⃣  Backend conectividad...");
    try {
        const res = await fetch(`${BACKEND_URL}/query`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${BACKEND_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: "SELECT 1 FROM DUAL" })
        });
        if (res.ok) {
            console.log("   ✅ Backend OK\n");
            passed++;
        } else {
            console.log("   ❌ Backend falla\n");
            failed++;
        }
    } catch (e) {
        console.log("   ❌ Backend no alcanzable\n");
        failed++;
    }

    // Test 2: Proxy autenticación
    console.log("2️⃣  Proxy autenticación...");
    let token = "";
    try {
        const res = await fetch(`${PROXY_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "admin", password: "admin123" })
        });
        if (res.ok) {
            const data = await res.json();
            token = data.token;
            console.log("   ✅ Login OK\n");
            passed++;
        } else {
            console.log("   ❌ Login falla\n");
            failed++;
        }
    } catch (e) {
        console.log("   ❌ Proxy no alcanzable\n");
        failed++;
    }

    // Test 3: Query simple
    console.log("3️⃣  Query SELECT...");
    if (token) {
        try {
            const res = await fetch(`${PROXY_URL}/query`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ query: "SELECT SYSDATE FROM DUAL" })
            });
            if (res.ok) {
                console.log("   ✅ Query OK\n");
                passed++;
            } else {
                console.log("   ❌ Query falla\n");
                failed++;
            }
        } catch (e) {
            console.log("   ❌ Query error:", e.message, "\n");
            failed++;
        }
    }

    // Test 4: Función EXISTE_PROC_CAB
    console.log("4️⃣  Función EXISTE_PROC_CAB...");
    if (token) {
        try {
            const res = await fetch(`${PROXY_URL}/procedure`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "EXISTE_PROC_CAB",
                    isFunction: true,
                    params: [
                        { name: "vCOUNT", direction: "OUT", type: "number" },
                        { name: "vIDGRUPOREP", value: -1, direction: "IN", type: "number" },
                        { name: "vID_PROC_CAB", value: 1, direction: "IN", type: "number" }
                    ]
                })
            });
            const data = await res.json();
            if (res.ok && data.status === "ok") {
                console.log("   ✅ Función OK - Resultado:", data.out.vCOUNT, "\n");
                passed++;
            } else {
                console.log("   ❌ Función falla:", data.error?.substring(0, 50), "\n");
                failed++;
            }
        } catch (e) {
            console.log("   ❌ Función error:", e.message, "\n");
            failed++;
        }
    }

    // Test 5: Sinónimo verificación
    console.log("5️⃣  Sinónimo EXISTE_PROC_CAB...");
    try {
        const res = await fetch(`${BACKEND_URL}/query`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${BACKEND_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ 
                query: "SELECT COUNT(*) as existe FROM user_synonyms WHERE synonym_name = 'EXISTE_PROC_CAB'" 
            })
        });
        const data = await res.json();
        if (res.ok && data.results[0].EXISTE === "1") {
            console.log("   ✅ Sinónimo existe\n");
            passed++;
        } else {
            console.log("   ⚠️  Sinónimo no encontrado\n");
        }
    } catch (e) {
        console.log("   ❌ Error verificando sinónimo\n");
    }

    // Resumen
    console.log("═".repeat(47));
    console.log(`\n📊 RESULTADO: ${passed}/${passed + failed} tests pasaron\n`);
    
    if (failed === 0) {
        console.log("🎉 SISTEMA COMPLETAMENTE FUNCIONAL\n");
        console.log("📝 Uso:");
        console.log("   • Frontend: http://localhost:8000/frontend");
        console.log("   • Usuario: admin / admin123");
        console.log("   • Para EXISTE_PROC_CAB usa:");
        console.log('     { "name": "EXISTE_PROC_CAB", ... }');
    } else {
        console.log("⚠️  Algunos tests fallaron. Revisa arriba.\n");
    }
}

testFinal();
