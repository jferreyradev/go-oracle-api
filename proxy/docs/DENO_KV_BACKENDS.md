# Gestión de Backends con Deno KV

Configuración de múltiples backends usando el servicio Deno KV.

## Servicio de Configuración

El archivo `config-service.ts` contiene un servicio completo Deno KV para gestionar backends.

**Deploy:**
1. https://dash.deno.com → New Project → Playground
2. Copia el contenido de `config-service.ts`
3. Save & Deploy
4. Usa la URL en `CONFIG_API_URL`

## Endpoints del Servicio

```bash
# Listar backends
GET /items

# Crear/Actualizar backend
POST /items
{
  "name": "prod",
  "url": "http://10.6.46.114:3013",
  "token": "secret",
  "prefix": "/prod"
}

# Obtener backend específico
GET /items/:name

# Eliminar backend
DELETE /items/:name
```

## Uso Manual

```bash
# Agregar backend
curl -X POST https://tu-config.deno.dev/items \
  -H "Content-Type: application/json" \
  -d '{
    "name": "nuevo",
    "url": "http://192.168.1.100:3013",
    "token": "secret",
    "prefix": "/nuevo"
  }'

# Listar
curl https://tu-config.deno.dev/items

# Eliminar
curl -X DELETE https://tu-config.deno.dev/items/nuevo
```

## Auto-Registro (Recomendado)

En lugar de gestionar manualmente, usa `backend-register/register.ts` para auto-registro desde cada servidor backend.

Ver [../backend-register/README.md](../backend-register/README.md)

## Variables del Proxy

```bash
# En Deno Deploy (proxy)
CONFIG_API_URL=https://tu-config.deno.dev/items
CACHE_TTL=60
DISABLE_AUTH=false
```

## Verificación

```bash
# Ver backends en el servicio
curl https://tu-config.deno.dev/items

# Ver backends en el proxy
curl https://tu-proxy.deno.dev/_proxy/config

# Forzar recarga del cache
curl https://tu-proxy.deno.dev/_proxy/reload
```
