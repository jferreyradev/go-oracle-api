# Proxy con Autenticación - go-oracle-api

Proxy server con sistema de autenticación por tokens para la API de Oracle.

## 🚀 Inicio Rápido

```bash
# Iniciar el proxy
deno run --allow-net --allow-env proxy.ts --port 8000

# En otra terminal, probar
deno run --allow-net test_auth.js
```

## 🔐 Sistema de Autenticación

### Usuarios Disponibles

| Usuario | Contraseña | Rol       | Permisos                      |
|---------|------------|-----------|-------------------------------|
| admin   | admin123   | admin     | Acceso total (lectura/escritura) |
| user    | user123    | user      | Acceso normal (lectura/escritura) |
| demo    | demo       | readonly  | Solo lectura (GET)            |

### Endpoints de Autenticación

#### POST /login
Obtener un token de acceso.

**Request:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "2ae6b2b0bd405239c71c...",
  "username": "admin",
  "role": "admin",
  "expiresIn": 86400,
  "message": "Login exitoso. Use el token en el header: Authorization: Bearer <token>"
}
```

#### POST /logout
Cerrar sesión y revocar el token.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logout exitoso"
}
```

## 🔑 Uso del Token

Una vez obtenido el token, inclúyelo en todas las requests:

```bash
# Con curl
curl http://localhost:8000/ping \
  -H "Authorization: Bearer 2ae6b2b0bd405239c71c..."

# Con fetch (JavaScript)
fetch('http://localhost:8000/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer 2ae6b2b0bd405239c71c...',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: 'SELECT 1 FROM DUAL' })
});
```

## 🛡️ Control de Permisos

### Usuarios con rol `readonly`

- ✅ Pueden hacer GET requests
- ❌ **NO** pueden hacer POST, PUT, DELETE

Ejemplo:
```bash
# ✅ Permitido
GET /ping
GET /jobs
GET /logs

# ❌ Bloqueado (403 Forbidden)
POST /query
POST /procedure
DELETE /jobs
```

### Usuarios con rol `user` o `admin`

- ✅ Acceso completo a todos los endpoints

## ⏱️ Duración de Sesiones

- **Duración máxima:** 24 horas desde el login
- **Inactividad máxima:** 2 horas sin actividad
- **Renovación automática:** Cada request actualiza el tiempo de inactividad

## 📊 Endpoints del Proxy

### GET /_proxy/stats
Ver estadísticas del proxy (no requiere autenticación).

**Response:**
```json
{
  "uptime": 1734365400000,
  "total": 25,
  "success": 18,
  "errors": 7,
  "successRate": "72.00%",
  "topEndpoints": {
    "/ping": 5,
    "/query": 3
  },
  "activeRateLimits": 2,
  "auth": {
    "loginAttempts": 5,
    "loginSuccess": 3,
    "loginFailed": 2,
    "activeSessions": 2
  }
}
```

### GET /_proxy/users
Ver usuarios disponibles (no requiere autenticación).

**Response:**
```json
{
  "availableUsers": [
    {
      "username": "admin",
      "role": "admin",
      "description": "Acceso total"
    }
  ],
  "note": "Passwords: admin123, user123, demo"
}
```

## 🧪 Testing

### Test Completo de Autenticación
```bash
deno run --allow-net test_auth.js
```

### Test de Todos los Endpoints (con token)
```bash
# 1. Obtener token
TOKEN=$(curl -s http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.token')

# 2. Ejecutar tests
deno run --allow-net test_all_endpoints.js
```

## 🔧 Configuración

### Variables de Entorno

```bash
# URL del backend
export API_URL="http://localhost:3000"

# Token para el backend
export API_TOKEN="test1"
```

### Parámetros de Línea de Comandos

```bash
# Puerto personalizado
deno run --allow-net --allow-env proxy.ts --port 8001

# API backend personalizada
deno run --allow-net --allow-env proxy.ts --api http://10.6.150.91:3000

# Ambos
deno run --allow-net --allow-env proxy.ts --port 8001 --api http://10.6.150.91:3000
```

## 🔄 Flujo de Trabajo Típico

```javascript
// 1. Login
const loginRes = await fetch('http://localhost:8000/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' })
});
const { token } = await loginRes.json();

// 2. Guardar token (localStorage, variable, etc)
localStorage.setItem('token', token);

// 3. Usar en todas las requests
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

// 4. Hacer requests
const res = await fetch('http://localhost:8000/query', {
  method: 'POST',
  headers,
  body: JSON.stringify({ query: 'SELECT * FROM DUAL' })
});

// 5. Logout cuando termines
await fetch('http://localhost:8000/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## 🚨 Manejo de Errores

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Token inválido o expirado. Use POST /login para obtener un nuevo token."
}
```

**Solución:** Hacer login nuevamente.

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Usuario readonly solo tiene permisos de lectura."
}
```

**Solución:** Usar un usuario con más permisos.

### 429 Rate Limit Exceeded
```json
{
  "error": "Rate limit exceeded"
}
```

**Solución:** Esperar antes de hacer más requests (límite: 100 req/min por IP).

## 📝 Notas de Seguridad

⚠️ **Este es un ejemplo de desarrollo. En producción:**

1. Usar HTTPS (TLS/SSL)
2. Almacenar usuarios en base de datos
3. Usar bcrypt/argon2 para passwords
4. Implementar JWT en lugar de tokens simples
5. Agregar refresh tokens
6. Implementar CSRF protection
7. Rate limiting más estricto
8. Logging de seguridad

## 🔗 Ver También

- [test_auth.js](test_auth.js) - Tests de autenticación
- [test_all_endpoints.js](test_all_endpoints.js) - Tests de endpoints
- [README.md](README.md) - Documentación principal
