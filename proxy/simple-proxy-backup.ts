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
        
        if (Array.isArray(data)) {
            backends = data
                .filter((item: any) => item.name && item.url && item.token && item.prefix)
                .map((item: any) => ({
                    name: item.name.toLowerCase(),
                    url: item.url.replace(/\/$/, ''),
                    token: item.token,
                    prefix: item.prefix.startsWith('/') ? item.prefix : `/${item.prefix}`,
                }));
            
            lastUpdate = now;
            console.log(`✓ ${backends.length} backends cargados`);
        }
        
        return backends;
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return backends; // Retornar caché anterior
    }
}

// Encontrar backend según el path
function findBackend(path: string): { backend: Backend; cleanPath: string } | null {
    for (const backend of backends) {
        if (path.startsWith(backend.prefix)) {
            const cleanPath = path.substring(backend.prefix.length) || '/';
            return { backend, cleanPath };
        }
    }
    return null;
}

// Función para logging simple
function log(method: string, path: string, status: number, duration: number) {
    const timestamp = new Date().toISOString().substring(11, 23);
    const statusIcon = status >= 200 && status < 300 ? '✓' : '✗';
    console.log(`[${timestamp}] ${statusIcon} ${method.padEnd(6)} ${path.padEnd(40)} ${status} (${duration}ms)`);
}

// Generar token aleatorio
function generateToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// Validar sesión
function validateSession(req: Request): Session | null {
    if (DISABLE_AUTH) {
        return { token: 'disabled', username: 'anonymous', createdAt: 0, expiresAt: Date.now() + SESSION_DURATION };
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);
    const session = sessions.get(token);

    // Endpoint de login (público)
    if (path === '/login' && req.method === 'POST') {
        try {
            const body = await req.json();
            const { username, password } = body;

            if (!username || !password) {
                log(req.method, path, 400, Date.now() - startTime);
                return new Response(JSON.stringify({
                    error: 'Bad Request',
                    message: 'username y password son requeridos',
                }), {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders,
                    },
                });
            }

            // Verificar credenciales
            const user = users.find(u => u.username === username && u.password === password);
            if (!user) {
                log(req.method, path, 401, Date.now() - startTime);
                return new Response(JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Credenciales inválidas',
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
            const now = Date.now();
            const session: Session = {
                token,
                username: user.username,
                createdAt: now,
                expiresAt: now + SESSION_DURATION,
            };

            sessions.set(token, session);
            log(req.method, path, 200, Date.now() - startTime);

            return new Response(JSON.stringify({
                success: true,
                token,
                username: user.username,
                expiresIn: SESSION_DURATION / 1000, // segundos
                message: 'Login exitoso. Use el token en el header: Authorization: Bearer <token>',
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
                message: 'JSON inválido',
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
    const startTime = Date.now();con Login');
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Manejar OPTIONS (preflight)
// Limpiar sesiones expiradas cada 5 minutos
setInterval(() => {
    cleanExpiredSessions();
}, 5 * 60 * 1000);

    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    // Cargar backends
    await loadBackends();

    // Endpoint de health check
    if (path === '/_health') {
        return new Response(JSON.stringify({
            status: 'ok',
            backends: backends.map(b => ({
                name: b.name,
                url: b.url,
                prefix: b.prefix,
            })),
            totalBackends: backends.length,
            timestamp: new Date().toISOString(),
        }), {
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }

    // Endpoint para listar backends
    if (path === '/_backends') {
        return new Response(JSON.stringify({
            backends: backends.map(b => ({
                name: b.name,
                url: b.url,
                prefix: b.prefix,
                example: `${b.prefix}/api/procedures`,
            })),
            total: backends.length,
        }, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders,
            },
        });
    }

    try {
        // Encontrar backend según el prefijo
        const match = findBackend(path);
        
        if (!match) {
            return new Response(JSON.stringify({
                error: 'Backend not found',
                message: `No hay backend configurado para: ${path}`,
                availableBackends: backends.map(b => ({
                    prefix: b.prefix,
                    example: `${b.prefix}/api/procedures`,
                })),
            }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            });
        }

        const { backend, cleanPath } = match;

        // Construir URL completa del backend
        const backendUrl = `${backend.url}${cleanPath}`;

        // Copiar headers y agregar autorización
        const headers = new Headers();
        
        // Copiar headers importantes de la request original
        for (const [key, value] of req.headers.entries()) {
            if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'authorization') {
                headers.set(key, value);
            }
        }
        
        // Agregar token del backend específico
        headers.set('Authorization', `Bearer ${backend.token}`);
        headers.set('X-Proxy-Backend', backend.name);

        // Hacer la request al backend
        const backendReq = new Request(backendUrl, {
            method: req.method,
            headers,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null,
        });

        const backendRes = await fetch(backendReq);
        const duration = Date.now() - startTime;

        // Log
        log(req.method, `${path} → ${backend.name}`, backendRes.status, duration);

        // Copiar respuesta del backend
        const responseBody = await backendRes.arrayBuffer();
        const responseHeaders = new Headers(backendRes.headers);
        
        // Agregar CORS y metadata
        for (const [key, value] of Object.entries(corsHeaders)) {
            responseHeaders.set(key, value);
        }
        responseHeaders.set('X-Proxy-Backend', backend.name);

        return new Response(responseBody, {
            status: backendRes.status,
            statusText: backendRes.statusText,
            headers: responseHeaders,
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        log(req.method, path, 500, duration);
        
        console.error(`❌ Error: ${error.message}`);

        return new Response(
            JSON.stringify({ 
                error: 'Proxy error', 
                message: error.message,
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders,
                },
            }
        );
    }
}

// Iniciar servidor
console.log('🌉 Proxy Multi-Backend Simple');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  🔧 Config:   ${CONFIG_URL}`);
console.log(`  🌐 Proxy:    http://localhost:${PORT}`);
console.log(`  ❤️  Health:   http://localhost:${PORT}/_health`);
console.log(`  📋 Backends: http://localhost:${PORT}/_backends`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Cargar backends iniciales
await loadBackends();

if (backends.length > 0) {
    console.log(`\n📡 Backends cargados: ${backends.length}`);
    for (const backend of backends) {
        console.log(`  ✓ ${backend.name.toUpperCase().padEnd(12)} ${backend.prefix.padEnd(8)} → ${backend.url}`);
    }
} else {
    console.log('\n⚠️  No se pudieron cargar backends');
}

console.log('\n✓ Servidor corriendo\n');

// Recargar backends cada minuto
setInterval(async () => {
    await loadBackends();
}, 60000);

Deno.serve({ port: PORT }, handler);
