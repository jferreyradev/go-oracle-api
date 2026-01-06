# Deploy del Simple Proxy con Autenticación

Proxy multi-backend con sistema de login y tokens de sesión, compatible con Deno Deploy.

## 🚀 Características

- ✅ Multi-backend con selección por prefijo de ruta
- ✅ Sistema de login con tokens Bearer
- ✅ Sesiones de 24 horas con limpieza automática
- ✅ Configuración dinámica de backends desde API
- ✅ CORS habilitado
- ✅ Endpoints públicos (health, info, backends)
- ✅ 100% compatible con Deno Deploy

## 📦 Deploy en Deno Deploy

### Opción 1: Desde el Dashboard

1. Ve a https://dash.deno.com
2. Click en **"New Project"**
3. Conecta tu repositorio de GitHub/GitLab
4. Selecciona el archivo: `proxy/simple-proxy.ts`
5. Configura las variables de entorno (ver abajo)
6. Click en **"Deploy"**

### Opción 2: Con deployctl (CLI)

```bash
# Instalar deployctl
deno install -A --unstable-kv jsr:@deno/deployctl

# Deploy del proyecto
deployctl deploy \
  --project=mi-proxy \
  --env=CONFIG_URL=https://backends-proliq.deno.dev/items \
  --env=CONFIG_TOKEN=desarrollotoken \
  --env=PROXY_USERS=admin:admin123,user:password \
  proxy/simple-proxy.ts
```

## ⚙️ Variables de Entorno

### Requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `CONFIG_URL` | URL del endpoint que devuelve la lista de backends | `https://backends-proliq.deno.dev/items` |
| `CONFIG_TOKEN` | Token Bearer para autenticar con el config service | `desarrollotoken` |

### Opcionales

| Variable | Descripción | Default | Ejemplo |
|----------|-------------|---------|---------|
| `PROXY_USERS` | Usuarios del proxy formato "user1:pass1,user2:pass2" | `admin:admin123` | `admin:secreto,user:clave123,api:token456` |
| `PORT` | Puerto del servidor (solo local) | `8000` | `9100` |
| `DISABLE_AUTH` | Deshabilitar autenticación | `false` | `true` |

### Configuración en Deno Deploy

En el dashboard de tu proyecto:

1. Ve a **Settings** → **Environment Variables**
2. Agrega las siguientes variables:

```
CONFIG_URL = https://backends-proliq.deno.dev/items
CONFIG_TOKEN = desarrollotoken
PROXY_USERS = admin:MiClaveSegura123,usuario1:Clave456,api:TokenAPI789
```

⚠️ **IMPORTANTE:** En producción, usa contraseñas seguras y diferentes para cada usuario.

## 🔐 Sistema de Autenticación

### Flujo de Login

1. **POST /login** - Obtener token
```bash
curl -X POST https://tu-proxy.deno.dev/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Respuesta:
```json
{
  "success": true,
  "token": "91d27831269dc954d300...",
  "expiresIn": 86400000,
  "user": {
    "username": "admin"
  }
}
```

2. **Usar el token** en requests
```bash
curl https://tu-proxy.deno.dev/desa/api/procedures \
  -H "Authorization: Bearer 91d27831269dc954d300..."
```

3. **POST /logout** - Cerrar sesión
```bash
curl -X POST https://tu-proxy.deno.dev/logout \
  -H "Authorization: Bearer 91d27831269dc954d300..."
```

### Endpoints Públicos (sin autenticación)

- `GET /_health` - Health check
- `GET /_info` - Información del sistema
- `GET /_backends` - Lista de backends disponibles
- `POST /login` - Iniciar sesión

### Endpoints Protegidos (requieren token)

- `POST /logout` - Cerrar sesión
- `/<prefix>/*` - Todas las rutas de los backends

## 🌐 Configuración de Backends

El proxy carga dinámicamente los backends desde `CONFIG_URL`. El endpoint debe devolver un array JSON:

```json
[
  {
    "name": "desarrollo",
    "url": "http://181.87.30.19:3000",
    "token": "mitoken123",
    "prefix": "/desa"
  },
  {
    "name": "produccion",
    "url": "https://api.produccion.com",
    "token": "prodtoken456",
    "prefix": "/prod"
  }
]
```

**Propiedades:**
- `name`: Nombre del backend (para logs)
- `url`: URL base del backend
- `token`: Token Bearer para autenticar con el backend
- `prefix`: Prefijo de ruta para seleccionar este backend

**Ejemplo de uso:**
- Request: `GET /desa/api/procedures`
- Proxy a: `GET http://181.87.30.19:3000/api/procedures`
- Con header: `Authorization: Bearer mitoken123`

## 🧪 Pruebas Locales

### Iniciar el proxy localmente

```powershell
# PowerShell
$env:CONFIG_URL="https://backends-proliq.deno.dev/items"
$env:CONFIG_TOKEN="desarrollotoken"
$env:PORT="9100"
$env:PROXY_USERS="admin:admin123,user:password"
deno run --allow-net --allow-env .\proxy\simple-proxy.ts
```

```bash
# Bash/Linux
export CONFIG_URL=https://backends-proliq.deno.dev/items
export CONFIG_TOKEN=desarrollotoken
export PORT=9100
export PROXY_USERS=admin:admin123,user:password
deno run --allow-net --allow-env ./proxy/simple-proxy.ts
```

### Script de pruebas

Ejecuta el script de pruebas completo:

```powershell
.\proxy\test-login.ps1
```

Este script prueba:
- ✅ Info del sistema
- ✅ Request sin autenticación (debe fallar)
- ✅ Login con credenciales incorrectas (debe fallar)
- ✅ Login exitoso
- ✅ Request autenticado
- ✅ Logout
- ✅ Request post-logout (debe fallar)

## 📝 Ejemplos de Uso

### Con cURL

```bash
# 1. Login
TOKEN=$(curl -s -X POST https://tu-proxy.deno.dev/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.token')

# 2. Request autenticado
curl https://tu-proxy.deno.dev/desa/api/procedures \
  -H "Authorization: Bearer $TOKEN"

# 3. Logout
curl -X POST https://tu-proxy.deno.dev/logout \
  -H "Authorization: Bearer $TOKEN"
```

### Con Postman

1. **Crear colección:**
   - Nombre: "Proxy Simple"
   - Variables: `{{base_url}}` = `https://tu-proxy.deno.dev`

2. **Request de Login:**
   - POST `{{base_url}}/login`
   - Body (JSON):
   ```json
   {
     "username": "admin",
     "password": "admin123"
   }
   ```
   - Tests (para guardar token):
   ```javascript
   if (pm.response.code === 200) {
     pm.collectionVariables.set("token", pm.response.json().token);
   }
   ```

3. **Request autenticado:**
   - GET `{{base_url}}/desa/api/procedures`
   - Headers: `Authorization: Bearer {{token}}`

### Con JavaScript/TypeScript

```typescript
// Login
const loginResponse = await fetch('https://tu-proxy.deno.dev/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
});
const { token } = await loginResponse.json();

// Request autenticado
const dataResponse = await fetch('https://tu-proxy.deno.dev/desa/api/procedures', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await dataResponse.json();

// Logout
await fetch('https://tu-proxy.deno.dev/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## 🔒 Seguridad

### Recomendaciones

1. **Contraseñas seguras**: Usa contraseñas largas y complejas en producción
   ```
   PROXY_USERS=admin:P@ssw0rd!2024Secure,api:RandomToken123!XYZ
   ```

2. **HTTPS obligatorio**: Siempre usa HTTPS en producción (Deno Deploy lo incluye)

3. **Rotación de tokens**: Los tokens expiran en 24 horas automáticamente

4. **Limitar usuarios**: Solo crea los usuarios necesarios

5. **Monitoreo**: Revisa los logs regularmente

### Deshabilitar autenticación (no recomendado)

Solo para entornos de desarrollo o APIs públicas:

```
DISABLE_AUTH=true
```

⚠️ Con esta opción, **TODAS** las rutas son públicas, excepto `/logout` que no tendrá efecto.

## 🐛 Troubleshooting

### Error: "CONFIG_URL y CONFIG_TOKEN son requeridos"

Verifica que las variables de entorno estén configuradas en Deno Deploy o en tu terminal.

### Error 401: "Sesión inválida o expirada"

- El token expiró (24 horas). Haz login nuevamente.
- El token es incorrecto. Verifica el header `Authorization: Bearer <token>`.
- Hiciste logout. Necesitas un nuevo login.

### Error 404: "No se encontró un backend"

El `prefix` de la ruta no coincide con ningún backend configurado. Verifica:
1. Los backends en `GET /_backends`
2. Que tu ruta empiece con un prefix válido (ej: `/desa/...`)

### Error 502: "Error al comunicarse con el backend"

El backend está caído o no responde. Verifica:
1. Que la URL del backend sea correcta
2. Que el backend esté online
3. Que el token del backend sea válido

## 📊 Monitoreo

### Endpoint de información

```bash
curl https://tu-proxy.deno.dev/_info
```

Respuesta:
```json
{
  "authentication": {
    "enabled": true,
    "usersConfigured": 3,
    "activeSessions": 5
  },
  "endpoints": {
    "login": "POST /login",
    "logout": "POST /logout",
    "health": "GET /_health",
    "backends": "GET /_backends",
    "info": "GET /_info"
  },
  "usage": {
    "login": {
      "method": "POST",
      "url": "/login",
      "body": {"username": "string", "password": "string"}
    },
    "authenticated": {
      "header": "Authorization: Bearer <token>"
    }
  }
}
```

### Health Check

```bash
curl https://tu-proxy.deno.dev/_health
```

Respuesta:
```json
{
  "status": "ok",
  "timestamp": "2026-01-06T16:05:00.000Z"
}
```

### Lista de Backends

```bash
curl https://tu-proxy.deno.dev/_backends
```

## 🔄 Actualización de Backends

Los backends se recargan automáticamente:
- Cada 60 segundos
- En cada request si el caché expiró

Para actualizar los backends:
1. Modifica los datos en el config service (`CONFIG_URL`)
2. El proxy los cargará automáticamente en el siguiente request

## 📚 Recursos Adicionales

- [Deno Deploy Docs](https://deno.com/deploy/docs)
- [Deno Deploy Dashboard](https://dash.deno.com)
- [Documentación de Deno](https://deno.land)

## 🆘 Soporte

Para problemas o preguntas:
1. Revisa los logs en el dashboard de Deno Deploy
2. Ejecuta las pruebas locales: `.\proxy\test-login.ps1`
3. Verifica la configuración de variables de entorno
