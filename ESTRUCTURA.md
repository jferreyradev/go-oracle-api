# Go Oracle API - Estructura del Proyecto

## 📁 Estructura

```
go-oracle-api/
├── main.go                    # ⭐ API completa en Go
├── go.mod, go.sum            # Dependencias
├── .env.example              # Template de configuración
│
├── examples/
│   └── ejemplo_completo.js   # ⭐ Ejemplo de uso (7 funcionalidades)
│
├── tests/
│   └── test_completo.js      # ⭐ Suite de tests (7 tests)
│
├── scripts/
│   └── test.js               # Utilidad para probar endpoints
│
├── sql/                      # Scripts de base de datos
│   ├── create_async_jobs_table.sql
│   ├── create_query_log_table.sql
│   └── create_test_procedures.sql
│
└── docs/                     # Documentación detallada
    ├── ASYNC_JOBS.md
    ├── CONFIGURACION_ENV.md
    ├── DEPLOYMENT.md
    ├── FIREWALL_WINDOWS.md
    ├── SCHEMA_FIELD.md
    └── USO_Y_PRUEBAS.md
```

## 🚀 Inicio Rápido

### 1. Configurar
```bash
cp .env.example .env
# Editar .env con tus credenciales Oracle
```

### 2. Instalar tablas en Oracle (primera vez)
```bash
sqlplus user/pass@db @sql/create_async_jobs_table.sql
sqlplus user/pass@db @sql/create_query_log_table.sql
sqlplus user/pass@db @sql/create_test_procedures.sql
```

### 3. Iniciar API
```bash
go run main.go
# API disponible en http://localhost:3000
```

### 4. Probar
```bash
# Ver ejemplo completo
node examples/ejemplo_completo.js

# Ejecutar tests
node tests/test_completo.js

# Probar endpoint
node scripts/test.js ping
```

## 📝 Endpoints Principales

- `GET /ping` - Verificar conexión
- `POST /query` - Consultas SELECT
- `POST /exec` - Ejecutar INSERT/UPDATE/DELETE
- `POST /procedure` - Ejecutar procedimientos (síncrono)
- `POST /procedure/async` - Ejecutar procedimientos en segundo plano
- `GET /jobs` - Listar jobs asíncronos
- `GET /jobs/{id}` - Consultar estado de un job
- `GET /logs` - Ver logs de consultas

## 📚 Documentación

- **README.md** - Documentación completa
- **GUIA_RAPIDA.md** - Referencia rápida
- **docs/** - Documentación detallada de cada funcionalidad

## 🎯 Archivos Clave

| Archivo | Descripción |
|---------|-------------|
| `main.go` | API completa con todos los endpoints |
| `examples/ejemplo_completo.js` | Ejemplo que demuestra todas las funcionalidades |
| `tests/test_completo.js` | Suite completa de tests |
| `scripts/test.js` | Utilidad para probar endpoints individuales |

---

**Versión:** 2.1  
**Fecha:** 7 de enero de 2026  
**Licencia:** MIT
