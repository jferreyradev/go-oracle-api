# Campo `schema` y Gestión de Nomenclatura Oracle

## Función Helper: `formatObjectName()`

El backend unifica toda la lógica de formateo de nombres de objetos Oracle en una sola función helper centralizada:

```go
func formatObjectName(schema, name string) string {
    if schema != "" {
        return fmt.Sprintf("%s.%s", strings.ToUpper(schema), strings.ToUpper(name))
    } else if strings.Contains(name, ".") && !strings.Contains(name, "\"") {
        parts := strings.Split(name, ".")
        for i, part := range parts {
            parts[i] = fmt.Sprintf("\"%s\"", strings.ToUpper(part))
        }
        return strings.Join(parts, ".")
    }
    return strings.ToUpper(name)
}
```

**Casos manejados:**

1. **Con campo `schema` explícito:** `formatObjectName("WORKFLOW", "MI_FUNCION")` → `WORKFLOW.MI_FUNCION`
2. **Nombre con punto (sin comillas):** `formatObjectName("", "USUARIO.PACKAGE.PROC")` → `"USUARIO"."PACKAGE"."PROC"`
3. **Nombre simple:** `formatObjectName("", "MI_PROC")` → `MI_PROC`

## Uso del Campo `schema`

### ✅ Cuándo usar el campo `schema`:

- Funciones o procedimientos **standalone** (fuera de packages) en otro esquema
- Para mayor claridad y separación de responsabilidades
- Cuando el esquema es diferente al usuario conectado

**Ejemplo:**
```json
{
  "schema": "WORKFLOW",
  "name": "EXISTE_PROC_CAB",
  "isFunction": true,
  "params": [
    {"name": "vCOUNT", "direction": "OUT", "type": "number"},
    {"name": "vIDGRUPOREP", "value": -1, "direction": "IN"},
    {"name": "vID_PROC_CAB", "value": 1, "direction": "IN"}
  ]
}
```

### ❌ Cuándo NO usar el campo `schema`:

- Para objetos dentro de packages (usar notación completa en `name`)
- Cuando existe un package con el mismo nombre que el schema (ver conflictos)

## Conflictos de Nomenclatura

### Problema: Package vs Schema

Oracle da **prioridad a los packages** sobre los schemas cuando hay ambigüedad:

**Escenario:**
- Existe `WORKFLOW` como **PACKAGE** (en schema USUARIO)
- Existe `WORKFLOW` como **SCHEMA/USER** (separado)
- Función `EXISTE_PROC_CAB` está en el **schema** WORKFLOW (standalone, no en package)

**Resultado:**
- `WORKFLOW.EXISTE_PROC_CAB` → Oracle busca en el **PACKAGE**, no en el **SCHEMA** ❌
- Error: `ORA-06550: PLS-00302: component 'EXISTE_PROC_CAB' must be declared`

### Solución 1: Sinónimos (Recomendado)

Crear un sinónimo para evitar la ambigüedad:

```sql
CREATE SYNONYM EXISTE_PROC_CAB FOR WORKFLOW.EXISTE_PROC_CAB;
```

Luego llamar directamente:
```json
{
  "name": "EXISTE_PROC_CAB",
  "isFunction": true,
  "params": [...]
}
```

### Solución 2: Renombrar Package

Si es posible, renombrar el package para evitar el conflicto:
```sql
-- Renombrar WORKFLOW package a WORKFLOW_PKG
ALTER PACKAGE WORKFLOW RENAME TO WORKFLOW_PKG;
```

### ❌ Soluciones que NO funcionan:

- **Comillas dobles:** `"WORKFLOW"."EXISTE_PROC_CAB"` → Oracle sigue priorizando el package
- **GRANT EXECUTE:** No aplica si el usuario y el schema son el mismo en la BD
- **EXECUTE IMMEDIATE:** El conflicto persiste en tiempo de ejecución

## Arquitectura Unificada

Todos los handlers utilizan la misma función `formatObjectName()`:

```go
// Handler de funciones (línea ~1156)
functionName := formatObjectName(req.Schema, req.Name)

// Handler de procedimientos (línea ~1299)
procName := formatObjectName(req.Schema, req.Name)

// Handler asíncrono (línea ~1538)
procName := formatObjectName(req.Schema, req.Name)
```

**Beneficios:**
- ✅ Código unificado (una sola fuente de verdad)
- ✅ Mantenimiento simplificado
- ✅ Comportamiento consistente
- ✅ Reducción de ~45 líneas de código duplicado

## Ejemplos Completos

### Función en package (sin `schema`)
```json
{
  "name": "USUARIO.TRANSFORMADOR.BUSCA_PERSONA",
  "isFunction": true,
  "params": [
    {"name": "vDNI", "value": 26579673},
    {"name": "resultado", "direction": "OUT"}
  ]
}
```

### Función standalone con `schema`
```json
{
  "schema": "OTRO_SCHEMA",
  "name": "MI_FUNCION",
  "isFunction": true,
  "params": [
    {"name": "result", "direction": "OUT", "type": "number"}
  ]
}
```

### Función con conflicto (usar sinónimo)
```sql
-- Paso 1: Crear sinónimo
CREATE SYNONYM EXISTE_PROC_CAB FOR WORKFLOW.EXISTE_PROC_CAB;
```

```json
// Paso 2: Llamar sin schema
{
  "name": "EXISTE_PROC_CAB",
  "isFunction": true,
  "params": [...]
}
```

## Referencias

- [main.go](../main.go) - Líneas 145-165: función `formatObjectName()`
- [USO_Y_PRUEBAS.md](USO_Y_PRUEBAS.md) - Ejemplos de uso completos
- [tests/guia_campo_schema.ts](../tests/guia_campo_schema.ts) - Guía de pruebas
- [sql/crear_sinonimo_existe_proc_cab.sql](../sql/crear_sinonimo_existe_proc_cab.sql) - Script de sinónimo
