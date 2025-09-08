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
- **Método:** GET o POST
- **Descripción:** Ejecuta una consulta simple a Oracle (ejemplo: `SELECT sysdate FROM dual`).
- **Prueba:**
  ```bash
  curl -X POST -H "Authorization: Bearer <API_TOKEN>" -H "Content-Type: application/json" \
    -d '{"query": "SELECT sysdate FROM dual"}' http://localhost:8080/exec
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
- **Descripción:** Ejecuta procedimientos almacenados con parámetros IN y OUT.
- **Prueba (suma_simple):**
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

## Pruebas automáticas

Puedes usar el script `test_todo.js` para probar todos los endpoints automáticamente:

```bash
node test_todo.js
```

Asegúrate de tener configurado el archivo `.env` y el microservicio en ejecución.

---

**Nota:** Cambia `<API_TOKEN>` por el token real configurado en tu `.env`.

Para más ejemplos y detalles, revisa el archivo `test_todo.js` y el README principal.
