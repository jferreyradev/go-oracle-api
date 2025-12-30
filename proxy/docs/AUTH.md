# Autenticación del Proxy

Sistema de autenticación JWT para el proxy.

## Usuarios

| Usuario | Password | Rol | Permisos |
|---------|----------|-----|----------|
| admin   | admin123 | admin | Todo |
| user    | user123  | user | Todo |
| demo    | demo     | readonly | Solo GET |

## Endpoints

```bash
# Login (obtener token)
POST /login
{
  "username": "admin",
  "password": "admin123"
}

# Respuesta:
{
  "success": true,
  "token": "abc123...",
  "expiresIn": 86400
}

# Logout
POST /logout
Authorization: Bearer <token>

# Ver usuarios disponibles
GET /_proxy/users

# Ver estadísticas
GET /_proxy/stats
```

## Usar el Token

```bash
# Con curl
curl https://proxy.deno.dev/api/procedures \
  -H "Authorization: Bearer <token>"

# Con fetch
fetch('https://proxy.deno.dev/api/procedures', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
})
```

## Duración

- Token válido: 24 horas
- Inactividad: 2 horas
- Renovación automática con cada request

## Deshabilitar (Solo Testing)

```bash
# Local
deno run --allow-net --allow-env proxy.ts --no-auth

# Deno Deploy (variable de entorno)
DISABLE_AUTH=true
```
