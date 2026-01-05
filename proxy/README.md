# Proxy Multi-Backend para go-oracle-api

Sistema de proxy con auto-registro, multi-backend y encriptación AES-256.

## 📋 Índice

- [Setup Rápido (15 min)](#-setup-rápido-15-min)
- [Archivos](#-archivos)
- [Uso Local](#-uso-local)
- [Producción (Deno Deploy)](#-producción-deno-deploy)
- [Autenticación](#-autenticación)
- [Gestión de Backends](#-gestión-de-backends)
- [Seguridad](#-seguridad)
- [Troubleshooting](#️-troubleshooting)

---

---

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
# 3. Variables de entorno:
#    CONFIG_API_URL=https://tu-config.deno.dev/items
#    ENCRYPTION_KEY=mi-clave-secreta-2026  (debe coincidir con register.ts)
```

### 3. Registrar Backends

**Windows:**
```powershell
# URL manual
deno run --allow-net --allow-env backend-register\register.ts `
  --name=prod `
  --url=http://10.6.46.114:3013 `
  --token=secret123 `
  --prefix=/prod `
  --config=https://tu-config.deno.dev/items `
  --key=mi-clave-secreta `
  --daemon

# IP pública automática (agrega --use-public-ip)
deno run --allow-net --allow-env backend-register\register.ts `
  --name=prod `
  --url=http://10.6.46.114:3013 `
  --token=secret123 `
  --prefix=/prod `
  --config=https://tu-config.deno.dev/items `
  --key=mi-clave-secreta `
  --use-public-ip `
  --daemon
```

**Linux:**
```bash
# URL manual
deno run --allow-net --allow-env backend-register/register.ts \
  --name=prod \
  --url=http://10.6.46.114:3013 \
  --token=secret123 \
  --prefix=/prod \
  --config=https://tu-config.deno.dev/items \
  --key=mi-clave-secreta \
  --daemon

# IP pública automática (agrega --use-public-ip)
deno run --allow-net --allow-env backend-register/register.ts \
  --name=prod \
  --url=http://10.6.46.114:3013 \
  --token=secret123 \
  --prefix=/prod \
  --config=https://tu-config.deno.dev/items \
  --key=mi-clave-secreta \
  --use-public-ip \
  --daemon
```

---

## 📁 Archivos

- **config-service.ts** - Servicio Deno KV para configuración
- **proxy-deploy.ts** - Proxy multi-backend con desencriptación AES-256 (local y producción)
- **backend-register/** - Scripts de auto-registro con encriptación
- **EJEMPLO_DESENCRIPTACION.md** - Guía completa de encriptación/desencriptación

---

## 🔑 Autenticación

### Usuarios por Defecto

| Usuario | Password | Rol | Permisos |
|---------|----------|-----|----------|
| admin   | admin123 | admin | Completo |
| user    | user123  | user | Completo |
| demo    | demo     | readonly | Solo GET |

### Endpoints de Autenticación

```bash
# 1. Login
POST /login
{
  "username": "admin",
  "password": "admin123"
}

# Respuesta:
{
  "success": true,
  "token": "abc123...",
  "expiresIn": 86400  # 24 horas
}

# 2. Usar el token
curl https://tu-proxy.deno.dev/prod/api/procedures \
  -H "Authorization: Bearer <token>"

# 3. Logout
POST /logout
Authorization: Bearer <token>

# 4. Ver backends registrados
GET /_proxy/config
Authorization: Bearer <token>

# 5. Recargar configuración
GET /_proxy/reload
Authorization: Bearer <token>
```

### Deshabilitar Autenticación (solo desarrollo)

```bash
export DISABLE_AUTH=true
deno run --allow-net --allow-env proxy-deploy.ts
```

---

## 💾 Gestión de Backends

### Auto-Registro (Recomendado)

Ver [backend-register/README.md](backend-register/README.md)

### Manual (API KV)

```bash
# Crear/Actualizar
curl -X POST https://tu-config.deno.dev/items \
  -H "Content-Type: application/json" \
  -d '{
    "name": "prod",
    "url": "http://10.6.46.114:3013",
    "token": "token-encriptado-base64",
    "prefix": "/prod"
  }'

# Listar
curl https://tu-config.deno.dev/items

# Obtener específico
curl https://tu-config.deno.dev/items/prod

# Eliminar
curl -X DELETE https://tu-config.deno.dev/items/prod
```

### Variables de Entorno (Fallback)

```bash
# Backend único
export API_URL="http://localhost:3013"
export API_TOKEN="test1"

# Múltiples backends
export BACKEND_PROD_URL="http://10.6.46.114:3013"
export BACKEND_PROD_TOKEN="token-prod"
export BACKEND_PROD_PREFIX="/prod"

export BACKEND_DEV_URL="http://localhost:3013"
export BACKEND_DEV_TOKEN="test1"
export BACKEND_DEV_PREFIX="/dev"
```

---

## 🔐 Seguridad

### Encriptación de Tokens

Los tokens se almacenan encriptados con **AES-256-GCM**.

**Configuración:**
```bash
# Al registrar backend
--key=mi-clave-secreta-2026

# En el proxy
ENCRYPTION_KEY=mi-clave-secreta-2026
```

⚠️ **La clave debe ser idéntica en ambos lados.**

Ver guía completa: [EJEMPLO_DESENCRIPTACION.md](EJEMPLO_DESENCRIPTACION.md)

### Buenas Prácticas

1. **Usar variables de entorno** para claves sensibles
2. **Rotar tokens** periódicamente
3. **Monitorear logs** del proxy
4. **Limitar acceso** a usuarios necesarios
5. **Usar HTTPS** en producción

---

## 🧪 Testing

### Frontend Web

Abrir `frontend/index.html` en el navegador para interfaz de pruebas.

**Funciones:**
- Login con usuarios configurados
- Endpoints preconfigurados
- Custom requests
- Ver respuestas en tiempo real

### API Manual

```bash
# Login
curl -X POST https://tu-proxy.deno.dev/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Usar API (guarda el token del login)
curl https://tu-proxy.deno.dev/prod/api/procedures \
  -H "Authorization: Bearer <token>"
```

---

## 🚀 Producción (Deno Deploy)

### Deploy

1. **New Project** en https://dash.deno.com
2. **Entry point:** `proxy/proxy-deploy.ts`
3. **Variables de entorno:**
   ```
   CONFIG_API_URL=https://tu-config.deno.dev/items
   ENCRYPTION_KEY=tu-clave-secreta-2026
   CACHE_TTL=60
   ```

### Monitoreo

```bash
# Ver logs
# Dashboard → Tu proyecto → Logs

# Ver backends activos
curl https://tu-proxy.deno.dev/_proxy/config \
  -H "Authorization: Bearer <token>"

# Forzar recarga
curl https://tu-proxy.deno.dev/_proxy/reload \
  -H "Authorization: Bearer <token>"
```

---

## 💻 Uso Local

### Backend Único (Simple)

```bash
export API_URL="http://localhost:3013"
export API_TOKEN="test1"
export DISABLE_AUTH="true"
deno run --allow-net --allow-env proxy-deploy.ts
```

### Múltiples Backends

```bash
export BACKEND_PROD_URL="http://10.6.46.114:3013"
export BACKEND_PROD_TOKEN="token-prod"
export BACKEND_PROD_PREFIX="/prod"

export BACKEND_DEV_URL="http://localhost:3013"
export BACKEND_DEV_TOKEN="test1"
export BACKEND_DEV_PREFIX="/dev"

deno run --allow-net --allow-env proxy-deploy.ts
```

### Con Deno KV (Producción local)

```bash
export CONFIG_API_URL="https://tu-config.deno.dev/items"
export ENCRYPTION_KEY="tu-clave-secreta-2026"
deno run --allow-net --allow-env proxy-deploy.ts
```

---

## 🏗️ Arquitectura

```
Cliente
  ↓
Proxy (proxy-deploy.ts)
  ↓ (routing por prefijo)
  ├─→ /prod → Backend Prod (10.6.46.114:3013)
  ├─→ /staging → Backend Staging (10.6.150.91:3000)
  └─→ /dev → Backend Dev (localhost:3013)
  
Config Service (Deno KV)
  ↑
register.ts (auto-registro desde cada backend)
```

**Flujo de Token:**
1. `register.ts` encripta token → guarda en KV
2. `proxy-deploy.ts` lee de KV → desencripta → usa

---

## ⚠️ Troubleshooting

### Backend no aparece

```bash
# Verificar KV
curl https://tu-config.deno.dev/items

# Forzar recarga
curl https://tu-proxy.deno.dev/_proxy/reload \
  -H "Authorization: Bearer <token>"
```

### Error de desencriptación

- Verificar que `ENCRYPTION_KEY` sea la misma en register y proxy
- Re-registrar backend con clave correcta

### Token inválido

- Token expira después de 24 horas
- Hacer login nuevamente: `POST /login`

### 401 Unauthorized

- Verificar token en header: `Authorization: Bearer <token>`
- Hacer login si el token expiró

### Proxy no encuentra backend

- Verificar prefijo en la URL: `/prod/api/...`
- Confirmar que el backend esté registrado
- Revisar logs en Deno Deploy

---

## 📚 Documentación Adicional

- **[backend-register/README.md](backend-register/README.md)** - Auto-registro detallado
- **[EJEMPLO_DESENCRIPTACION.md](EJEMPLO_DESENCRIPTACION.md)** - Encriptación de tokens

---

## 👥 Usuarios

Usuarios configurados por defecto (puedes modificarlos en [proxy-deploy.ts](proxy-deploy.ts)):

| Usuario | Password | Rol |
|---------|----------|-----|
| admin   | admin123 | admin |
| user    | user123  | user |
| demo    | demo     | readonly |

---

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

---

*Última actualización: Enero 2026*
