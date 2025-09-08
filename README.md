

# Go Oracle API Microservicio

Este microservicio en Go expone endpoints HTTP para consultar y modificar una base de datos Oracle, pensado como puente entre Oracle y otras APIs.

## ¿Qué problema soluciona este microservicio?

En muchos entornos de desarrollo, diferentes aplicaciones necesitan acceder a datos almacenados en bases de datos Oracle. Sin embargo, integrar directamente con Oracle suele requerir la instalación de drivers o librerías específicos en cada entorno, lo que complica la interoperabilidad y el despliegue.

Este microservicio resuelve ese problema actuando como un puente seguro y ligero entre una base de datos Oracle y otras aplicaciones, exponiendo endpoints HTTP para consultas y modificaciones. Así, cualquier sistema capaz de realizar peticiones HTTP/JSON puede interactuar con Oracle sin necesidad de instalar librerías, drivers ni configuraciones adicionales de Oracle en el cliente.

Además, permite la integración de APIs o servicios desarrollados en cualquier herramienta o lenguaje, ya que la comunicación se realiza mediante HTTP estándar, facilitando la interoperabilidad entre sistemas heterogéneos.

**Ventajas principales:**
- Acceso centralizado a Oracle mediante HTTP.
- No requiere que los sistemas consumidores instalen librerías de Oracle.
- Permite la integración de APIs y servicios hechos en cualquier lenguaje o framework.
- Permite operaciones de consulta y modificación (SELECT, INSERT, UPDATE, DELETE) a través de una API REST.
- Facilita la integración de sistemas modernos (microservicios, aplicaciones web/móviles, otros servicios) con bases de datos Oracle.
- Seguridad mediante autenticación de token y restricción opcional por IP.
- Reduce el riesgo de exposición de credenciales o la base de datos a múltiples sistemas.

En resumen, este microservicio facilita la interoperabilidad y modernización de sistemas que dependen de Oracle, proporcionando una capa de acceso API que puede ser utilizada por cualquier tecnología capaz de realizar peticiones HTTP.

## Requisitos
- Go 1.18+
- Acceso a una base de datos Oracle

## Instalación
1. Clona el repositorio o copia los archivos en tu proyecto.
2. Instala las dependencias:
    ```sh
    go mod tidy
    ```

3. Copia el archivo `.env.example` como `.env` y edítalo con tus valores:
   ```sh
   cp .env.example .env
   # o copia manualmente el contenido
   ```
    
   Explicación de variables principales:
   - `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_HOST`, `ORACLE_PORT`, `ORACLE_SERVICE`: Datos de conexión a Oracle.
   - `API_TOKEN`: Token requerido en el header Authorization para acceder a la API.
   - `API_ALLOWED_IPS`: Lista de IPs permitidas (vacío = todas). Ejemplo: `192.168.1.10,192.168.1.20`
   - `PORT`: Puerto donde escuchará el microservicio (por defecto 8080).
   - `ENV_FILE`: Permite especificar otro archivo de variables de entorno.
   - `API_NO_AUTH`: Si es `1`, desactiva autenticación y restricción de IPs (solo para pruebas).

   Consulta y edita `.env.example` para ver todas las opciones y recomendaciones.


## Seguridad y pruebas

- Por defecto, la API requiere el token y solo permite las IPs configuradas en `API_ALLOWED_IPS`.
- Para pruebas rápidas, puedes desactivar la autenticación y restricción de IPs con `API_NO_AUTH=1` en tu `.env` (no recomendado en producción).
- Si la variable `API_ALLOWED_IPS` está vacía, cualquier IP puede acceder (solo con el token).

## Uso

1. Inicia el microservicio:
      ```sh
      go run main.go
      ```
    
      Puedes indicar el archivo de variables de entorno y el puerto de escucha de varias formas:
      - Archivo .env por argumento:
         ```sh
         go run main.go otro.env
         ```
      - Puerto por argumento (después del archivo .env):
         ```sh
         go run main.go otro.env 9090
         ```
      - Por variable de entorno:
         ```sh
         set ENV_FILE=otro.env
         set PORT=9090
         go run main.go
         ```
      - Por defecto: Si no especificas nada, se usará `.env` y el puerto 8080.


2. Al iniciar, el microservicio mostrará en consola todas las IPs locales y el puerto donde está escuchando, por ejemplo:
   ```
   Microservicio escuchando en http://192.168.1.100:8080
   Microservicio escuchando en http://10.0.0.5:8080
   Microservicio escuchando en http://0.0.0.0:8080
   ```
   Usa la IP correspondiente según tu red para acceder desde otros equipos.


### Endpoints
- `GET /ping` — Verifica la salud del servicio.
- `GET /query` — Ejecuta un ejemplo de consulta (`SELECT sysdate FROM dual`).
- `POST /exec` — Ejecuta una consulta enviada en el cuerpo (JSON):
   ```json
   {
      "query": "SELECT * FROM tu_tabla"
   }
   ```
   - Para `INSERT`, `UPDATE` o `DELETE`, devuelve `{ "rows_affected": n }`.
   - Para `SELECT`, devuelve un array de objetos JSON.

- `POST /procedure` — Ejecuta un procedimiento almacenado Oracle con parámetros IN/OUT:
   ```json
   {
      "name": "NOMBRE_PROCEDIMIENTO",
      "params": [
         { "name": "param1", "value": "valor", "direction": "IN" },
         { "name": "param2", "direction": "OUT" }
      ]
   }
   ```
   - Devuelve los parámetros OUT en el campo `out`.

- `POST /upload` — Sube un archivo grande a Oracle como BLOB (requiere tabla `archivos`).
   - Content-Type: `multipart/form-data`
   - Campos:
      - `file`: archivo a subir
      - `descripcion`: texto opcional
   - Respuesta:
      ```json
      { "status": "ok", "nombre": "archivo.txt" }
      ```
   - Ejemplo de tabla:
      ```sql
      CREATE TABLE archivos (
         id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
         nombre VARCHAR2(255),
         descripcion VARCHAR2(4000),
         contenido BLOB
      );
      ```

#### Pruebas de endpoints avanzados

- Prueba de `/procedure`: ver `test-procedure.ts` y `PRUEBA_PROCEDURE_TS.md`.
- Prueba de `/upload`: ver `test-upload.ts` y `PRUEBA_UPLOAD_TS.md`.



#### Autenticación
Todos los endpoints requieren el header:
```
Authorization: Bearer <API_TOKEN>
```

## Pruebas
Puedes ejecutar los tests locales y remotos con:
```sh
go test
```

- Para test remoto, define la variable de entorno `API_REMOTE_HOST` (ejemplo: `http://192.168.1.100:8080`).

## Notas de seguridad
- El endpoint `/exec` ejecuta SQL recibido, úsalo solo en entornos controlados.
- No expongas este microservicio a internet sin protección adicional.
- Usa la variable `API_ALLOWED_IPS` para restringir el acceso solo a IPs de confianza.

## Créditos y autoría

Este proyecto fue desarrollado y verificado por [jferreyradev](https://github.com/jferreyradev/jferreyradev) , con ayuda de GitHub Copilot para la generación y revisión de código.

## Licencia
MIT

