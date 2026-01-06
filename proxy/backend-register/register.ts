#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Backend Auto-Registration
 * 
 * Uso:
 *   deno run --allow-net --allow-env register.ts \
 *     --name=prod \
 *     --url=http://10.6.46.114:3013 \
 *     --token=secret \
 *     --prefix=/prod \
 *     --config=https://tu-config.deno.dev/items \
 *     --key=mi-clave-secreta \
 *     --daemon
 * 
 * Con IP pública automática:
 *   Agregar: --use-public-ip --port=3013
 * 
 * Parámetros opcionales:
 *   --key : Clave de encriptación personalizada (default: clave por defecto)
 */

function parseArgs(): Record<string, string> {
    const args: Record<string, string> = {};
    for (const arg of Deno.args) {
        if (arg.startsWith('--') && arg.includes('=')) {
            const [key, value] = arg.slice(2).split('=');
            args[key] = value;
        }
    }
    return args;
}

const args = parseArgs();

const CONFIG = {
    name: args.name || Deno.env.get('BACKEND_NAME') || '',
    url: args.url || Deno.env.get('BACKEND_URL') || '',
    token: args.token || Deno.env.get('BACKEND_TOKEN') || '',
    prefix: args.prefix || Deno.env.get('BACKEND_PREFIX') || '',
    configApiUrl: args.config || Deno.env.get('CONFIG_API_URL') || '',
    usePublicIP: Deno.args.includes('--use-public-ip'),
    port: args.port || Deno.env.get('PORT') || '',
};

const DAEMON_INTERVAL = 5 * 60 * 1000;
const isDaemon = Deno.args.includes('--daemon');

// Clave de encriptación (línea de comando > variable de entorno > default)
const ENCRYPTION_KEY = args.key || Deno.env.get('ENCRYPTION_KEY') || 'go-oracle-api-secure-key-2026';

interface BackendConfig {
    name: string;
    url: string;
    token: string;
    prefix: string;
    metadata?: {
        registeredAt: string;
        lastUpdate: string;
        system: { hostname: string; os: string; arch: string; denoVersion: string; publicIP: string };
    };
}

// Funciones de encriptación (exportadas para usar en proxy)
export async function encryptToken(token: string, key: string = ENCRYPTION_KEY): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    
    // Derivar clave desde la contraseña
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(ENCRYPTION_KEY),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );
    
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derivedKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        derivedKey,
        data
    );
    
    // Combinar salt + iv + datos encriptados
    const result = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encryptedData), salt.length + iv.length);
    
    // Convertir a base64
    return btoa(String.fromCharCode(...result));
}

export async function decryptToken(encryptedToken: string, key: string = ENCRYPTION_KEY): Promise<string> {
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
    
    const derivedKey = await crypto.subtle.deriveKey(
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
        derivedKey,
        data
    );
    
    return decoder.decode(decryptedData);
}

function validateConfig(): void {
    // Validar que solo se use un modo
    if (CONFIG.usePublicIP && CONFIG.url) {
        console.error('❌ Error: No puedes usar --url y --use-public-ip al mismo tiempo');
        console.error('\n📋 Elige un modo:');
        console.error('   Modo 1: --url=http://10.6.46.114:3013');
        console.error('   Modo 2: --use-public-ip --port=3013');
        Deno.exit(1);
    }
    
    const required = [
        { key: 'name', value: CONFIG.name, flag: '--name' },
        { key: 'token', value: CONFIG.token, flag: '--token' },
        { key: 'prefix', value: CONFIG.prefix, flag: '--prefix' },
        { key: 'configApiUrl', value: CONFIG.configApiUrl, flag: '--config' },
    ];
    
    // URL es requerida solo si no se usa --use-public-ip
    if (!CONFIG.usePublicIP) {
        required.push({ key: 'url', value: CONFIG.url, flag: '--url' });
    } else {
        // Con --use-public-ip, requerir --port
        required.push({ key: 'port', value: CONFIG.port, flag: '--port' });
    }
    
    const missing = required.filter(r => !r.value);
    
    if (missing.length > 0) {
        console.error(`❌ Faltan: ${missing.map(m => m.flag).join(', ')}`);
        console.error('\n💡 Ejemplo modo manual:');
        console.error('  deno run --allow-net --allow-env register.ts \\');
        console.error('    --name=prod \\');
        console.error('    --url=http://10.6.46.114:3013 \\');
        console.error('    --token=secret \\');
        console.error('    --prefix=/prod \\');
        console.error('    --config=https://tu-config.deno.dev/items \\');
        console.error('    --key=mi-clave-secreta');
        console.error('\n💡 Ejemplo modo IP pública:');
        console.error('  deno run --allow-net --allow-env register.ts \\');
        console.error('    --name=prod \\');
        console.error('    --port=3013 \\');
        console.error('    --token=secret \\');
        console.error('    --prefix=/prod \\');
        console.error('    --config=https://tu-proyecto.deno.dev/items \\');
        console.error('    --key=mi-clave-secreta');
        Deno.exit(1);
    }
}

async function getPublicIP(): Promise<string> {
    try {
        const response = await fetch('https://api.ipify.org?format=json', { 
            signal: AbortSignal.timeout(5000) 
        });
        const data = await response.json();
        return data.ip || 'unknown';
    } catch {
        return 'unknown';
    }
}

function buildPublicURL(publicIP: string, port: string): string {
    return `http://${publicIP}:${port}`;
}

async function registerBackend(): Promise<boolean> {
    try {
        const publicIP = await getPublicIP();
        const finalURL = CONFIG.usePublicIP 
            ? buildPublicURL(publicIP, CONFIG.port)
            : CONFIG.url;
        
        const systemInfo = {
            hostname: Deno.hostname?.() || 'unknown',
            os: Deno.build.os,
            arch: Deno.build.arch,
            denoVersion: Deno.version.deno,
            publicIP: publicIP,
        };
        const timestamp = new Date().toISOString();
        
        // Encriptar el token antes de guardarlo
        const encryptedToken = await encryptToken(CONFIG.token, ENCRYPTION_KEY);
        
        const backendData: BackendConfig = {
            name: CONFIG.name,
            url: finalURL,
            token: encryptedToken, // Token encriptado
            prefix: CONFIG.prefix,
            metadata: {
                registeredAt: timestamp,
                lastUpdate: timestamp,
                system: systemInfo,
            },
        };
        
        if (CONFIG.usePublicIP) {
            console.log(`🔄 Registrando "${CONFIG.name}" - IP: ${publicIP}:${CONFIG.port}`);
        } else {
            console.log(`🔄 Registrando "${CONFIG.name}" (${finalURL})`);
        }
        
        const response = await fetch(CONFIG.configApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(backendData),
        });
        
        if (response.ok) {
            console.log(`✅ Registrado (${response.status}) 🔐 Token encriptado`);
            return true;
        } else {
            console.error(`❌ Error ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ ${(error as Error).message}`);
        return false;
    }
}

async function runDaemon(): Promise<void> {
    console.log('🔁 Daemon iniciado (Ctrl+C para detener)\n');
    
    await registerBackend();
    
    Deno.addSignalListener('SIGINT', () => {
        console.log('\n👋 Deteniendo...');
        Deno.exit(0);
    });
    
    while (true) {
        await new Promise(resolve => setTimeout(resolve, DAEMON_INTERVAL));
        console.log(`\n⏰ [${new Date().toLocaleTimeString()}]`);
        await registerBackend();
    }
}

async function main(): Promise<void> {
    validateConfig();
    
    if (isDaemon) {
        await runDaemon();
    } else {
        const success = await registerBackend();
        Deno.exit(success ? 0 : 1);
    }
}

if (import.meta.main) {
    try {
        await main();
    } catch (error) {
        console.error('❌ Error fatal:', (error as Error).message);
        Deno.exit(1);
    }
}
