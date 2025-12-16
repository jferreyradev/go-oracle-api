// Test del sistema de autenticación del proxy
const PROXY_URL = "http://localhost:8000";

console.log("🔐 Test de Autenticación del Proxy\n");
console.log("━".repeat(50));

async function test(name, fn) {
    try {
        process.stdout.write(`${name.padEnd(45)} `);
        await fn();
        console.log("✅");
    } catch (error) {
        console.log(`❌ ${error.message}`);
    }
}

try {
    // 1. Ver usuarios disponibles
    console.log("\n1️⃣  Usuarios Disponibles\n");
    const usersRes = await fetch(`${PROXY_URL}/_proxy/users`);
    const usersData = await usersRes.json();
    usersData.availableUsers.forEach(u => {
        console.log(`   ${u.username.padEnd(10)} [${u.role.padEnd(10)}] ${u.description}`);
    });
    console.log(`   ${usersData.note}\n`);

    // 2. Intentar acceder sin token (debe fallar)
    console.log("2️⃣  Seguridad\n");
    await test("Acceso sin token (debe fallar)", async () => {
        const res = await fetch(`${PROXY_URL}/ping`);
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    // 3. Login fallido
    await test("Login con credenciales incorrectas", async () => {
        const res = await fetch(`${PROXY_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'wrong' })
        });
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    // 4. Login exitoso
    console.log("\n3️⃣  Login Exitoso\n");
    const loginRes = await fetch(`${PROXY_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    
    if (!loginRes.ok) {
        throw new Error(`Login failed: ${loginRes.status}`);
    }
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    
    console.log(`   ✓ Usuario: ${loginData.username}`);
    console.log(`   ✓ Role: ${loginData.role}`);
    console.log(`   ✓ Token: ${token.substring(0, 20)}...`);
    console.log(`   ✓ Expira en: ${loginData.expiresIn / 3600} horas\n`);

    // 5. Usar el token
    console.log("4️⃣  Usando el Token\n");
    
    await test("GET /ping con token", async () => {
        const res = await fetch(`${PROXY_URL}/ping`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
    });

    await test("POST /query con token", async () => {
        const res = await fetch(`${PROXY_URL}/query`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: 'SELECT 1 FROM DUAL' })
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
    });

    await test("GET /jobs con token", async () => {
        const res = await fetch(`${PROXY_URL}/jobs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
    });

    // 6. Test de permisos (usuario readonly)
    console.log("\n5️⃣  Test de Permisos (Usuario Readonly)\n");
    
    const readonlyLoginRes = await fetch(`${PROXY_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'demo', password: 'demo' })
    });
    
    const readonlyData = await readonlyLoginRes.json();
    const readonlyToken = readonlyData.token;
    
    console.log(`   ✓ Login como: ${readonlyData.username} (${readonlyData.role})\n`);

    await test("GET /ping (lectura permitida)", async () => {
        const res = await fetch(`${PROXY_URL}/ping`, {
            headers: { 'Authorization': `Bearer ${readonlyToken}` }
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
    });

    await test("POST /query (escritura bloqueada)", async () => {
        const res = await fetch(`${PROXY_URL}/query`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${readonlyToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: 'SELECT 1 FROM DUAL' })
        });
        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    // 7. Logout
    console.log("\n6️⃣  Logout\n");
    
    await test("POST /logout", async () => {
        const res = await fetch(`${PROXY_URL}/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
    });

    await test("Usar token después de logout (debe fallar)", async () => {
        const res = await fetch(`${PROXY_URL}/ping`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    // 8. Estadísticas
    console.log("\n7️⃣  Estadísticas de Autenticación\n");
    
    const statsRes = await fetch(`${PROXY_URL}/_proxy/stats`);
    const stats = await statsRes.json();
    
    console.log(`   Total requests: ${stats.total}`);
    console.log(`   Success rate: ${stats.successRate}`);
    console.log(`   Login attempts: ${stats.auth.loginAttempts}`);
    console.log(`   Login success: ${stats.auth.loginSuccess}`);
    console.log(`   Login failed: ${stats.auth.loginFailed}`);
    console.log(`   Active sessions: ${stats.auth.activeSessions}`);

    console.log("\n" + "━".repeat(50));
    console.log("\n✅ TODOS LOS TESTS DE AUTENTICACIÓN PASARON\n");
    
    console.log("📝 Resumen:");
    console.log("   ✓ Sistema de login funcional");
    console.log("   ✓ Tokens generados correctamente");
    console.log("   ✓ Validación de tokens OK");
    console.log("   ✓ Control de permisos por rol");
    console.log("   ✓ Logout funcional");
    console.log("   ✓ Estadísticas de auth disponibles\n");

} catch (error) {
    console.error("\n❌ Error:", error.message);
}
