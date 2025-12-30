#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Backend Auto-Registration
 * 
 * Uso con variables de entorno:
 *   export BACKEND_NAME=prod
 *   deno run --allow-net --allow-env register.ts --daemon
 * 
 * Uso con argumentos:
 *   deno run --allow-net --allow-env register.ts \
 *     --name=prod \
 *     --url=http://10.6.46.114:3013 \
 *     --token=secret \
 *     --prefix=/prod \
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
};

const DAEMON_INTERVAL = 5 * 60 * 1000;
const isDaemon = Deno.args.includes('--daemon');

interface BackendConfig {
    name: string;
    url: string;
    token: string;
    prefix: string;
    metadata?: {
        registeredAt: string;
        lastUpdate: string;
        system: { hostname: string; os: string; arch: string; denoVersion: string };
    };
}

function validateConfig(): void {
    const required = [
        { key: 'name', value: CONFIG.name, flag: '--name' },
        { key: 'url', value: CONFIG.url, flag: '--url' },
        { key: 'token', value: CONFIG.token, flag: '--token' },
        { key: 'prefix', value: CONFIG.prefix, flag: '--prefix' },
        { key: 'configApiUrl', value: CONFIG.configApiUrl, flag: '--config' },
    ];
    const missing = required.filter(r => !r.value);
    
    if (missing.length > 0) {
        console.error(`❌ Faltan: ${missing.map(m => m.flag).join(', ')}`);
        console.error('\n💡 Ejemplo:');
        console.error('  deno run --allow-net --allow-env register.ts \\');
        console.error('    --name=prod \\');
        console.error('    --url=http://10.6.46.114:3013 \\');
        console.error('    --token=secret \\');
        console.error('    --prefix=/prod \\');
        console.error('    --config=https://tu-proyecto.deno.dev/items');
        Deno.exit(1);
    }
}

async function registerBackend(): Promise<boolean> {
    try {
        const systemInfo = {
            hostname: Deno.hostname?.() || 'unknown',
            os: Deno.build.os,
            arch: Deno.build.arch,
            denoVersion: Deno.version.deno,
        };
        const timestamp = new Date().toISOString();
        
        const backendData: BackendConfig = {
            name: CONFIG.name,
            url: CONFIG.url,
            token: CONFIG.token,
            prefix: CONFIG.prefix,
            metadata: {
                registeredAt: timestamp,
                lastUpdate: timestamp,
                system: systemInfo,
            },
        };
        
        console.log(`🔄 Registrando "${CONFIG.name}" (${CONFIG.url})`);
        
        const response = await fetch(CONFIG.configApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(backendData),
        });
        
        if (response.ok) {
            console.log(`✅ Registrado (${response.status})`);
            return true;
        } else {
            console.error(`❌ Error ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ ${error.message}`);
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
        console.error('❌ Error fatal:', error.message);
        Deno.exit(1);
    }
}
