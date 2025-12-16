#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Proxy Server para go-oracle-api
 * 
 * Características:
 * - Reenvía todas las requests a la API backend
 * - Agrega automáticamente el token de autorización
 * - Logging de todas las requests
 * - CORS automático
 * - Rate limiting opcional
 * 
 * Uso:
 *   deno run --allow-net --allow-env proxy.ts
 *   deno run --allow-net --allow-env proxy.ts --port 8080 --api http://10.6.150.91:3000
 */

const PROXY_PORT = Deno.args.includes('--port') 
    ? parseInt(Deno.args[Deno.args.indexOf('--port') + 1]) 
    : 8000;

const API_URL = Deno.args.includes('--api')
    ? Deno.args[Deno.args.indexOf('--api') + 1]
    : Deno.env.get('API_URL') || 'http://localhost:3000';

const API_TOKEN = Deno.env.get('API_TOKEN') || 'test1';

// Sistema de autenticación
interface User {
    username: string;
    password: string;
    role: string;
}

interface Session {
    token: string;
    username: string;
    role: string;
    createdAt: number;
    expiresAt: number;
    lastActivity: number;
}

// Usuarios (en producción, usar BD)
const users: Map<string, User> = new Map([
    ['admin', { username: 'admin', password: 'admin123', role: 'admin' }],
    ['user', { username: 'user', password: 'user123', role: 'user' }],
    ['demo', { username: 'demo', password: 'demo', role: 'readonly' }],
]);

// Sesiones activas
const sessions: Map<string, Session> = new Map();

const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 horas
const SESSION_INACTIVITY = 2 * 60 * 60 * 1000; // 2 horas de inactividad

// Generar token aleatorio
function generateToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// Limpiar sesiones expiradas
function cleanExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
        if (now > session.expiresAt || (now - session.lastActivity) > SESSION_INACTIVITY) {
            sessions.delete(token);
        }
    }
}

// Validar token
function validateToken(token: string): Session | null {
    cleanExpiredSessions();
    const session = sessions.get(token);
    if (!session) return null;
    
    const now = Date.now();
    if (now > session.expiresAt || (now - session.lastActivity) > SESSION_INACTIVITY) {
        sessions.delete(token);
        return null;
    }
    
    // Actualizar última actividad
    session.lastActivity = now;
    return session;
}

// Estadísticas
const stats = {
    totalRequests: 0,
    successRequests: 0,
    errorRequests: 0,
    byEndpoint: new Map<string, number>(),
    loginAttempts: 0,
    loginSuccess: 0,
    loginFailed: 0,
    activeSessions: () => sessions.size,
};

// Rate limiting simple (por IP)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests por minuto
const RATE_WINDOW = 60 * 1000; // 1 minuto

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const limit = rateLimits.get(ip);
    
    if (!limit || now > limit.resetAt) {
        rateLimits.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
        return true;
    }
    
    if (limit.count >= RATE_LIMIT) {
        return false;
    }
    
    limit.count++;
    return true;
}

function logRequest(method: string, path: string, status: number, duration: number) {
    const timestamp = new Date().toISOString();
    const statusColor = status >= 200 && status < 300 ? '\x1b[32m' : '\x1b[31m';
    console.log(
        `\x1b[90m[${timestamp}]\x1b[0m ${method.padEnd(6)} ${path.padEnd(30)} ${statusColor}${status}\x1b[0m ${duration}ms`
    );
}

async function handleRequest(req: Request): Promise<Response> {
    const startTime = Date.now();
    stats.totalRequests++;
    
    // Extraer info de la request
    const url = new URL(req.url);
    const path = url.pathname + url.search;
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    
    // Actualizar estadísticas
    const count = stats.byEndpoint.get(path) || 0;
    stats.byEndpoint.set(path, count + 1);
    
    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
            },
        });
    }
    
    // Rate limiting
    if (!checkRateLimit(clientIP)) {
        stats.errorRequests++;
        const duration = Date.now() - startTime;
        logRequest(req.method, path, 429, duration);
        
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
    
    // Validar autenticación (excepto para /login y /_proxy/*)
    if (!path.startsWith('/_proxy/') && path !== '/login') {
        const authHeader = req.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');
        
        if (!token) {
            stats.errorRequests++;
            const duration = Date.now() - startTime;
            logRequest(req.method, path, 401, duration);
            
            return new Response(JSON.stringify({ 
                error: 'Unauthorized',
                message: 'Token requerido. Use POST /login para obtener un token.'
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'WWW-Authenticate': 'Bearer realm="API"',
                },
            });
        }
        
        const session = validateToken(token);
        if (!session) {
            stats.errorRequests++;
            const duration = Date.now() - startTime;
            logRequest(req.method, path, 401, duration);
            
            return new Response(JSON.stringify({ 
                error: 'Unauthorized',
                message: 'Token inválido o expirado. Use POST /login para obtener un nuevo token.'
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
        
        // Verificar permisos para operaciones de escritura
        if ((req.method === 'POST' || req.method === 'DELETE' || req.method === 'PUT') 
            && session.role === 'readonly') {
            stats.errorRequests++;
            const duration = Date.now() - startTime;
            logRequest(req.method, path, 403, duration);
            
            return new Response(JSON.stringify({ 
                error: 'Forbidden',
                message: 'Usuario readonly solo tiene permisos de lectura.'
            }), {
                status: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
    }
    
    try {
        // Construir URL del backend
        const backendUrl = `${API_URL}${path}`;
        
        // Copiar headers y agregar/sobrescribir autorización
        const headers = new Headers(req.headers);
        headers.set('Authorization', `Bearer ${API_TOKEN}`);
        
        // Reenviar request al backend
        const backendReq = new Request(backendUrl, {
            method: req.method,
            headers,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null,
        });
        
        const backendRes = await fetch(backendReq);
        
        // Copiar response
        const responseBody = await backendRes.arrayBuffer();
        const responseHeaders = new Headers(backendRes.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        
        const duration = Date.now() - startTime;
        
        if (backendRes.ok) {
            stats.successRequests++;
        } else {
            stats.errorRequests++;
        }
        
        logRequest(req.method, path, backendRes.status, duration);
        
        return new Response(responseBody, {
            status: backendRes.status,
            statusText: backendRes.statusText,
            headers: responseHeaders,
        });
        
    } catch (error) {
        stats.errorRequests++;
        const duration = Date.now() - startTime;
        logRequest(req.method, path, 500, duration);
        
        console.error(`\x1b[31m✗ Error proxying request:\x1b[0m`, error.message);
        
        return new Response(
            JSON.stringify({ error: 'Proxy error', message: error.message }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            }
        );
    }
}

// Endpoint de login
async function handleLoginRequest(req: Request): Promise<Response> {
    stats.loginAttempts++;
    
    try {
        const body = await req.json();
        const { username, password } = body;
        
        if (!username || !password) {
            stats.loginFailed++;
            return new Response(JSON.stringify({ 
                error: 'Bad Request',
                message: 'username y password son requeridos'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
        
        const user = users.get(username);
        if (!user || user.password !== password) {
            stats.loginFailed++;
            return new Response(JSON.stringify({ 
                error: 'Unauthorized',
                message: 'Credenciales inválidas'
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
        
        // Crear sesión
        const token = generateToken();
        const now = Date.now();
        const session: Session = {
            token,
            username: user.username,
            role: user.role,
            createdAt: now,
            expiresAt: now + SESSION_DURATION,
            lastActivity: now,
        };
        
        sessions.set(token, session);
        stats.loginSuccess++;
        
        return new Response(JSON.stringify({ 
            success: true,
            token,
            username: user.username,
            role: user.role,
            expiresIn: SESSION_DURATION / 1000, // segundos
            message: 'Login exitoso. Use el token en el header: Authorization: Bearer <token>'
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
        
    } catch (error) {
        stats.loginFailed++;
        return new Response(JSON.stringify({ 
            error: 'Bad Request',
            message: 'JSON inválido'
        }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
}

// Endpoint de logout
function handleLogoutRequest(req: Request): Response {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (token && sessions.has(token)) {
        sessions.delete(token);
        return new Response(JSON.stringify({ 
            success: true,
            message: 'Logout exitoso'
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
    
    return new Response(JSON.stringify({ 
        error: 'Bad Request',
        message: 'Token no encontrado'
    }), {
        status: 400,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

// Endpoint de estadísticas del proxy
function handleStatsRequest(): Response {
    cleanExpiredSessions();
    const topEndpoints = Array.from(stats.byEndpoint.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    const statsData = {
        uptime: Date.now(),
        total: stats.totalRequests,
        success: stats.successRequests,
        errors: stats.errorRequests,
        successRate: stats.totalRequests > 0 
            ? ((stats.successRequests / stats.totalRequests) * 100).toFixed(2) + '%'
            : '0%',
        topEndpoints: Object.fromEntries(topEndpoints),
        activeRateLimits: rateLimits.size,
        auth: {
            loginAttempts: stats.loginAttempts,
            loginSuccess: stats.loginSuccess,
            loginFailed: stats.loginFailed,
            activeSessions: stats.activeSessions(),
        },
    };
    
    return new Response(JSON.stringify(statsData, null, 2), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    
    // Endpoint de login
    if (url.pathname === '/login' && req.method === 'POST') {
        return handleLoginRequest(req);
    }
    
    // Endpoint de logout
    if (url.pathname === '/logout' && req.method === 'POST') {
        return handleLogoutRequest(req);
    }
    
    // Endpoint especial para ver estadísticas del proxy
    if (url.pathname === '/_proxy/stats') {
        return handleStatsRequest();
    }
    
    // Endpoint de info de usuarios (solo para testing)
    if (url.pathname === '/_proxy/users' && req.method === 'GET') {
        return new Response(JSON.stringify({
            availableUsers: [
                { username: 'admin', role: 'admin', description: 'Acceso total' },
                { username: 'user', role: 'user', description: 'Acceso normal' },
                { username: 'demo', role: 'readonly', description: 'Solo lectura' },
            ],
            note: 'Passwords: admin123, user123, demo'
        }, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
    
    return handleRequest(req);
}

console.log('\x1b[1m\x1b[36m🔗 Proxy Server para go-oracle-api\x1b[0m');
console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
console.log(`  Proxy:    http://localhost:${PROXY_PORT}`);
console.log(`  Backend:  ${API_URL}`);
console.log(`  Token:    ${API_TOKEN.substring(0, 4)}***`);
console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
console.log(`  🔐 Autenticación habilitada`);
console.log(`  POST /login        - Obtener token`);
console.log(`  POST /logout       - Cerrar sesión`);
console.log(`  GET  /_proxy/users - Ver usuarios disponibles`);
console.log(`  GET  /_proxy/stats - Ver estadísticas`);
console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
console.log(`  👥 Usuarios: admin, user, demo`);
console.log(`  ⏱️  Duración sesión: 24h`);
console.log(`  ⌛ Inactividad máxima: 2h`);
console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
console.log(`\x1b[32m✓ Servidor escuchando\x1b[0m\n`);

Deno.serve({ port: PROXY_PORT }, handler);
