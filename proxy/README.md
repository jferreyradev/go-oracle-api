# Proxy Multi-Backend

Sistema de proxy con auto-registro para múltiples backends Oracle.

## ⚡ Setup Rápido (15 min)

### 1. Servicio de Configuración

```bash
# 1. Ve a https://dash.deno.com → New Project → Playground
# 2. Copia el contenido de config-service.ts
# 3. Deploy
# 4. Guarda tu URL: https://tu-config.deno.dev
```

### 2. Deploy del Proxy

```bash
# En Deno Deploy:
# 1. New Project → Conecta repo GitHub
# 2. Entry point: proxy/proxy-deploy.ts
# 3. Variable de entorno:
#    CONFIG_API_URL=https://tu-config.deno.dev/items
```

### 3. Registrar Backends

**Windows:**
```powershell
deno run --allow-net --allow-env backend-register\register.ts `
  --name=prod `
  --url=http://10.6.46.114:3013 `
  --token=secret123 `
  --prefix=/prod `
  --config=https://tu-config.deno.dev/items `
  --daemon
```

**Linux:**
```bash
deno run --allow-net --allow-env backend-register/register.ts \
  --name=prod \
  --url=http://10.6.46.114:3013 \
  --token=secret123 \
  --prefix=/prod \
  --config=https://tu-config.deno.dev/items \
  --daemon
```

## 📁 Archivos

- **config-service.ts** - Servicio Deno KV para configuración
- **proxy-deploy.ts** - Proxy multi-backend (producción)
- **proxy.ts** - Proxy simple (desarrollo local)
- **backend-register/** - Scripts de auto-registro

## 🔑 Endpoints

```bash
# Autenticación
POST /login                    # Obtener token (admin/admin123)
GET  /_proxy/config            # Ver backends registrados
GET  /_proxy/reload            # Recargar configuración

# API (requiere token del login)
GET  /prod/api/procedures      # Rutea a backend "prod"
POST /staging/api/execute      # Rutea a backend "staging"
```

## 🧪 Testing

```bash
# Ver backends
curl https://tu-proxy.deno.dev/_proxy/config

# Login
curl -X POST https://tu-proxy.deno.dev/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Usar API (con token del login)
curl https://tu-proxy.deno.dev/prod/api/procedures \
  -H "Authorization: Bearer <token>"
```

## 💻 Desarrollo Local

```bash
# Proxy simple
deno run --allow-net --allow-env proxy.ts

# Con parámetros
deno run --allow-net --allow-env proxy.ts \
  --port 8080 \
  --api http://localhost:3013 \
  --token test1 \
  --no-auth
```

## 🏗️ Arquitectura

```
Cliente → Proxy (Deno Deploy) → Backends
          ↑                      ↓
    Config Service ← ← ← register.ts
    (Deno KV)         (cada backend)
```

## 📖 Documentación Adicional

- **[backend-register/README.md](backend-register/README.md)** - Auto-registro de backends
- **[docs/DENO_KV_BACKENDS.md](docs/DENO_KV_BACKENDS.md)** - Gestión manual de backends
- **[docs/AUTH.md](docs/AUTH.md)** - Sistema de autenticación
- **[docs/FRONTEND.md](docs/FRONTEND.md)** - Frontend web testing

## 👥 Usuarios

| Usuario | Password | Rol |
|---------|----------|-----|
| admin   | admin123 | admin |
| user    | user123  | user |
| demo    | demo     | readonly |

## 🔧 Servicios Persistentes

**Windows Task Scheduler:**
```powershell
$action = New-ScheduledTaskAction -Execute "D:\ruta\register-prod.bat"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "Backend-Register" -Action $action -Trigger $trigger
```

**Linux systemd:**
```ini
# /etc/systemd/system/backend-register.service
[Service]
ExecStart=/usr/local/bin/deno run --allow-net --allow-env \
  /ruta/register.ts --name=prod --url=http://... --token=... --prefix=/prod \
  --config=https://tu-config.deno.dev/items --daemon
Restart=always
```

## ⚠️ Troubleshooting

```bash
# Backend no aparece
curl https://tu-config.deno.dev/items

# Forzar recarga
curl https://tu-proxy.deno.dev/_proxy/reload

# Ver logs
# Deno Deploy → Tu proyecto → Logs
```
