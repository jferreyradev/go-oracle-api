# Guía para crear el archivo `.env` en Go Oracle API

El archivo `.env` contiene las variables de entorno necesarias para que el microservicio se conecte a Oracle y controle la seguridad de acceso.

## Ejemplo básico de `.env`

```
# --- Conexión a Oracle ---
ORACLE_USER=usuario
ORACLE_PASSWORD=contraseña
ORACLE_HOST=localhost
ORACLE_PORT=1521
ORACLE_SERVICE=servicio_o_sid

# --- Seguridad API ---
API_TOKEN=tu_token_seguro

# --- IPs permitidas ---
# Puedes poner IPs exactas, rangos CIDR, o 'localhost'.
# Ejemplo: 192.168.1.10,192.168.1.0/24,127.0.0.1,::1,localhost
API_ALLOWED_IPS=127.0.0.1,::1,192.168.1.0/24,localhost

# --- Puerto de escucha ---
PORT=8080

# --- Desactivar autenticación y restricción de IPs (solo para pruebas) ---
# Si es 1, desactiva autenticación y restricción de IPs (NO usar en producción)
API_NO_AUTH=0
```

## Explicación de cada variable

- **ORACLE_USER**: Usuario de la base de datos Oracle.
- **ORACLE_PASSWORD**: Contraseña del usuario Oracle.
- **ORACLE_HOST**: Host/IP del servidor Oracle.
- **ORACLE_PORT**: Puerto de Oracle (por defecto 1521).
- **ORACLE_SERVICE**: Nombre del servicio o SID de Oracle.
- **API_TOKEN**: Token que debe enviarse en el header Authorization (Bearer).
- **API_ALLOWED_IPS**: Lista separada por comas de IPs permitidas. Puedes usar rangos CIDR (ejemplo: 192.168.1.0/24), IPs exactas, o 'localhost'.
  - Para aceptar cualquier IP de una red, usa el formato CIDR. Ejemplo: `192.168.1.0/24` permite todas las IPs desde 192.168.1.1 hasta 192.168.1.254.
  - Puedes agregar varios rangos separados por coma: `192.168.1.0/24,10.0.0.0/16`
  - Si dejas `API_ALLOWED_IPS` vacío, se permiten todas las IPs (sin restricción).
- **PORT**: Puerto donde escuchará la API.
- **API_NO_AUTH**: Si es 1, desactiva autenticación y restricción de IPs (solo para pruebas).

## Recomendaciones
- No compartas el archivo `.env` real ni lo subas al repositorio.
- Usa `.env.example` como plantilla para otros entornos.
- Cambia el token y las credenciales en cada entorno.
- Para producción, mantén la autenticación y restricción de IPs activas.

---

Para más detalles, revisa la documentación en README.md y USO_Y_PRUEBAS.md.
