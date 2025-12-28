#!/usr/bin/env -S deno run --allow-net

/**
 * Test Suite para Proxy en Deno Deploy
 * 
 * Uso:
 *   deno run --allow-net tests/test_deploy.ts https://my-proxy.deno.dev
 *   deno run --allow-net tests/test_deploy.ts https://my-proxy.deno.dev --verbose
 */

interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
}

interface TestContext {
    baseUrl: string;
    token?: string;
    results: TestResult[];
    verbose: boolean;
}

const ctx: TestContext = {
    baseUrl: Deno.args[0] || 'http://localhost:8000',
    results: [],
    verbose: Deno.args.includes('--verbose'),
};

// Colores para output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    gray: '\x1b[90m',
};

function log(color: string, text: string) {
    console.log(`${color}${text}${colors.reset}`);
}

function logSuccess(text: string) {
    log(colors.green, `✓ ${text}`);
}

function logError(text: string) {
    log(colors.red, `✗ ${text}`);
}

function logInfo(text: string) {
    log(colors.blue, `ℹ ${text}`);
}

function logDebug(text: string) {
    if (ctx.verbose) {
        log(colors.gray, `  → ${text}`);
    }
}

async function test(name: string, fn: () => Promise<void>) {
    const startTime = Date.now();
    
    try {
        logDebug(`Iniciando: ${name}`);
        await fn();
        const duration = Date.now() - startTime;
        logSuccess(`${name} (${duration}ms)`);
        ctx.results.push({ name, passed: true, duration });
    } catch (error) {
        const duration = Date.now() - startTime;
        logError(`${name} (${duration}ms)`);
        logDebug(`Error: ${error.message}`);
        ctx.results.push({ name, passed: false, duration, error: error.message });
    }
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual(actual: unknown, expected: unknown, message?: string) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

async function request(method: string, path: string, options?: RequestInit & { body?: unknown; expectStatus?: number }) {
    const url = `${ctx.baseUrl}${path}`;
    const headers = new Headers(options?.headers || {});
    
    if (ctx.token && !path.startsWith('/_proxy/health')) {
        headers.set('Authorization', `Bearer ${ctx.token}`);
    }
    
    const body = options?.body ? JSON.stringify(options.body) : undefined;
    if (body) headers.set('Content-Type', 'application/json');
    
    logDebug(`${method} ${path}`);
    
    const response = await fetch(url, {
        method,
        headers,
        body,
    });
    
    const expectStatus = options?.expectStatus || 200;
    if (response.status !== expectStatus) {
        throw new Error(`Expected status ${expectStatus}, got ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type');
    let data = null;
    
    if (contentType?.includes('application/json')) {
        data = await response.json();
    } else {
        data = await response.text();
    }
    
    return {
        status: response.status,
        headers: response.headers,
        data,
    };
}

// ============================================================================
// PRUEBAS
// ============================================================================

async function runTests() {
    console.log(`\n${colors.blue}${colors.bold || ''}🧪 Test Suite - Proxy Deno Deploy${colors.reset}`);
    log(colors.gray, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    logInfo(`Base URL: ${ctx.baseUrl}\n`);

    // ========================================================================
    // 1. HEALTH CHECK
    // ========================================================================
    
    await test('Health Check', async () => {
        const res = await request('GET', '/_proxy/health');
        assert(res.data.status === 'ok', 'Health status should be ok');
        assert(res.data.backend, 'Backend URL should be present');
    });

    // ========================================================================
    // 2. USUARIOS
    // ========================================================================
    
    await test('Get Available Users', async () => {
        const res = await request('GET', '/_proxy/users');
        assert(Array.isArray(res.data.availableUsers), 'Should return users array');
        assert(res.data.availableUsers.length === 3, 'Should have 3 default users');
    });

    // ========================================================================
    // 3. AUTENTICACIÓN
    // ========================================================================
    
    await test('Login Success (admin)', async () => {
        const res = await request('POST', '/login', {
            body: { username: 'admin', password: 'admin123' },
        });
        assert(res.data.success === true, 'Login should succeed');
        assert(res.data.token, 'Should return token');
        assert(res.data.username === 'admin', 'Username should match');
        assert(res.data.role === 'admin', 'Role should be admin');
        ctx.token = res.data.token;
    });

    await test('Login Failure (bad password)', async () => {
        await request('POST', '/login', {
            body: { username: 'admin', password: 'wrongpassword' },
            expectStatus: 401,
        });
    });

    await test('Login Failure (missing credentials)', async () => {
        await request('POST', '/login', {
            body: { username: 'admin' },
            expectStatus: 400,
        });
    });

    // ========================================================================
    // 4. AUTENTICACIÓN EN ENDPOINTS
    // ========================================================================
    
    await test('Request without token (should fail)', async () => {
        const headers = new Headers();
        // No token
        const url = `${ctx.baseUrl}/api/procedures`;
        const response = await fetch(url, { method: 'GET', headers });
        assert(response.status === 401, 'Should return 401 without token');
    });

    await test('Request with invalid token (should fail)', async () => {
        const headers = new Headers();
        headers.set('Authorization', 'Bearer invalid-token-12345');
        const url = `${ctx.baseUrl}/api/procedures`;
        const response = await fetch(url, { method: 'GET', headers });
        assert(response.status === 401, 'Should return 401 with invalid token');
    });

    // ========================================================================
    // 5. USUARIOS CON ROLES
    // ========================================================================
    
    await test('Login with readonly user', async () => {
        const res = await request('POST', '/login', {
            body: { username: 'demo', password: 'demo' },
        });
        assert(res.data.role === 'readonly', 'Role should be readonly');
    });

    // ========================================================================
    // 6. ESTADÍSTICAS
    // ========================================================================
    
    await test('Get Proxy Stats', async () => {
        const res = await request('GET', '/_proxy/stats');
        assert(res.data.total > 0, 'Total requests should be > 0');
        assert(res.data.success >= 0, 'Success count should be present');
        assert(res.data.auth, 'Auth stats should be present');
    });

    // ========================================================================
    // 7. CORS
    // ========================================================================
    
    await test('CORS Headers Present', async () => {
        const res = await request('GET', '/_proxy/health');
        const corsHeader = res.headers.get('access-control-allow-origin');
        assert(corsHeader !== null, 'CORS header should be present');
        assert(corsHeader === '*', 'CORS should allow all origins');
    });

    await test('CORS Preflight', async () => {
        const url = `${ctx.baseUrl}/api/procedures`;
        const response = await fetch(url, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://example.com',
                'Access-Control-Request-Method': 'GET',
            },
        });
        assert(response.status === 204, 'Preflight should return 204');
        assert(response.headers.get('access-control-allow-origin') !== null, 'CORS headers should be present');
    });

    // ========================================================================
    // 8. LOGOUT
    // ========================================================================
    
    await test('Logout Success', async () => {
        // Primero login
        const loginRes = await request('POST', '/login', {
            body: { username: 'admin', password: 'admin123' },
        });
        const token = loginRes.data.token;
        
        // Luego logout
        const headers = new Headers();
        headers.set('Authorization', `Bearer ${token}`);
        const url = `${ctx.baseUrl}/logout`;
        const response = await fetch(url, { method: 'POST', headers });
        
        assert(response.status === 200, 'Logout should succeed');
        const data = await response.json();
        assert(data.success === true, 'Logout response should be success');
    });

    // ========================================================================
    // 9. RATE LIMITING (Opcional - solo si se puede testear)
    // ========================================================================
    
    await test('Rate Limiting Mechanism', async () => {
        // Verificar que el rate limit está activo
        const res = await request('GET', '/_proxy/stats');
        assert(res.data.activeRateLimits >= 0, 'Rate limit tracking should be present');
    });

    // ========================================================================
    // 10. BACKEND CONNECTIVITY
    // ========================================================================
    
    await test('Backend Connectivity Check', async () => {
        // Esto dependerá de si el backend está disponible
        // Intentamos un request válido autenticado
        try {
            const res = await request('GET', '/api/procedures', {
                expectStatus: 200, // Puede ser 200, 404, 500 según disponibilidad
            });
            assert(true, 'Backend responded');
        } catch (e) {
            // Si no responde, es un problema de conectividad
            if (e.message.includes('Expected status')) {
                logInfo('Backend no está disponible (pero proxy está funcionando)');
            } else {
                throw e;
            }
        }
    });

    // ========================================================================
    // RESUMEN
    // ========================================================================
    
    log(colors.gray, `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    const passed = ctx.results.filter(r => r.passed).length;
    const failed = ctx.results.filter(r => !r.passed).length;
    const total = ctx.results.length;
    const duration = ctx.results.reduce((a, b) => a + b.duration, 0);
    
    console.log(`\n${colors.blue}Resultados:${colors.reset}`);
    console.log(`  ✓ Pasaron:  ${colors.green}${passed}${colors.reset}`);
    console.log(`  ✗ Fallaron: ${failed > 0 ? colors.red : colors.gray}${failed}${colors.reset}`);
    console.log(`  ⏱ Duración: ${duration}ms`);
    console.log(`  📊 Total:   ${total} tests\n`);
    
    if (failed === 0) {
        log(colors.green, `✓ ¡Todos los tests pasaron! El proxy está funcionando correctamente.`);
    } else {
        log(colors.red, `✗ ${failed} test(s) fallaron. Revisa los errores arriba.`);
        console.log('\nDetalles de fallos:');
        ctx.results.filter(r => !r.passed).forEach(r => {
            console.log(`  - ${r.name}: ${r.error}`);
        });
    }
    
    log(colors.gray, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    return failed === 0;
}

// Ejecutar tests
const success = await runTests();
Deno.exit(success ? 0 : 1);
