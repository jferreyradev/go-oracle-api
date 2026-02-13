# Frontend para Go Oracle API

Este directorio contiene el frontend web para probar y usar la API de Oracle.

## Características

- ✅ Interfaz gráfica moderna y responsiva
- ✅ Soporte para todos los endpoints de la API
- ✅ Ejemplos predefinidos para cada tipo de operación
- ✅ Editor de JSON con syntax highlighting
- ✅ Visualización de respuestas formateadas
- ✅ Almacenamiento local de configuración (URL y Token)
- ✅ Sin dependencias externas (HTML, CSS, JavaScript puro)

## Uso

1. Asegúrate de que el servidor Go esté ejecutándose:
   ```bash
   go run main.go
   ```

2. Abre tu navegador en:
   ```
   http://localhost:8080
   ```

3. Configura tu token de API en la sección de configuración

4. Selecciona un endpoint y prueba la API

## Endpoints soportados

- **GET /ping** - Verificar conectividad con Oracle
- **POST /query** - Ejecutar consultas SELECT
- **POST /exec** - Ejecutar INSERT, UPDATE, DELETE, DDL
- **POST /procedure** - Ejecutar procedimientos y funciones
- **POST /procedure/async** - Ejecutar procedimientos asíncronos
- **GET /jobs** - Listar jobs asíncronos

## Personalización

El frontend utiliza localStorage para guardar:
- URL de la API
- Token de autorización

Estos valores se mantienen entre sesiones del navegador.
