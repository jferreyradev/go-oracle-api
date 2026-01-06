#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Proxy Server para go-oracle-api
 * 
 * Características:
 * - Reenvía requests a múltiples backends (routing por prefijo)
 * - Agrega automáticamente el token de autorización por backend
 * - Logging de todas las requests
 * - CORS automático
 * - Rate limiting opcional
 * - Compatible con Deno Deploy
 * - Desencriptación automática de tokens AES-256-GCM
 * 
 * Uso:
 *   deno run --allow-net --allow-env proxy-deploy.ts
 * 
 * Variables de entorno:
 *   CONFIG_API_URL   URL del endpoint con configuración de backends (REQUERIDO)
 *   CACHE_TTL        Tiempo de cache en segundos (default: 60)
 *   DISABLE_AUTH     Deshabilitar autenticación del proxy (default: false)
 *   ENCRYPTION_KEY   Clave para desencriptar tokens (debe coincidir con register.ts)
 * 
 * Formato esperado del endpoint:
 *   [
 *     {
 *       "name": "prod",
 *       "url": "http://10.6.46.114:3013",
 *       "token": "token-encriptado-base64",
 *       "prefix": "/prod"
 *     },
 *     ...
 *   ]
 * 
 * Fallback con variables de entorno (si endpoint falla):
 *   BACKEND_<NAME>_URL      URL del backend
 *   BACKEND_<NAME>_TOKEN    Token del backend
 *   BACKEND_<NAME>_PREFIX   Prefijo de path
 * 
 * Fallback simple (si no hay ninguno):
 *   API_URL         URL del backend default
 *   API_TOKEN       Token del backend default
 * 
 * Uso con prefijos:
 *   POST /prod/execute     → http://10.6.46.114:3013/execute
 *   POST /staging/execute  → http://10.6.150.91:3000/execute
 *   POST /dev/execute      → http://localhost:3013/execute
 */

// Clave de encriptación (debe ser la misma que en register.ts)
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || 'go-oracle-api-secure-key-2026';

// Función para desencriptar tokens AES-256-GCM
async function decryptToken(encryptedToken: string): Promise<string> {
    try {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        
        // Decodificar desde base64
        const encrypted = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
        
        // Extraer salt, iv y datos
        const salt = encrypted.slice(0, 16);
        const iv = encrypted.slice(16, 28);
        const data = encrypted.slice(28);
        
        // Derivar clave
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(ENCRYPTION_KEY),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );
        
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
        
        // Desencriptar
        const decryptedData = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            data
        );
        
        return decoder.decode(decryptedData);
    } catch (error) {
        console.error('❌ Error desencriptando token:', error.message);
        // Si falla la desencriptación, asumir que el token no está encriptado
        return encryptedToken;
    }
}

// Configuración de backend
interface BackendConfig {
    name: string;
    url: string;
    token: string;
    prefix: string;
}

// Configuración
const BACKENDS_URL = Deno.env.get('CONFIG_API_URL') || '';
const CACHE_TTL = parseInt(Deno.env.get('CACHE_TTL') || '60') * 1000; // Convertir a ms

// Cache de backends
let backendsCache: BackendConfig[] = [];
let lastCacheUpdate = 0;
let isFetchingBackends = false;

// Cargar backends desde endpoint HTTP
async function fetchBackendsFromAPI(): Promise<BackendConfig[]> {
    try {
        // Validar que CONFIG_API_URL esté configurada
        if (!BACKENDS_URL) {
            console.warn('⚠️  CONFIG_API_URL no está configurada. Use variables de entorno o fallback.');
            return [];
        }

        console.log(`🔄 Cargando backends desde ${BACKENDS_URL}...`);
        const response = await fetch(BACKENDS_URL);
        
        if (!response.ok) {
            console.error(`❌ Error fetching backends: ${response.status} ${response.statusText}`);
            return [];
        }
        
        const data = await response.json();
        const backends: BackendConfig[] = [];
        
        // Procesar los items del endpoint
        if (Array.isArray(data)) {
            for (const item of data) {
                if (item.name && item.url && item.token) {
                    // Desencriptar el token
                    const decryptedToken = await decryptToken(item.token);
                    
                    backends.push({
                        name: item.name.toLowerCase(),
                        url: item.url.replace(/\/$/, ''),
                        token: decryptedToken, // Token desencriptado
                        prefix: item.prefix ? (item.prefix.startsWith('/') ? item.prefix : `/${item.prefix}`) : `/${item.name}`,
                    });
                }
            }
        }
        
        console.log(`✓ ${backends.length} backends cargados desde API`);
        return backends;
    } catch (error) {
        console.error('❌ Error cargando backends desde API:', error.message);
        return [];
    }
}

// Cargar backends desde variables de entorno (fallback)
function loadBackendsFromEnv(): BackendConfig[] {
    const backends: BackendConfig[] = [];
    const envVars = Deno.env.toObject();
    const backendNames = new Set<string>();
    
    // Buscar todas las variables BACKEND_*_URL
    for (const key in envVars) {
        const match = key.match(/^BACKEND_([A-Z0-9_]+)_URL$/);
        if (match) {
            backendNames.add(match[1]);
        }
    }
    
    // Cargar configuración de cada backend
    for (const name of backendNames) {
        const url = Deno.env.get(`BACKEND_${name}_URL`);
        const token = Deno.env.get(`BACKEND_${name}_TOKEN`);
        const prefix = Deno.env.get(`BACKEND_${name}_PREFIX`);
        
        if (url && token && prefix) {
            backends.push({
                name: name.toLowerCase(),
                url: url.replace(/\/$/, ''),
                token,
                prefix: prefix.startsWith('/') ? prefix : `/${prefix}`,
            });
        }
    }
    
    // Si no hay backends configurados, usar la configuración simple
    if (backends.length === 0) {
        const defaultUrl = Deno.env.get('API_URL');
        const defaultToken = Deno.env.get('API_TOKEN');
        
        if (defaultUrl && defaultToken) {
            backends.push({
                name: 'default',
                url: defaultUrl.replace(/\/$/, ''),
                token: defaultToken,
                prefix: '',
            });
        }
    }
    
    return backends;
}

// Cargar backends con cache y fallback
async function loadBackends(): Promise<BackendConfig[]> {
    const now = Date.now();
    
    // Usar cache si está fresco
    if (backendsCache.length > 0 && (now - lastCacheUpdate) < CACHE_TTL) {
        return backendsCache;
    }
    
    // Evitar múltiples fetch simultáneos
    if (isFetchingBackends) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return backendsCache.length > 0 ? backendsCache : [];
    }
    
    isFetchingBackends = true;
    
    try {
        // Intentar cargar desde API
        let backends = await fetchBackendsFromAPI();
        
        // Si falla, intentar desde variables de entorno
        if (backends.length === 0) {
            console.log('⚠️  API no disponible, usando variables de entorno...');
            backends = loadBackendsFromEnv();
        }
        
        if (backends.length > 0) {
            backendsCache = backends;
            lastCacheUpdate = now;
        }
        
        return backends.length > 0 ? backends : backendsCache;
    } finally {
        isFetchingBackends = false;
    }
}

// Encontrar backend según el path
function findBackend(path: string, backends: BackendConfig[]): { backend: BackendConfig; cleanPath: string } | null {
    // Buscar backend que coincida con el prefijo
    for (const backend of backends) {
        if (backend.prefix && path.startsWith(backend.prefix)) {
            // Eliminar el prefijo del path
            const cleanPath = path.substring(backend.prefix.length) || '/';
            return { backend, cleanPath };
        }
    }
    
    // Si no hay coincidencia, usar el backend default (sin prefijo)
    const defaultBackend = backends.find(b => b.prefix === '');
    if (defaultBackend) {
        return { backend: defaultBackend, cleanPath: path };
    }
    
    return null;
}

const DISABLE_AUTH = Deno.env.get('DISABLE_AUTH') === 'true';

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

// Sesiones activas (nota: se pierden en Deploy redeploys, considera usar Deno KV)
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
    
    // Cargar backends (usa cache si está disponible)
    const backends = await loadBackends();
    
    // Extraer info de la request
    const url = new URL(req.url);
    const path = url.pathname + url.search;
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    
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
    
    // Validar autenticación (excepto para /login y /_proxy/*, o si está deshabilitada)
    if (!DISABLE_AUTH && !path.startsWith('/_proxy/') && path !== '/login') {
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
        // Encontrar backend apropiado según el path
        const backendMatch = findBackend(path, backends);
        
        if (!backendMatch) {
            stats.errorRequests++;
            const duration = Date.now() - startTime;
            logRequest(req.method, path, 404, duration);
            
            return new Response(JSON.stringify({ 
                error: 'Backend not found',
                message: 'No se encontró un backend para este path',
                availablePrefixes: backends.map(b => b.prefix || '(default)'),
                hint: 'Use GET /_proxy/backends para ver los backends disponibles'
            }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
        
        const { backend, cleanPath } = backendMatch;
        
        // Construir URL del backend con el path limpio
        const backendUrl = `${backend.url}${cleanPath}`;
        
        // Copiar headers y agregar autorización del backend específico
        const headers = new Headers(req.headers);
        headers.set('Authorization', `Bearer ${backend.token}`);
        headers.set('X-Proxy-Backend', backend.name);
        
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
        responseHeaders.set('X-Proxy-Backend', backend.name);
        
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
    
    // Manejar CORS preflight para todos los endpoints
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
    
    // Endpoint de health check
    if (url.pathname === '/_proxy/health' && req.method === 'GET') {
        const backends = await loadBackends();
        return new Response(JSON.stringify({ 
            status: 'ok',
            timestamp: new Date().toISOString(),
            backendsSource: BACKENDS_URL,
            cacheTTL: `${CACHE_TTL / 1000}s`,
            lastUpdate: lastCacheUpdate > 0 ? new Date(lastCacheUpdate).toISOString() : 'never',
            backends: backends.map(b => ({
                name: b.name,
                url: b.url,
                prefix: b.prefix || '(default)',
            })),
            totalBackends: backends.length,
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
    
    // Endpoint para listar backends disponibles
    if (url.pathname === '/_proxy/backends' && req.method === 'GET') {
        const backends = await loadBackends();
        return new Response(JSON.stringify({ 
            source: BACKENDS_URL,
            cacheTTL: `${CACHE_TTL / 1000}s`,
            lastUpdate: lastCacheUpdate > 0 ? new Date(lastCacheUpdate).toISOString() : 'never',
            backends: backends.map(b => ({
                name: b.name,
                url: b.url,
                prefix: b.prefix || '(default)',
                example: b.prefix ? `${b.prefix}/execute` : '/execute',
            })),
            totalBackends: backends.length,
            note: 'Los backends se cargan desde el endpoint configurado y se actualizan automáticamente',
        }, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
    
    // Endpoint de configuración
    if (url.pathname === '/_proxy/config' && req.method === 'GET') {
        return new Response(JSON.stringify({ 
            backendsEndpoint: BACKENDS_URL,
            cacheTTL: CACHE_TTL / 1000,
        }, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
    
    // Endpoint para recargar backends
    if (url.pathname === '/_proxy/reload' && req.method === 'POST') {
        lastCacheUpdate = 0;
        backendsCache = [];
        const backends = await loadBackends();
        
        return new Response(JSON.stringify({ 
            success: true,
            totalBackends: backends.length,
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
    
    return handleRequest(req);
}

console.log('\x1b[1m\x1b[36m🔗 Proxy Multi-Backend (Deno Deploy)\x1b[0m');
console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
console.log(`  🌐 Backends URL: ${BACKENDS_URL}`);
console.log(`  ⏱️  Cache TTL: ${CACHE_TTL / 1000}s`);

// Cargar backends al inicio
const initialBackends = await loadBackends();
console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
console.log(`  📡 Backends cargados: ${initialBackends.length}`);

if (initialBackends.length === 0) {
    console.log(`  ⚠️  \x1b[33mNo se pudieron cargar backends\x1b[0m`);
    console.log(`  ℹ️  Verifique la URL del endpoint o configure variables de entorno`);
} else {
    console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
    for (const backend of initialBackends) {
        const prefixDisplay = backend.prefix || '(default)';
        const tokenDisplay = backend.token.substring(0, 4) + '***';
        const statusIcon = '✓';
        console.log(`  ${statusIcon} ${backend.name.toUpperCase().padEnd(10)} → ${backend.url}`);
        console.log(`     Prefix: ${prefixDisplay}`);
        console.log(`     Token:  ${tokenDisplay}`);
        if (backend.prefix) {
            console.log(`     Ejemplo: ${backend.prefix}/execute`);
        }
        console.log(`\x1b[90m  ────────────────────────────────────────\x1b[0m`);
    }
}

console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
console.log(`  📊 Endpoints proxy:`);
console.log(`     GET  /_proxy/backends  - Listar backends`);
console.log(`     POST /_proxy/reload    - Recargar backends`);
console.log(`     GET  /_proxy/health    - Health check`);
console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);

if (DISABLE_AUTH) {
    console.log(`  ⚠️  \x1b[33mAutenticación DESHABILITADA (modo pruebas)\x1b[0m`);
    console.log(`  ℹ️  Todas las peticiones son permitidas sin token`);
} else {
    console.log(`  🔐 Autenticación habilitada`);
    console.log(`  POST /login             - Obtener token`);
    console.log(`  POST /logout            - Cerrar sesión`);
    console.log(`  GET  /_proxy/users      - Ver usuarios disponibles`);
    console.log(`  GET  /_proxy/stats      - Ver estadísticas`);
    console.log(`  GET  /_proxy/backends   - Ver backends disponibles`);
    console.log(`  GET  /_proxy/health     - Health check`);
    console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
    console.log(`  👥 Usuarios: admin, user, demo`);
    console.log(`  ⏱️  Duración sesión: 24h`);
    console.log(`  ⌛ Inactividad máxima: 2h`);
}

console.log(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
console.log(`\x1b[32m✓ Servidor escuchando (Deno Deploy compatible)\x1b[0m\n`);

// Actualización periódica en background (cada 5 minutos)
setInterval(async () => {
    console.log('🔄 Actualizando backends en background...');
    lastCacheUpdate = 0;
    await loadBackends();
}, 5 * 60 * 1000);

// Para Deno Deploy: no especificar puerto
Deno.serve(handler);
