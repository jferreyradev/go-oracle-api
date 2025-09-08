## 8. Especificar el puerto del microservicio

Puedes indicar el puerto de escucha de tres formas:

- **Por variable de entorno:**
  ```sh
  set PORT=9090 && go run main.go
  ```
- **Por argumento (después del archivo .env):**
  ```sh
  go run main.go otro.env 9090
  ```
- **Por defecto:**
  Si no especificas nada, usará el puerto 8080.
## 7. Especificar el archivo .env a usar

Puedes indicar qué archivo de variables de entorno usar de dos formas:

- **Por argumento al ejecutar:**
  
  ```sh
  bun run main.ts otro.env
  # o
  deno run --allow-net main.ts otro.env
  # o
  go run main.go otro.env
  ```

- **Por variable de entorno:**
  
  ```sh
  set ENV_FILE=otro.env && go run main.go
  ```

Si no especificas nada, se usará `.env` por defecto.
# Prueba de ejecución del endpoint /procedure con TypeScript

Este documento describe cómo probar el endpoint `/procedure` de la API Go usando un script TypeScript compatible con Bun, Deno o Node.js.

## 1. Requisitos
- Tener el servicio Go corriendo en `localhost:8080`.
- Tener Bun, Deno o Node.js (v18+) instalado.
- Tener el archivo `test-procedure.ts` en el proyecto.
- (Opcional) Tener el token de autenticación si tu API lo requiere.

## 2. Crear el procedimiento de prueba en Oracle
Puedes crear el procedimiento usando el endpoint `/exec` o directamente en tu base de datos:

```sql
CREATE OR REPLACE PROCEDURE prueba_api(p_nombre IN VARCHAR2, p_result OUT VARCHAR2) AS
BEGIN
  p_result := 'Hola, ' || p_nombre;
END;
```

O usando el endpoint `/exec`:

```json
{
  "query": "CREATE OR REPLACE PROCEDURE prueba_api(p_nombre IN VARCHAR2, p_result OUT VARCHAR2) AS BEGIN p_result := 'Hola, ' || p_nombre; END;"
}
```

## 3. Editar el archivo `test-procedure.ts`
- Cambia el valor de `token` por tu API_TOKEN si es necesario.
- Asegúrate de que la URL apunte a tu servicio.

## 4. Ejecutar el script

### Con Bun
```sh
bun run test-procedure.ts
```

### Con Deno
```sh
deno run --allow-net test-procedure.ts
```

### Con Node.js (v18+)
```sh
node test-procedure.ts
```

## 5. Ejemplo de salida esperada

```json
{
  "status": "ok",
  "out": {
    "p_result": "Hola, Mundo"
  }
}
```

## 6. Eliminar el procedimiento de prueba
Puedes eliminar el procedimiento con:

```json
{
  "query": "DROP PROCEDURE prueba_api"
}
```

---

¿Dudas o problemas? Revisa el log del servicio Go y la respuesta del script para depuración.
