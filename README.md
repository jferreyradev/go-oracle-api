# Go Oracle API Microservicio

Este microservicio en Go expone endpoints HTTP para consultar y modificar una base de datos Oracle, pensado como puente entre Oracle y otras APIs.

## Requisitos
- Go 1.18+
- Acceso a una base de datos Oracle

## Instalación
1. Clona el repositorio o copia los archivos en tu proyecto.
2. Instala las dependencias:
   ```sh
   go mod tidy
   ```
3. Crea un archivo `.env` en la raíz con el siguiente contenido:
   ```env
   ORACLE_USER=usuario
   ORACLE_PASSWORD=contraseña
   ORACLE_HOST=localhost
   ORACLE_PORT=1521
   ORACLE_SERVICE=servicio_o_sid
   API_TOKEN=tu_token_seguro
   ```

## Configuración de IPs permitidas

Puedes restringir el acceso solo a ciertas IPs agregando en tu `.env`:

```
API_ALLOWED_IPS=192.168.1.10,192.168.1.20
```

Si la variable está vacía, cualquier IP puede acceder (solo con el token).

## Uso
1. Inicia el microservicio:
   ```sh
   go run main.go
   ```
2. Los endpoints estarán disponibles en `http://localhost:8080`.

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
