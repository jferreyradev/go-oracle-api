# Backend Auto-Register

Script para auto-registro de backends en el sistema de proxy.

## Uso Rápido

```bash
# Con URL manual
deno run --allow-net --allow-env register.ts \
  --name=prod \
  --url=http://10.6.46.114:3013 \
  --token=secret \
  --prefix=/prod \
  --config=https://tu-config.deno.dev/items \
  --daemon

# Con IP pública automática (reemplaza IPs privadas)
deno run --allow-net --allow-env register.ts \
  --name=prod \
  --url=http://10.6.46.114:3013 \
  --token=secret \
  --prefix=/prod \
  --config=https://tu-config.deno.dev/items \
  --use-public-ip \
  --daemon
```

## Parámetros

| Parámetro | Variable | Descripción |
|-----------|----------|-------------|
| `--name` | `BACKEND_NAME` | Nombre único del backend |
| `--url` | `BACKEND_URL` | URL del backend |
| `--token` | `BACKEND_TOKEN` | Token de autorización |
| `--prefix` | `BACKEND_PREFIX` | Prefijo de ruta (ej: /prod) |
| `--config` | `CONFIG_API_URL` | URL del servicio config (REQUERIDO) |
| `--use-public-ip` | - | Usar IP pública en vez de IP privada/local |
| `--daemon` | - | Modo daemon (re-registro cada 5 min) |

## Variables de Entorno

```bash
# .env
BACKEND_NAME=prod
BACKEND_URL=http://10.6.46.114:3013
BACKEND_TOKEN=secret
BACKEND_PREFIX=/prod
CONFIG_API_URL=https://tu-config.deno.dev/items

# Ejecutar
deno run --allow-net --allow-env register.ts --daemon
```

## IP Pública Automática

Con `--use-public-ip`, el script detecta tu IP pública y reemplaza IPs privadas:
- `localhost`, `127.0.0.1` → `203.0.113.45:3013`
- `10.x.x.x`, `192.168.x.x`, `172.16-31.x.x` → Tu IP pública
- IPs públicas y dominios no se modifican

```bash
# Local: http://10.6.46.114:3013
# Registra: http://203.0.113.45:3013
```

## Servicios Persistentes

**Windows (.bat):**
```batch
@echo off
deno run --allow-net --allow-env ^
  D:\ruta\register.ts ^
  --name=prod --url=http://10.6.46.114:3013 ^
  --token=secret --prefix=/prod ^
  --config=https://tu-config.deno.dev/items ^
  --daemon
```

**Linux (systemd):**
```ini
[Service]
ExecStart=/usr/local/bin/deno run --allow-net --allow-env \
  /ruta/register.ts \
  --name=prod --url=http://10.6.46.114:3013 \
  --token=secret --prefix=/prod \
  --config=https://tu-config.deno.dev/items \
  --daemon
Restart=always
```
