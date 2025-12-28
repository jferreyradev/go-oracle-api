# Guía: Deployar Proxy en Deno Deploy

## ¿Qué es Deno Deploy?

Deno Deploy es una plataforma serverless de Deno que ejecuta tu código en el edge (geográficamente distribuido).

**Ventajas:**
- ✅ Gratuito para uso básico
- ✅ Deploy desde Git automático
- ✅ Escalado automático
- ✅ Disponible globalmente

**Limitaciones:**
- ❌ Sin acceso a filesystem local
- ❌ Sin especificar puerto (asignado automáticamente)
- ❌ Sin `Deno.args` en producción
- ⚠️ Sesiones en memoria se pierden en redeploys

## Pasos para Deployar

### 1. Preparar tu Repositorio

```bash
# Asegúrate que proxy-deploy.ts está en el repo
git add proxy/proxy-deploy.ts
git commit -m "Add Deno Deploy proxy version"
git push
```

### 2. Crear Proyecto en Deno Deploy

1. Ve a [https://dash.deno.com](https://dash.deno.com)
2. Haz click en **"New Project"**
3. Selecciona tu repositorio de GitHub
4. Selecciona la rama (main/master)
5. En **Entry point**, especifica: `proxy/proxy-deploy.ts`

### 3. Configurar Variables de Entorno

En el dashboard de Deno Deploy, ve a **Settings** → **Environment Variables** y agrega:

```env
API_URL=http://10.6.46.114:3013
API_TOKEN=test1
DISABLE_AUTH=false
```

**Opcionales:**
```env
DISABLE_AUTH=true        # Para pruebas sin autenticación
```

### 4. Deploy

El proyecto se despliega automáticamente. URL de ejemplo:
```
https://my-proxy.deno.dev
```

## Endpoints Disponibles

### Autenticación
```bash
# Login
curl -X POST https://my-proxy.deno.dev/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Respuesta:
{
  "success": true,
  "token": "abc123...",
  "username": "admin",
  "role": "admin",
  "expiresIn": 86400
}

# Usar token
curl https://my-proxy.deno.dev/api/procedures \
  -H "Authorization: Bearer abc123..."
```

### Usuarios Disponibles
```bash
curl https://my-proxy.deno.dev/_proxy/users

# admin    / admin123  - Acceso total
# user     / user123   - Acceso normal
# demo     / demo      - Solo lectura
```

### Estadísticas del Proxy
```bash
curl https://my-proxy.deno.dev/_proxy/stats
```

### Health Check
```bash
curl https://my-proxy.deno.dev/_proxy/health
```

## Integración con Frontend

En tu aplicación frontend, cambia la URL de la API:

```typescript
// Antes (local):
const API_URL = 'http://localhost:8000';

// Después (Deploy):
const API_URL = 'https://my-proxy.deno.dev';

// Con autenticación:
const token = localStorage.getItem('auth-token');
const headers = {
  'Authorization': `Bearer ${token}`
};
```

## Monitoreo

### Ver logs en tiempo real

```bash
# Vía CLI de Deno
deno deploy logs --project=my-proxy
```

Esto mostrará todos los logs de tu proxy desplegado.

### Métricas importantes

- **Requests totales**: `GET /_proxy/stats`
- **Tasa de éxito**: En estadísticas
- **Sesiones activas**: En estadísticas
- **Rate limit**: 100 requests/minuto por IP

## Solución de Problemas

### "Connection refused" al backend

**Problema:** El proxy no puede conectar a la API.

**Solución:** 
- Verifica que `API_URL` sea correcta
- Asegúrate que la API es accesible públicamente
- Revisa firewall/NAT

### Sesiones se pierden frecuentemente

**Problema:** Después de un redeploy, los tokens invalidan.

**Solución:**
- Usa Deno KV para persistencia (versión avanzada)
- Aumenta `SESSION_DURATION` en el código
- Configura CI/CD para minimal downtime

### CORS errors en frontend

**Problema:** "Access-Control-Allow-Origin" missing.

**Solución:**
- Ya está configurado en proxy-deploy.ts
- Verifica que el frontend tenga `Allow-Origin: *`
- Revisa browser console para error exacto

## Próximos Pasos (Avanzado)

### 1. Persistencia con Deno KV

Reemplaza `Map<string, Session>` con Deno KV:

```typescript
const kv = await Deno.openKv();

// Guardar sesión
await kv.set(['session', token], session);

// Recuperar sesión
const session = await kv.get(['session', token]);
```

### 2. Autenticación con JWT

```typescript
import { create, verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

const key = await crypto.subtle.generateKey(
  { name: "HMAC", hash: "SHA-256" },
  true,
  ["sign", "verify"]
);

// Crear JWT
const token = await create({ alg: "HS256", typ: "JWT" }, 
  { username: "admin", role: "admin" },
  key
);
```

### 3. Database (PostgreSQL en Deploy)

```typescript
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const client = new Client({
  user: Deno.env.get("DB_USER"),
  password: Deno.env.get("DB_PASSWORD"),
  hostname: Deno.env.get("DB_HOST"),
  port: 5432,
  database: "oracle_proxy",
});

await client.connect();
// ...
```

## Costos (Deno Deploy)

- **Requests gratis**: 100,000/mes incluido
- **Después**: $0.50 por millón de requests
- **Almacenamiento KV**: $0.10 GB/mes (optional)

## Comandos Útiles

```bash
# Ver todos los proyectos
deno deploy list

# Ver logs
deno deploy logs --project=my-proxy

# Redeploy
git push  # Auto-deploy en cambios

# Rollback
# En dashboard: selecciona deployment anterior
```

## Referencias

- [Deno Deploy Docs](https://deno.com/deploy/docs)
- [Deno Deploy API](https://deno.com/deploy/api)
- [Deno KV Documentation](https://deno.com/deploy/kv)
