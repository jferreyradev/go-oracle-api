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
