# Documentación de Uso y Pruebas - Go Oracle API

## Endpoints disponibles

### 1. `/ping`
- **Método:** GET
- **Descripción:** Verifica si el microservicio está activo y conectado a Oracle.
- **Prueba:**
  ```bash
  curl -H "Authorization: Bearer <API_TOKEN>" http://localhost:8080/ping
  ```

### 2. `/query`
- **Método:** POST
- **Descripción:** Ejecuta consultas SELECT en Oracle. Soporta consultas multilínea y normalización automática de saltos de línea.
- **Ejemplo básico:**
  ```bash
  curl -X POST -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
    -d '{"query": "SELECT sysdate FROM dual"}' http://localhost:8080/query
  ```
- **Ejemplo multilínea:**
  ```bash
  curl -X POST -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
    -d '{"query": "SELECT campo1, campo2\nFROM mi_tabla\nWHERE condicion = '\''valor'\''"}' http://localhost:8080/query
  ```
- **Respuesta:**
  ```json
  {
    "results": [
      {"campo1": "valor1", "campo2": "valor2"}
    ]
  }
  ```

### 3. `/exec`
- **Método:** POST
- **Descripción:** Ejecuta sentencias SQL de modificación (INSERT, UPDATE, DELETE, DDL).
- **Prueba:**
  ```bash
  curl -X POST -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
    -d '{"query": "CREATE TABLE test_tabla (id NUMBER)"}' http://localhost:8080/exec
  ```


### 4. `/procedure`
- **Método:** POST
- **Descripción:** Ejecuta procedimientos y funciones de paquetes Oracle con parámetros IN y OUT.

#### Ejemplo 1: Llamada a procedimiento simple
```bash
curl -X POST -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
  -d '{
    "name": "suma_simple",
    "params": [
      { "name": "a", "value": 5, "direction": "IN" },
      { "name": "b", "value": 7, "direction": "IN" },
      { "name": "resultado", "direction": "OUT" }
    ]
  }' http://localhost:8080/procedure
```

#### Ejemplo 2: Llamada a función de paquete
```bash
curl -X POST -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
  -d '{
    "name": "usuario.TRANSFORMADOR.BUSCA_PERSONA",
    "isFunction": true,
    "params": [
      { "name": "vDNI", "value": 26579673 },
      { "name": "resultado", "direction": "OUT" }
    ]
  }' http://localhost:8080/procedure
```

#### Ejemplo 2b: Función en otro esquema (con campo `schema`)
```bash
curl -X POST -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
  -d '{
    "schema": "WORKFLOW",
    "name": "MI_FUNCION",
    "isFunction": true,
    "params": [
      { "name": "resultado", "direction": "OUT", "type": "number" },
      { "name": "p_param1", "value": 100, "direction": "IN" }
    ]
  }' http://localhost:8080/procedure
```

**Respuesta esperada:**
```json
{
  "status": "ok",
  "out": {
    "resultado": 12345
  }
}
```

**⚠️ Conflictos de nomenclatura Oracle:**

Cuando un PACKAGE y un SCHEMA/USER tienen el mismo nombre, Oracle siempre interpreta `NOMBRE.FUNCION` como `PACKAGE.FUNCION`, no como `SCHEMA.FUNCION`. Ejemplo:
- Existe `WORKFLOW` (package en USUARIO)
- Existe `WORKFLOW` (schema/user separado)
- `WORKFLOW.EXISTE_PROC_CAB` → Oracle busca en el package, no en el schema

**Solución:** Crear sinónimo:
```sql
CREATE SYNONYM EXISTE_PROC_CAB FOR WORKFLOW.EXISTE_PROC_CAB;
```

Luego llamar directamente sin schema:
```json
{
  "name": "EXISTE_PROC_CAB",
  "isFunction": true,
  "params": [...]
}
```

#### Ejemplo 3: Llamada a procedimiento con parámetro de fecha
```bash
curl -X POST -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
  -d '{
    "name": "workflow.controles.CARGALIQNEGATIVAS",
    "params": [
      { "name": "vPERIODO", "value": "2025-09-16" },
      { "name": "vIDTIPOLIQ", "value": 1 },
      { "name": "vIDGRUPO", "value": 2 },
      { "name": "vGRUPOREP", "value": 3 }
    ]
  }' http://localhost:8080/procedure
```
Puedes usar fechas en formato `yyyy-mm-dd` o `dd/mm/yyyy`.

#### Ejemplo 4: Especificación explícita de tipos (solo necesario para OUT)
```bash
curl -X POST -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
  -d '{
    "name": "MI_PROCEDIMIENTO",
    "params": [
      { "name": "param_texto", "value": "valor" },
      { "name": "param_numero", "value": 123 },
      { "name": "resultado_out", "direction": "OUT", "type": "number" }
    ]
  }' http://localhost:8080/procedure
```

**Nota:** El campo `type` solo es necesario para parámetros OUT. Los parámetros IN se detectan automáticamente por el valor JSON.

#### Detección automática de tipos

**Para parámetros IN:**
- Se detecta automáticamente por el valor JSON: `"texto"` → string, `123` → number
- Las fechas se convierten automáticamente si el nombre contiene `fecha` o `periodo`

**Para parámetros OUT (basándose en el nombre):**
- **Numéricos:** nombres que contengan `resultado`, `result`, `total`, `count`, `suma`, `num`, `int`, `id`
- **Fechas:** nombres que contengan `fecha`, `periodo`  
- **Strings:** todos los demás casos

#### Buffer mejorado
- Buffer de 4000 caracteres para parámetros OUT de tipo string
- Soporte completo para parámetros NUMBER/INTEGER
- Manejo robusto de valores NULL

#### Procedimientos y funciones en diferentes esquemas

**Notación Oracle:**
- `PROCEDIMIENTO` - Standalone en esquema actual
- `PAQUETE.PROCEDIMIENTO` - Dentro de un paquete
- `ESQUEMA.PROCEDIMIENTO` - Standalone en otro esquema (⚠️ puede ser ambiguo)
- `ESQUEMA.PAQUETE.PROCEDIMIENTO` - En paquete de otro esquema

**✅ SOLUCIÓN: Campo `schema` separado** (recomendado para evitar ambigüedad):

```json
{
  "schema": "WORKFLOW",
  "name": "MI_FUNCION",
  "isFunction": true,
  "params": [...]
}
```

Esto genera la llamada: `BEGIN :1 := "WORKFLOW"."MI_FUNCION"(...); END;`

**Problema común:** Oracle puede interpretar `ESQUEMA.FUNCIÓN` como `PAQUETE.FUNCIÓN`, causando error PLS-00302.

**Soluciones alternativas:**

1. **Crear sinónimo**:
   ```sql
   CREATE SYNONYM MI_FUNCION FOR ESQUEMA.MI_FUNCION;
   ```
   Luego llamar: `"name": "MI_FUNCION"`

2. **Otorgar permisos de ejecución**:
   ```sql
   GRANT EXECUTE ON ESQUEMA.MI_FUNCION TO MI_USUARIO;
   ```

3. **Usar el esquema del objeto directamente** (conectarse como ese usuario)

Ver `sql/fix_cross_schema_access.sql` para más detalles.

---

### 5. `/upload`
- **Método:** POST (multipart/form-data)
- **Descripción:** Sube un archivo a la base de datos como BLOB.
- **Prueba:**
  ```bash
  curl -X POST -H "Authorization: Bearer <API_TOKEN>" -F "file=@archivo_prueba.txt" \
    -F "descripcion=Archivo de prueba" http://localhost:8080/upload
  ```

### 6. `/logs`
- **Método:** GET
- **Descripción:** Devuelve el contenido del log del microservicio.
- **Prueba:**
  ```bash
  curl -H "Authorization: Bearer <API_TOKEN>" http://localhost:8080/logs
  ```

## Prueba automática completa

Puedes usar los scripts de prueba disponibles:

```bash
# Test rápido de conectividad
node scripts/test_quick.js

# Test completo de funcionalidad asíncrona
node scripts/test_async.js

# Test de persistencia (crear job y verificar en BD)
node scripts/test_persistencia.js
```

Asegúrate de tener configurado el archivo `.env` y el microservicio en ejecución.

## Integración Frontend (JavaScript/Fetch)

### Ejemplo: Llamada desde aplicación web
```javascript
// Función de paquete
async function buscarPersona(dni) {
  const response = await fetch('http://localhost:8080/procedure', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + API_TOKEN
    },
    body: JSON.stringify({
      name: 'usuario.TRANSFORMADOR.BUSCA_PERSONA',
      isFunction: true,
      params: [
        { name: 'vDNI', value: dni },
        { name: 'resultado', direction: 'OUT' }
      ]
    })
  });
  
  const data = await response.json();
  return data.out?.resultado;
}

// Consulta multilínea
async function consultarDatos(fecha) {
  const response = await fetch('http://localhost:8080/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + API_TOKEN
    },
    body: JSON.stringify({
      query: `SELECT dni, nombre, apellido
               FROM personas 
               WHERE fecha_nacimiento >= '${fecha}'
               ORDER BY apellido, nombre`
    })
  });
  
  const data = await response.json();
  return data.results;
}
```

### Manejo de errores
```javascript
async function ejecutarProcedimiento(datos) {
  try {
    const response = await fetch('http://localhost:8080/procedure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_TOKEN
      },
      body: JSON.stringify(datos)
    });
    
    const result = await response.json();
    
    if (result.error) {
      console.error('Error en Oracle:', result.error);
      return null;
    }
    
    return result.out || result.results;
  } catch (error) {
    console.error('Error de conexión:', error);
    return null;
  }
}
```

---

**Nota:** Cambia `<API_TOKEN>` por el token real configurado en tu `.env`.

Para más ejemplos y scripts de prueba, revisa la carpeta `scripts/` y el archivo `scripts/README_TESTS.md`.
