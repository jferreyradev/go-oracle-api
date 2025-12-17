# 📁 ARCHIVOS ESENCIALES DEL PROYECTO

## 🔧 Backend (Go)
```
main.go                    # Servidor principal con todos los endpoints
go.mod                     # Dependencias Go
go.sum                     # Checksums de dependencias
go-oracle-api.exe          # Ejecutable compilado
```

## 🌐 Proxy (Deno)
```
proxy/
  ├── proxy.ts             # Servidor proxy con autenticación
  └── frontend/
      └── index.html       # Interfaz web para pruebas
```

## 📄 Documentación
```
README.md                  # Documentación principal
docs/
  ├── CONFIGURACION_ENV.md # Configuración de variables de entorno
  ├── DEPLOYMENT.md        # Guía de despliegue
  ├── FIREWALL_WINDOWS.md  # Configuración de firewall
  ├── USO_Y_PRUEBAS.md     # Guía de uso y ejemplos
  └── SCHEMA_FIELD.md      # Campo schema y gestión de nomenclatura Oracle
```

## 🗄️ SQL (Esenciales)
```
sql/
  ├── crear_sinonimo_existe_proc_cab.sql  # Sinónimo para EXISTE_PROC_CAB
  └── grant_existe_proc_cab.sql           # GRANT (si necesario)
```

## 🧪 Tests (Solo mantener)
```
tests/
  ├── test_final.ts        # Test completo del sistema
  └── guia_campo_schema.ts # Guía de uso del campo schema
```

---

## 🗑️ ARCHIVOS PARA ELIMINAR (Temporales de debug)

Los siguientes archivos fueron creados durante el debugging y pueden eliminarse:

```
tests/
  ├── check_*.ts                      # Tests de verificación (15 archivos)
  ├── diagnostico_*.ts                # Diagnósticos (3 archivos)
  ├── drop_*.ts                       # Scripts de limpieza (2 archivos)
  ├── find_*.ts                       # Búsquedas (3 archivos)
  ├── grant_*.ts                      # Tests de permisos (2 archivos)
  ├── search_*.ts                     # Búsquedas (2 archivos)
  ├── test_all_formats.ts             # Pruebas de formato
  ├── test_backend_*.ts               # Tests específicos (4 archivos)
  ├── test_dbms_sql.ts                # Prueba DBMS_SQL
  ├── test_frontend_*.ts              # Tests frontend (2 archivos)
  ├── test_full_system.ts             # Reemplazado por test_final.ts
  ├── test_package_*.ts               # Tests de paquetes (2 archivos)
  ├── test_schema_*.ts                # Tests de schema (3 archivos)
  ├── test_standalone_*.ts            # Tests standalone (3 archivos)
  ├── test_syntax_*.ts                # Tests de sintaxis
  ├── test_todo.js                    # Test antiguo
  ├── test_without_synonym.ts         # Test sin sinónimo
  ├── test_workflow_*.ts              # Tests workflow (2 archivos)
  ├── verify_*.ts                     # Verificaciones (5 archivos)
  └── archivo_prueba.txt              # Archivo de prueba

sql/
  ├── fix_existe_proc_cab.sql         # Ya no necesario
  ├── grant_workflow_a_usuario.sql    # Duplicado
  └── SOLUCION_EXISTE_PROC_CAB.sql    # Obsoleto
```

---

## 🚀 ESTRUCTURA FINAL RECOMENDADA

```
go-oracle-api/
├── main.go
├── go.mod
├── go.sum
├── go-oracle-api.exe
├── README.md
├── LICENSE
├── docs/
│   ├── CONFIGURACION_ENV.md
│   ├── DEPLOYMENT.md
│   ├── FIREWALL_WINDOWS.md
│   └── USO_Y_PRUEBAS.md
├── proxy/
│   ├── proxy.ts
│   └── frontend/
│       └── index.html
├── sql/
│   ├── crear_sinonimo_existe_proc_cab.sql
│   └── grant_existe_proc_cab.sql
└── tests/
    ├── test_final.ts
    └── guia_campo_schema.ts
```

## 📝 NOTAS

1. **main.go** - Contiene toda la lógica del backend
2. **proxy.ts** - Maneja autenticación y reenvío de requests
3. **index.html** - UI completa para testing con 9 botones predefinidos
4. **test_final.ts** - Test de 5 puntos que verifica todo el sistema
5. **guia_campo_schema.ts** - Documentación interactiva del uso de 'schema'

## ⚡ COMANDOS RÁPIDOS

```powershell
# Backend
go build -o go-oracle-api.exe
.\go-oracle-api.exe

# Proxy
cd proxy
deno run --allow-net --allow-read proxy.ts

# Test
deno run --allow-net tests\test_final.ts
```

## 🎯 USO EN PRODUCCIÓN

Para EXISTE_PROC_CAB siempre usar:
```json
{
  "name": "EXISTE_PROC_CAB",
  "isFunction": true,
  "params": [...]
}
```
❌ NO usar `"schema": "WORKFLOW"` (conflicto con paquete)
