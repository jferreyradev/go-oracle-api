# 🚀 Guía Rápida - go-oracle-api

Referencia rápida para usar la API.

---

## 📋 Contenido

- [Inicio Rápido](#-inicio-rápido)
- [API Backend](#-api-backend)
- [Ejemplos Completos](#-ejemplos-completos)
- [Troubleshooting](#-troubleshooting)

---

## ⚡ Inicio Rápido

### 1. Configurar
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 2. Instalar en Oracle (primera vez)
```bash
sqlplus user/pass@db @sql/create_async_jobs_table.sql
sqlplus user/pass@db @sql/create_query_log_table.sql
sqlplus user/pass@db @sql/create_test_procedures.sql
```

### 3. Iniciar API
```bash
go run main.go
# API en http://localhost:3000
```

### 4. Probar
```bash
# Ejemplo completo
node examples/ejemplo_completo.js

# Ejecutar todos los tests
node tests/test.js

# Test específico
node tests/test.js ping
```

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

## � Ejemplos Completos

### Ejemplo 1: Consulta simple

```javascript
// Hacer consulta directa a la API
const queryRes = await fetch('http://localhost:3000/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test1',
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
// 1. Crear job asíncrono
const res = await fetch('http://localhost:3000/procedure', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer test1',
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
  const res = await fetch(`http://localhost:3000/jobs/${job_id}`, {
    headers: { 'Authorization': 'Bearer test1' }
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
const headers = {
  'Authorization': 'Bearer test1',
  'Content-Type': 'application/json'
};

// CREATE
await fetch('http://localhost:3000/exec', {
  method: 'POST',3
  headers,
  body: JSON.stringify({
    query: "INSERT INTO productos (nombre, precio) VALUES ('Laptop', 999.99)"
  })
});

// READ
const productos = await fetch('http://localhost:3000/query', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: "SELECT * FROM productos WHERE precio > 500"
  })
}).then(r => r.json());

// UPDATE
await fetch('http://localhost:3000/exec', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: "UPDATE productos SET precio = 899.99 WHERE nombre = 'Laptop'"
  })
});

// DELETE
await fetch('http://localhost:3000/exec', {
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

## 🧪 Tests y Ejemplos

### Ejemplo completo
```bash
node examples/ejemplo_completo.js
```

### Suite de tests
```bash
# Ejecutar todos los tests
node tests/test.js

# Test específico
node tests/test.js query
node tests/test.js procedure
node tests/test.js async
```

---

## 📚 Documentación

- **[README.md](README.md)** - Documentación principal
- **[ESTRUCTURA.md](ESTRUCTURA.md)** - Estructura del proyecto
- **[docs/ASYNC_JOBS.md](docs/ASYNC_JOBS.md)** - Sistema de jobs
- **[docs/USO_Y_PRUEBAS.md](docs/USO_Y_PRUEBAS.md)** - Guía de uso
- **[docs/CONFIGURACION_ENV.md](docs/CONFIGURACION_ENV.md)** - Configuración

---

## 🚨 Troubleshooting

### Error: "Unauthorized"
```bash
curl http://localhost:3000/ping -H "Authorization: Bearer test1"
```

### Error: "Procedimiento no encontrado"
```bash
sqlplus user/pass@db @sql/create_test_procedures.sql
```

---

**Versión:** 2.1 | **Fecha:** 7 de enero de 2026