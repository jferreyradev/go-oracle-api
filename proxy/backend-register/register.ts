#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Backend Auto-Registration (Versión Standalone)
 * 
 * Uso:
 *   deno run -A register-standalone.ts \
 *     --name=prod \
 *     --url=http://10.6.46.114:3013 \
 *     --token=secret \
 *     --prefix=/prod \
 *     --config=https://tu-config.deno.dev/items \
 *     --daemon
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

// Funciones de encriptación
async function encryptToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    
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
    
    const result = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encryptedData), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...result));
}

function validateConfig(): void {
    if (CONFIG.usePublicIP && CONFIG.url) {
        console.error('❌ Error: No puedes usar --url y --use-public-ip al mismo tiempo');
        Deno.exit(1);
    }
    
    const required = [
        { key: 'name', value: CONFIG.name, flag: '--name' },
        { key: 'token', value: CONFIG.token, flag: '--token' },
        { key: 'prefix', value: CONFIG.prefix, flag: '--prefix' },
        { key: 'configApiUrl', value: CONFIG.configApiUrl, flag: '--config' },
    ];
    
    if (!CONFIG.usePublicIP) {
        required.push({ key: 'url', value: CONFIG.url, flag: '--url' });
    } else {
        required.push({ key: 'port', value: CONFIG.port, flag: '--port' });
    }
    
    const missing = required.filter(r => !r.value);
    
    if (missing.length > 0) {
        console.error(`❌ Faltan: ${missing.map(m => m.flag).join(', ')}`);
        console.error('\n💡 Ejemplo:');
        console.error('  deno run -A register-standalone.ts \\');
        console.error('    --name=desarrollo \\');
        console.error('    --url=http://localhost:3000 \\');
        console.error('    --token=token123 \\');
        console.error('    --prefix=/desa \\');
        console.error('    --config=https://backends-proliq.deno.dev/items');
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
        
        const encryptedToken = await encryptToken(CONFIG.token);
        
        const backendData: BackendConfig = {
            name: CONFIG.name,
            url: finalURL,
            token: encryptedToken,
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
            console.log(`🔄 Registrando "${CONFIG.name}" - URL: ${CONFIG.url}`);
        }
        
        console.log(`   Prefix: ${CONFIG.prefix}`);
        console.log(`   Token: ${CONFIG.token.substring(0, 4)}***`);
        console.log(`   Config API: ${CONFIG.configApiUrl}`);
        
        const response = await fetch(CONFIG.configApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(backendData),
        });
        
        if (!response.ok) {
            console.error(`❌ Error registrando: ${response.status} ${response.statusText}`);
            const error = await response.text();
            console.error('Respuesta:', error);
            return false;
        }
        
        const result = await response.json();
        console.log(`✅ Backend registrado exitosamente`);
        console.log(`\n📋 Detalles:`);
        console.log(`   Nombre: ${backendData.name}`);
        console.log(`   URL: ${backendData.url}`);
        console.log(`   Prefix: ${backendData.prefix}`);
        console.log(`   Registrado: ${timestamp}`);
        
        return true;
    } catch (error) {
        console.error('❌ Error:', error.message);
        return false;
    }
}

async function main() {
    console.log('\x1b[1m\x1b[36m📝 Backend Registration\x1b[0m\n');
    
    validateConfig();
    
    if (isDaemon) {
        console.log(`⏰ Modo daemon activado (cada ${DAEMON_INTERVAL / 1000 / 60} minutos)\n`);
        
        while (true) {
            const success = await registerBackend();
            if (success) {
                console.log(`\n⏳ Próximo intento en ${DAEMON_INTERVAL / 1000 / 60} minutos...\n`);
            } else {
                console.log(`\n⏳ Reintentando en ${DAEMON_INTERVAL / 1000 / 60} minutos...\n`);
            }
            await new Promise(resolve => setTimeout(resolve, DAEMON_INTERVAL));
        }
    } else {
        const success = await registerBackend();
        Deno.exit(success ? 0 : 1);
    }
}

main();
