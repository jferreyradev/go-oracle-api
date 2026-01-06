#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Proxy Simple - Puente multi-backend con autenticación
 * 
 * Carga backends desde un endpoint y selecciona según prefijo de ruta.
 * Sistema de login con tokens de sesión.
 * 
 * Uso:
 *   deno run --allow-net --allow-env simple-proxy.ts
 * 
 * Variables de entorno:
 *   CONFIG_URL     URL del endpoint de configuración (devuelve lista de backends)
 *   CONFIG_TOKEN   Token para acceder al endpoint de configuración
 *   PROXY_USERS    Usuarios del proxy formato "user1:pass1,user2:pass2"
 *   DISABLE_AUTH   Deshabilitar autenticación (default: false)
 *   PORT           Puerto del proxy (default: 8000)
 */

interface Backend {
    name: string;
    url: string;
    token: string;
    prefix: string;
}

interface User {
    username: string;
    password: string;
}

interface Session {
    token: string;
    username: string;
    createdAt: number;
    expiresAt: number;
}

const CONFIG_URL = Deno.env.get('CONFIG_URL');
const CONFIG_TOKEN = Deno.env.get('CONFIG_TOKEN');
const PORT = parseInt(Deno.env.get('PORT') || '8000');
const DISABLE_AUTH = Deno.env.get('DISABLE_AUTH') === 'true';

// Parsear usuarios desde variable de entorno
const users: User[] = [];
const usersEnv = Deno.env.get('PROXY_USERS');
if (usersEnv) {
    usersEnv.split(',').forEach(userStr => {
        const [username, password] = userStr.trim().split(':');
        if (username && password) {
            users.push({ username, password });
        }
    });
}

// Si no hay usuarios configurados, usar usuario por defecto
if (users.length === 0) {
    users.push({ username: 'admin', password: 'admin123' });
}

// Sesiones activas
const sessions = new Map<string, Session>();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 horas

// Validar configuración
if (!CONFIG_URL || !CONFIG_TOKEN) {
    console.error('❌ Error: CONFIG_URL y CONFIG_TOKEN son requeridos');
    console.log('\nEjemplo de uso:');
    console.log('  deno run --allow-net --allow-env \\');
    console.log('    --env=CONFIG_URL=https://backends-proliq.deno.dev/items \\');
    console.log('    --env=CONFIG_TOKEN=desarrollotoken \\');
    console.log('    simple-proxy.ts');
    Deno.exit(1);
}

// Cargar backends desde el endpoint
let backends: Backend[] = [];
let lastUpdate = 0;
const CACHE_TTL = 60000; // 60 segundos

async function loadBackends(): Promise<Backend[]> {
    const now = Date.now();
    
    // Usar caché si está fresco
    if (backends.length > 0 && (now - lastUpdate) < CACHE_TTL) {
        return backends;
    }
    
    try {
        const response = await fetch(CONFIG_URL, {
            headers: {
                'Authorization': `Bearer ${CONFIG_TOKEN}`,
            },
        });
        
        if (!response.ok) {
            console.error(`❌ Error cargando backends: ${response.status}`);
            return backends; // Retornar caché anterior
        }
        
        const data = await response.json();
        backends = data;
        lastUpdate = now;
        
        console.log(`✅ Backends cargados: ${backends.length}`);
        return backends;
    } catch (error) {
        console.error('❌ Error cargando backends:', error.message);
        return backends; // Retornar caché anterior
    }
}

// Función para encontrar el backend correspondiente
function findBackend(path: string): Backend | null {
    for (const backend of backends) {
        if (path.startsWith(backend.prefix)) {
            return backend;
        }
    }
    return null;
}

// Función de logging
function log(method: string, path: string, status: number, time: number) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${method} ${path} - ${status} (${time}ms)`);
}

// Generar token de sesión
function generateToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Validar sesión
function validateSession(req: Request): Session | null {
    if (DISABLE_AUTH) {
        return { token: 'disabled', username: 'anonymous', createdAt: Date.now(), expiresAt: Date.now() + SESSION_DURATION };
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);
    const session = sessions.get(token);

    if (!session) {
        return null;
    }

    // Verificar si expiró
    if (Date.now() > session.expiresAt) {
        sessions.delete(token);
        return null;
    }

    return session;
}

// Limpiar sesiones expiradas
function cleanExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            sessions.delete(token);
        }
    }
}

// Handler principal
async function handler(req: Request): Promise<Response> {
    const startTime = Date.now();
    const url = new URL(req.url);
    const path = url.pathname;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Manejar OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Endpoint de health check (sin autenticación)
    if (path === '/_health') {
        return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }

    // Endpoint de login (público)
    if (path === '/login' && req.method === 'POST') {
        try {
            const body = await req.json();
            const { username, password } = body;

            if (!username || !password) {
                log(req.method, path, 400, Date.now() - startTime);
                return new Response(JSON.stringify({
                    error: 'Bad Request',
                    message: 'Se requiere username y password',
                }), {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders,
                    },
                });
            }

            // Buscar usuario
            const user = users.find(u => u.username === username && u.password === password);
            if (!user) {
                log(req.method, path, 401, Date.now() - startTime);
                return new Response(JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Usuario o contraseña incorrectos',
                }), {
                    status: 401,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders,
                    },
                });
            }

            // Crear sesión
            const token = generateToken();
            const session: Session = {
                token,
                username,
                createdAt: Date.now(),
                expiresAt: Date.now() + SESSION_DURATION,
            };
            sessions.set(token, session);

            log(req.method, path, 200, Date.now() - startTime);
            return new Response(JSON.stringify({
                success: true,
                token,
                expiresIn: SESSION_DURATION,
                user: { username },
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        } catch (error) {
            log(req.method, path, 400, Date.now() - startTime);
            return new Response(JSON.stringify({
                error: 'Bad Request',
                message: 'Error al procesar la petición',
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }
    }

    // Endpoint de logout
    if (path === '/logout' && req.method === 'POST') {
        const session = validateSession(req);
        if (session && session.token !== 'disabled') {
            sessions.delete(session.token);
        }
        log(req.method, path, 200, Date.now() - startTime);
        return new Response(JSON.stringify({
            success: true,
            message: 'Logout exitoso',
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }

    // Validar autenticación (excepto para endpoints públicos)
    const publicEndpoints = ['/_health', '/_backends', '/_info'];
    const isPublicEndpoint = publicEndpoints.some(ep => path.startsWith(ep));

    if (!isPublicEndpoint) {
        const session = validateSession(req);
        if (!session) {
            log(req.method, path, 401, Date.now() - startTime);
            return new Response(JSON.stringify({
                error: 'Unauthorized',
                message: 'Sesión inválida o expirada. Use POST /login para obtener un token.',
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'WWW-Authenticate': 'Bearer realm="Proxy API"',
                    ...corsHeaders,
                },
            });
        }
    }

    // Cargar backends
    await loadBackends();

    // Endpoint de info
    if (path === '/_info') {
        return new Response(JSON.stringify({
            authentication: {
                enabled: !DISABLE_AUTH,
                usersConfigured: users.length,
                activeSessions: sessions.size,
            },
            endpoints: {
                login: 'POST /login',
                logout: 'POST /logout',
                health: 'GET /_health',
                backends: 'GET /_backends',
                info: 'GET /_info',
            },
            usage: {
                login: {
                    method: 'POST',
                    url: '/login',
                    body: { username: 'string', password: 'string' },
                },
                authenticated: {
                    header: 'Authorization: Bearer <token>',
                },
            },
        }, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }

    // Endpoint para listar backends
    if (path === '/_backends') {
        return new Response(JSON.stringify(backends, null, 2), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }

    // Buscar backend correspondiente
    const backend = findBackend(path);
    if (!backend) {
        log(req.method, path, 404, Date.now() - startTime);
        return new Response(JSON.stringify({
            error: 'Not Found',
            message: `No se encontró un backend para el path: ${path}`,
            availableBackends: backends.map(b => ({ name: b.name, prefix: b.prefix })),
        }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }

    // Construir la URL del backend
    const pathWithoutPrefix = path.substring(backend.prefix.length);
    const backendUrl = `${backend.url}${pathWithoutPrefix}${url.search}`;

    try {
        // Preparar headers para el backend
        const headers = new Headers(req.headers);
        headers.delete('host');
        headers.set('Authorization', `Bearer ${backend.token}`);

        // Hacer la petición al backend
        const backendResponse = await fetch(backendUrl, {
            method: req.method,
            headers,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.blob() : undefined,
        });

        // Preparar la respuesta
        const responseHeaders = new Headers(backendResponse.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
            responseHeaders.set(key, value);
        });

        log(req.method, path, backendResponse.status, Date.now() - startTime);

        return new Response(backendResponse.body, {
            status: backendResponse.status,
            statusText: backendResponse.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        log(req.method, path, 502, Date.now() - startTime);
        return new Response(JSON.stringify({
            error: 'Bad Gateway',
            message: `Error al comunicarse con el backend: ${error.message}`,
            backend: backend.name,
        }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }
}

// Limpiar sesiones expiradas cada 5 minutos
setInterval(() => {
    cleanExpiredSessions();
}, 5 * 60 * 1000);

// Iniciar servidor
console.log('🚀 Proxy Simple con Login');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  🔧 Config:   ${CONFIG_URL}`);
console.log(`  🌐 Proxy:    http://localhost:${PORT}`);
console.log(`  🔐 Login:    POST http://localhost:${PORT}/login`);
console.log(`  🚪 Logout:   POST http://localhost:${PORT}/logout`);
console.log(`  ❤️  Health:   http://localhost:${PORT}/_health`);
console.log(`  📋 Backends: http://localhost:${PORT}/_backends`);
console.log(`  ℹ️  Info:     http://localhost:${PORT}/_info`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (DISABLE_AUTH) {
    console.log('⚠️  Autenticación DESHABILITADA');
} else {
    console.log(`🔐 Autenticación habilitada`);
    console.log(`   Usuarios configurados: ${users.length}`);
    users.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.username}`);
    });
    console.log(`   Duración de sesión: 24 horas`);
}

await loadBackends();
Deno.serve({ port: PORT }, handler);
