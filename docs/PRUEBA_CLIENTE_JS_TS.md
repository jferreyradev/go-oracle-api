# Prueba de la API Go Oracle desde JavaScript/TypeScript

Este documento explica cómo probar todos los endpoints principales del microservicio Go Oracle API usando los archivos `ejemplo-cliente.js` y `ejemplo-cliente.ts`.

## Requisitos
- Node.js v18+ (recomendado para JS)
- O puedes usar Bun o Deno (ajusta la lectura de archivos en el script si lo necesitas)
- Tener el microservicio Go Oracle API corriendo y accesible
- Un archivo de prueba para subir (por ejemplo, `archivo_prueba.txt`)

## Configuración
1. Copia el archivo `ejemplo-cliente.js` o `ejemplo-cliente.ts` a tu proyecto o carpeta de pruebas.
2. Edita las siguientes variables al inicio del archivo:
   - `API_URL`: URL base de tu microservicio (ejemplo: `http://localhost:8080` o la IP de tu servidor)
   - `API_TOKEN`: El token configurado en tu `.env`
   - (Opcional) Cambia la ruta del archivo a subir en la función `upload()`

## Ejecución en Node.js

1. Asegúrate de tener Node.js v18 o superior.
2. Ejecuta el script:
   ```sh
   node ejemplo-cliente.js
   ```
   Si usas TypeScript:
   ```sh
   npx tsx ejemplo-cliente.ts
   # o
   npx ts-node ejemplo-cliente.ts
   ```

## ¿Qué hace cada función?
- `ping()`: Prueba el endpoint `/ping` para verificar que el microservicio responde.
- `query()`: Envía una consulta SQL simple al endpoint `/exec`.
- `procedure()`: Llama a un procedimiento almacenado (ajusta el nombre y parámetros según tu base de datos).
- `upload()`: Sube un archivo como BLOB al endpoint `/upload`.

## Notas
- Si usas Bun o Deno, ajusta la sección de lectura de archivos en el script según la documentación de esos entornos.
- El script imprime en consola la respuesta de cada endpoint.
- Si algún endpoint falla, revisa el mensaje de error y asegúrate de que el microservicio esté corriendo y accesible.

## Personalización
- Puedes comentar o descomentar las llamadas en la función `main()` para probar solo los endpoints que desees.
- Para pruebas avanzadas, modifica los parámetros de las funciones según tus necesidades.

---

¿Dudas? Consulta el README del proyecto o abre un issue.
