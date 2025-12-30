# Backend Auto-Register

Script para auto-registro de backends en el sistema de proxy.

## Uso Rápido

```bash
deno run --allow-net --allow-env register.ts \
  --name=prod \
  --url=http://10.6.46.114:3013 \
  --token=secret \
  --prefix=/prod \
  --config=https://tu-config.deno.dev/items \
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
