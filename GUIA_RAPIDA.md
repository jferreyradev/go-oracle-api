# 🚀 Guía Rápida - go-oracle-api

Referencia rápida para usar la API y el Proxy Server.

---

## 📋 Tabla de Contenidos

- [API Backend](#-api-backend)
- [Proxy Server](#-proxy-server)
- [Ejemplos Completos](#-ejemplos-completos)

---

## 🔧 API Backend

### Iniciar servidor

```bash
# Desarrollo
go run main.go

# Producción
./go-oracle-api.exe

# Puerto personalizado
go run main.go .env 3000
```

### Endpoints principales

#### 1. Ping - Verificar conexión
```bash
curl http://localhost:3000/ping \
  -H "Authorization: Bearer test1"
```

#### 2. Consulta SQL
```bash
curl -X POST http://localhost:3000/query \
  -H "Authorization: Bearer test1" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT * FROM mi_tabla WHERE id = 1"
  }'
```

#### 3. Ejecutar procedimiento (síncrono)
```bash
curl -X POST http://localhost:3000/procedure \
  -H "Authorization: Bearer test1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MI_PROCEDIMIENTO",
    "params": [
      {"name": "p_input", "value": "test", "direction": "IN"},
      {"name": "p_output", "direction": "OUT", "type": "STRING"}
    ]
  }'
```

#### 4. Ejecutar procedimiento (asíncrono)
```bash
# Crear job
curl -X POST http://localhost:3000/procedure/async \
  -H "Authorization: Bearer test1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PROC_TEST_DEMORA",
    "params": [
      {"name": "segundos", "value": 5, "direction": "IN", "type": "NUMBER"}
    ]
  }'

# Respuesta: {"job_id": "abc123..."}

# Consultar estado del job
curl http://localhost:3000/jobs/abc123... \
  -H "Authorization: Bearer test1"
```

#### 5. Listar jobs
```bash
# Todos los jobs
curl http://localhost:3000/jobs \
  -H "Authorization: Bearer test1"

# Job específico
curl http://localhost:3000/jobs/{job_id} \
  -H "Authorization: Bearer test1"
```

#### 6. Eliminar jobs
```bash
# Job específico
curl -X DELETE http://localhost:3000/jobs/{job_id} \
  -H "Authorization: Bearer test1"

# Jobs completados
curl -X DELETE "http://localhost:3000/jobs?status=completed" \
  -H "Authorization: Bearer test1"

# Jobs antiguos (más de 7 días)
curl -X DELETE "http://localhost:3000/jobs?older_than=7" \
  -H "Authorization: Bearer test1"
```

#### 7. Ver logs
```bash
curl http://localhost:3000/logs \
  -H "Authorization: Bearer test1"
```

---

## 🔐 Proxy Server

### Iniciar proxy

```bash
cd proxy
deno run --allow-net --allow-env proxy.ts --port 8000
```

### Flujo de autenticación

#### 1. Login - Obtener token
```bash
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'

# Respuesta:
# {
#   "token": "a1b2c3d4e5f6...",
#   "username": "admin",
#   "role": "admin",
#   "expires_at": "2024-12-17T15:30:00Z"
# }
```

#### 2. Usar token en peticiones
```bash
# Guardar token
TOKEN="a1b2c3d4e5f6..."

# Hacer peticiones
curl http://localhost:8000/ping \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:8000/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM tabla"}'
```

#### 3. Logout - Cerrar sesión
```bash
curl -X POST http://localhost:8000/logout \
  -H "Authorization: Bearer $TOKEN"
```

### Usuarios disponibles

| Usuario | Password | Rol | Permisos |
|---------|----------|-----|----------|
| admin | admin123 | admin | Todos |
| user | user123 | user | Todos |
| demo | demo | readonly | Solo GET |

### Endpoints del proxy

```bash
# Ver usuarios disponibles
curl http://localhost:8000/_proxy/users

# Ver estadísticas del proxy
curl http://localhost:8000/_proxy/stats \
  -H "Authorization: Bearer $TOKEN"

# Todos los endpoints de la API están disponibles
# Ejemplo: /ping, /query, /procedure, /jobs, etc.
```

---

## 💡 Ejemplos Completos

### Ejemplo 1: Consulta simple con proxy

```javascript
// 1. Login
const loginRes = await fetch('http://localhost:8000/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123'
  })
});

const { token } = await loginRes.json();

// 2. Hacer consulta
const queryRes = await fetch('http://localhost:8000/query', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'SELECT * FROM empleados WHERE departamento = 1'
  })
});

const data = await queryRes.json();
console.log(data);
```

### Ejemplo 2: Job asíncrono con monitoreo

```javascript
const token = "..."; // Token del login

// 1. Crear job asíncrono
const createRes = await fetch('http://localhost:8000/procedure/async', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'PROC_TEST_DEMORA',
    params: [
      { name: 'segundos', value: 10, direction: 'IN', type: 'NUMBER' }
    ]
  })
});

const { job_id } = await createRes.json();
console.log('Job creado:', job_id);

// 2. Monitorear progreso
const checkJob = async () => {
  const res = await fetch(`http://localhost:8000/jobs/${job_id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const job = await res.json();
  console.log(`[${job.status}] ${job.progress}%`);
  
  if (job.status === 'completed') {
    console.log('Resultado:', job.result);
    return true;
  } else if (job.status === 'failed') {
    console.error('Error:', job.error);
    return true;
  }
  
  return false;
};

// Polling cada 2 segundos
const interval = setInterval(async () => {
  const done = await checkJob();
  if (done) clearInterval(interval);
}, 2000);
```

### Ejemplo 3: CRUD completo

```javascript
const token = "...";
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

// CREATE
await fetch('http://localhost:8000/exec', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: "INSERT INTO productos (nombre, precio) VALUES ('Laptop', 999.99)"
  })
});

// READ
const productos = await fetch('http://localhost:8000/query', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: "SELECT * FROM productos WHERE precio > 500"
  })
}).then(r => r.json());

// UPDATE
await fetch('http://localhost:8000/exec', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: "UPDATE productos SET precio = 899.99 WHERE nombre = 'Laptop'"
  })
});

// DELETE
await fetch('http://localhost:8000/exec', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: "DELETE FROM productos WHERE nombre = 'Laptop'"
  })
});
```

### Ejemplo 4: Procedimiento con múltiples parámetros

```javascript
const token = "...";

const res = await fetch('http://localhost:8000/procedure', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'PROC_TEST_PARAMS',
    params: [
      { name: 'p_number', value: 100, direction: 'IN', type: 'NUMBER' },
      { name: 'p_varchar', value: 'test', direction: 'IN', type: 'STRING' },
      { name: 'p_date', value: '2024-12-16', direction: 'IN', type: 'DATE' },
      { name: 'p_result', direction: 'OUT', type: 'STRING' }
    ]
  })
});

const result = await res.json();
console.log(result.out); // { p_result: "..." }
```

---

## 🛠️ Herramientas CLI

### Scripts de testing

```bash
# Test completo
node scripts/test_api.js

# Test específico
node scripts/test_api.js ping
node scripts/test_api.js query
node scripts/test_api.js procedure
node scripts/test_api.js async
node scripts/test_api.js jobs
```

### Monitoreo de jobs

```bash
# Ver todos los jobs
node scripts/view_status.js jobs

# Ver jobs activos
node scripts/view_status.js jobs:active

# Ver jobs completados
node scripts/view_status.js jobs:completed

# Ver jobs fallidos
node scripts/view_status.js jobs:failed

# Ver logs
node scripts/view_status.js logs
```

### Tests del proxy

```bash
cd proxy

# Test de autenticación
node test_auth.js

# Test de todos los endpoints
node test_all_endpoints.js

# Test de integración completa
node test_proxy_complete.js
```

---

## 📚 Documentación Completa

- **[docs/ASYNC_JOBS.md](docs/ASYNC_JOBS.md)** - Sistema de jobs asíncronos
- **[docs/USO_Y_PRUEBAS.md](docs/USO_Y_PRUEBAS.md)** - Guía de uso detallada
- **[proxy/PROXY_AUTH.md](proxy/PROXY_AUTH.md)** - Autenticación del proxy
- **[docs/CONFIGURACION_ENV.md](docs/CONFIGURACION_ENV.md)** - Configuración

---

## 🔑 Variables de Entorno Clave

```env
# Backend API
DB_USER=usuario
DB_PASSWORD=password
DB_CONNECTION_STRING=localhost:1521/ORCL
API_PORT=3000
API_TOKEN=test1

# Proxy (usa las del backend)
API_TOKEN=test1
BACKEND_URL=http://localhost:3000
```

---

## 🚨 Solución de Problemas Comunes

### Error: "Unauthorized"
```bash
# Verifica que el token sea correcto
curl http://localhost:3000/ping \
  -H "Authorization: Bearer test1"
```

### Error: "Procedimiento no encontrado"
```bash
# Instala procedimientos de prueba
chmod +x scripts/install_jobs_system.sh
./scripts/install_jobs_system.sh USUARIO PASSWORD DATABASE
```

### Error: "Token expirado" (proxy)
```bash
# Haz login de nuevo
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Error: "Cannot connect to backend" (proxy)
```bash
# Verifica que el backend esté corriendo
curl http://localhost:3000/ping -H "Authorization: Bearer test1"

# Si no responde, inicia el backend
go run main.go
```

---

**Última actualización:** 16 de diciembre de 2024  
**Versión:** 2.0
