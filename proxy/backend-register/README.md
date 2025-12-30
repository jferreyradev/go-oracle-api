# Backend Auto-Register

Script para auto-registro de backends en el sistema de proxy.

## Uso Rápido

**Con URL manual (backend accesible directamente):**
```bash
deno run --allow-net --allow-env register.ts \
  --name=prod \
  --url=http://10.6.46.114:3013 \
  --token=secret \
  --prefix=/prod \
  --config=https://tu-config.deno.dev/items \
  --daemon
```

**Con IP pública (backend detrás de NAT/firewall):**
```bash
deno run --allow-net --allow-env register.ts \
  --name=prod \
  --port=3013 \
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
| `--url` | `BACKEND_URL` | URL del backend (requerido sin --use-public-ip) |
| `--port` | `PORT` | Puerto (requerido con --use-public-ip) |
| `--token` | `BACKEND_TOKEN` | Token de autorización |
| `--prefix` | `BACKEND_PREFIX` | Prefijo de ruta (ej: /prod) |
| `--config` | `CONFIG_API_URL` | URL del servicio config (REQUERIDO) |
| `--use-public-ip` | - | Usar IP pública detectada automáticamente |
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

Con `--use-public-ip`, el script detecta automáticamente tu IP pública.

**¿Cuándo usar?**
- Backend detrás de NAT/router
- Acceso desde internet requiere IP pública
- No tienes dominio configurado

**Ejemplo:**
```bash
# Especificas solo el puerto
--port=3013 --use-public-ip

# Registra automáticamente:
http://203.0.113.45:3013
```

**Sin `--use-public-ip`:**
Usa `--url` con la dirección exacta (IP privada, localhost o dominio).

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
