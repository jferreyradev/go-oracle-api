# Go Oracle API Microservicio

Este microservicio en Go expone endpoints HTTP para consultar y modificar una base de datos Oracle, pensado como puente entre Oracle y otras APIs.

## Resumen

En muchos entornos de desarrollo, diferentes aplicaciones necesitan acceder a datos almacenados en bases de datos Oracle. Sin embargo, integrar directamente con Oracle suele requerir la instalación de drivers o librerías específicos en cada entorno, lo que complica la interoperabilidad y el despliegue.

Este microservicio resuelve ese problema actuando como un puente seguro y ligero entre una base de datos Oracle y otras aplicaciones, exponiendo endpoints HTTP para consultas y modificaciones. Así, cualquier sistema capaz de realizar peticiones HTTP/JSON puede interactuar con Oracle sin necesidad de instalar librerías, drivers ni configuraciones adicionales de Oracle en el cliente.

## Ventajas principales
- Acceso centralizado a Oracle mediante HTTP.
- No requiere que los sistemas consumidores instalen librerías de Oracle.
- Permite la integración de APIs y servicios hechos en cualquier lenguaje o framework.
- Permite operaciones de consulta y modificación (SELECT, INSERT, UPDATE, DELETE) a través de una API REST.
- **Soporte completo para procedimientos y funciones de paquetes Oracle**.
- **Detección automática de tipos de datos** para parámetros OUT (NUMBER, VARCHAR2).
- **Manejo inteligente de fechas** con conversión automática desde formatos estándar.
- **Consultas multilínea** con normalización automática de saltos de línea.
- Facilita la integración de sistemas modernos (microservicios, aplicaciones web/móviles, otros servicios) con bases de datos Oracle.
- Seguridad mediante autenticación de token y restricción opcional por IP.
- **CORS configurado** para integración desde aplicaciones web frontend.
- Reduce el riesgo de exposición de credenciales o la base de datos a múltiples sistemas.

## Configuración del archivo `.env`

Consulta la guía completa para crear y configurar el archivo de entorno en [`docs/CONFIGURACION_ENV.md`](docs/CONFIGURACION_ENV.md).

## Ejecución

Puedes ejecutar el microservicio de dos formas:

### 1. Desde Go (modo desarrollo)

```sh
go run main.go [archivo_env] [puerto]
```
- `archivo_env` (opcional): Archivo de variables de entorno (por defecto `.env`).
- `puerto` (opcional): Puerto donde escuchará la API (por defecto `8080`).

Ejemplos:
```sh
go run main.go
# o con archivo y puerto personalizados
go run main.go otro.env 9090
```

### 2. Como ejecutable compilado

Primero compila el binario:
```sh
go build -o go-oracle-api.exe main.go
```
Luego ejecútalo:
```sh
./go-oracle-api.exe [archivo_env] [puerto]
```

También puedes usar variables de entorno:
- `ENV_FILE` para el archivo de configuración
- `PORT` para el puerto

Ejemplo:
```sh
set ENV_FILE=otro.env
set PORT=9090
./go-oracle-api.exe
```

## Opciones de ejecución
- Si no se especifica archivo de entorno ni puerto, se usan `.env` y `8080` por defecto.
- Puedes combinar argumentos y variables de entorno según tu preferencia.

### Ejecutar varias instancias con diferentes configuraciones

Puedes tener varios archivos `.env` (por ejemplo, `.env1`, `.env2`, etc.) y ejecutar varias instancias de la app, cada una con su propio archivo y puerto:

```sh
start go run main.go .env1 8081
start go run main.go .env2 8082
```
O con ejecutable:
```sh
start go-oracle-api.exe .env1 8081
start go-oracle-api.exe .env2 8082
```

Cada instancia usará su propia configuración y escuchará en el puerto indicado.

## Endpoints disponibles

- **`/ping`** - Verificación de estado y conectividad con Oracle
- **`/query`** - Ejecutar consultas SELECT (soporta multilínea)
- **`/exec`** - Ejecutar sentencias de modificación (INSERT, UPDATE, DELETE, DDL)
- **`/procedure`** - Ejecutar procedimientos y funciones de paquetes Oracle
- **`/upload`** - Subir archivos como BLOB a la base de datos
- **`/logs`** - Consultar logs de la API
- **`/docs`** - Documentación integrada

## Funcionalidades destacadas

### 🔧 Procedimientos y Funciones de Paquetes
```json
{
  "name": "SCHEMA.PACKAGE.FUNCTION_NAME",
  "isFunction": true,
  "params": [
    { "name": "input_param", "value": 123 },
    { "name": "result", "direction": "OUT", "type": "number" }
  ]
}
```

### 📅 Manejo Automático de Fechas
```json
{
  "name": "MY_PROCEDURE", 
  "params": [
    { "name": "fecha_param", "value": "2025-10-21" },
    { "name": "periodo", "value": "21/10/2025" }
  ]
}
```

### 📝 Consultas Multilínea
```json
{
  "query": "SELECT campo1, campo2\nFROM mi_tabla\nWHERE condicion = 'valor'"
}
```

## Documentación

- **[USO_Y_PRUEBAS.md](docs/USO_Y_PRUEBAS.md)** - Guía completa de uso y ejemplos
- **[FUNCIONALIDADES_AVANZADAS.md](docs/FUNCIONALIDADES_AVANZADAS.md)** - Funcionalidades avanzadas y buenas prácticas
- **[CONFIGURACION_ENV.md](docs/CONFIGURACION_ENV.md)** - Configuración del archivo de entorno
- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Instrucciones de despliegue
- **[FIREWALL_WINDOWS.md](docs/FIREWALL_WINDOWS.md)** - Configuración de firewall en Windows

---

## Créditos y autoría

Este proyecto fue desarrollado en colaboración entre [jferreyradev](https://github.com/jferreyradev/jferreyradev) y GitHub Copilot, combinando experiencia humana y asistencia de IA para lograr una solución robusta y documentada.

## Licencia
MIT

