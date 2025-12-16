# Proxy Server - go-oracle-api

Proxy transparente con autenticación y rate limiting para la API de Oracle.

## 📁 Estructura

```
proxy/
├── docs/
│   ├── PROXY_AUTH.md        # Documentación de autenticación
│   └── FRONTEND.md          # Documentación del frontend
├── frontend/
│   └── index.html           # Interfaz web para testing
├── tests/
│   ├── test_auth.js         # Tests de autenticación
│   ├── test_all_endpoints.js # Tests de todos los endpoints
│   ├── test_proxy_complete.js # Tests completos del proxy
│   └── test_proxy.js        # Tests básicos
├── proxy.ts                 # Servidor proxy principal
└── README.md                # Este archivo
```

## 🚀 Inicio Rápido

```bash
# Iniciar el proxy
cd proxy
deno run --allow-net --allow-env proxy.ts --port 8000

# Con puerto personalizado
deno run --allow-net --allow-env proxy.ts --port 8080
```

## 🎨 Frontend Web

Abre `frontend/index.html` en tu navegador para usar la interfaz gráfica:

```bash
# Windows
start frontend\index.html

# macOS
open frontend/index.html

# Linux
xdg-open frontend/index.html
```

**Características del frontend:**
- 🔑 Login con 3 usuarios predefinidos
- 🚀 8 botones para endpoints comunes
- 📝 Editor para requests personalizados
- 📊 Panel de respuestas en tiempo real

## 🔐 Autenticación

### Login
```bash
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Usar Token
```bash
curl http://localhost:8000/ping \
  -H "Authorization: Bearer <tu-token>"
```

## 👥 Usuarios Disponibles

| Usuario | Password  | Rol      | Permisos           |
|---------|-----------|----------|--------------------|
| admin   | admin123  | admin    | Lectura/Escritura  |
| user    | user123   | user     | Lectura/Escritura  |
| demo    | demo      | readonly | Solo Lectura       |

## 🧪 Tests

```bash
# Ejecutar tests (Node.js)
cd tests

# Test de autenticación
node test_auth.js

# Test completo del proxy
node test_proxy_complete.js

# Test de todos los endpoints
node test_all_endpoints.js
```

## 📊 Endpoints Especiales

- `POST /login` - Obtener token
- `POST /logout` - Cerrar sesión
- `GET /_proxy/stats` - Estadísticas del proxy
- `GET /_proxy/users` - Usuarios disponibles

## 📚 Documentación

- **[docs/PROXY_AUTH.md](docs/PROXY_AUTH.md)** - Sistema de autenticación completo
- **[docs/FRONTEND.md](docs/FRONTEND.md)** - Guía del frontend web
- **[../GUIA_RAPIDA.md](../GUIA_RAPIDA.md)** - Guía rápida de uso

## ⚙️ Configuración

```bash
# Variables de entorno
export API_URL="http://localhost:3000"
export API_TOKEN="test1"

# O parámetros
deno run --allow-net --allow-env proxy.ts \
  --port 8000 \
  --api http://10.6.150.91:3000
```

## 📚 Documentación Completa

Ver [PROXY_AUTH.md](PROXY_AUTH.md) para documentación detallada.

## ✨ Características

- ✅ Autenticación con tokens
- ✅ Control de acceso por roles
- ✅ Sesiones de 24h con renovación
- ✅ Rate limiting (100 req/min por IP)
- ✅ CORS automático
- ✅ Logging de requests
- ✅ Estadísticas en tiempo real
- ✅ Compatible con todos los endpoints de la API
