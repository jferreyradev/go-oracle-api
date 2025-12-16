# 🎨 Frontend - Proxy Tester

Interfaz web para probar el proxy de go-oracle-api.

## 🚀 Uso

1. **Abre index.html en tu navegador:**
   ```bash
   # Windows
   start index.html
   
   # macOS
   open index.html
   
   # Linux
   xdg-open index.html
   ```

2. **Asegúrate que el proxy esté corriendo:**
   ```bash
   cd ..
   deno run --allow-net --allow-env proxy.ts --port 8000
   ```

3. **Haz login con uno de los usuarios:**
   - **admin** / admin123 (acceso total)
   - **user** / user123 (acceso total)
   - **demo** / demo (solo lectura)

4. **Prueba los endpoints** con los botones o crea requests personalizados

## ✨ Características

### 🔑 Panel de Autenticación
- Campo configurable para URL del proxy
- Login manual con usuario/password
- **Quick Login** con 3 botones (admin, user, demo)
- Tabla de usuarios disponibles
- Muestra token activo y estado

### 🚀 Endpoints Pre-configurados
8 botones para probar rápidamente:
- **Ping** - Verificar conexión
- **Query** - Consulta SQL (`SELECT SYSDATE FROM DUAL`)
- **Procedure** - Procedimiento de prueba
- **Async Job** - Crear job asíncrono (3 segundos)
- **List Jobs** - Listar todos los jobs
- **Logs** - Ver logs de consultas
- **Stats** - Estadísticas del proxy
- **Users** - Ver usuarios disponibles

### 📝 Custom Request
- Selector de método (GET, POST, DELETE, PUT)
- Campo para endpoint personalizado
- Editor de JSON para el body
- Envío de cualquier petición

### 📊 Panel de Respuesta
- JSON formateado y coloreado
- Verde para respuestas exitosas
- Rojo para errores
- Auto-scroll para respuestas largas

### 💾 Persistencia
- Token guardado en localStorage
- URL del proxy persistente
- Estado mantiene al recargar

## 🎯 Workflow Típico

1. **Login** → Click en "Admin" para acceso rápido
2. **Test básico** → Click en "Ping" para verificar
3. **Query** → Click en "Query" para consulta de prueba
4. **Job asíncrono** → Click en "Async Job" → espera 3 seg → "List Jobs"
5. **Custom** → Escribe tu propio endpoint y prueba

## 🔧 Configuración

Por defecto el frontend apunta a `http://localhost:8000`. Para cambiar:

1. Modifica el campo "URL del Proxy" en el panel de autenticación
2. La nueva URL se guarda automáticamente en localStorage

## 🐛 Debugging

Abre la consola del navegador (F12) para ver:
- Logs de todas las peticiones
- Detalles de respuestas
- Errores de red
- Estados de autenticación

## 📱 Responsive

El frontend es responsive y funciona en:
- ✅ Desktop (Chrome, Firefox, Edge, Safari)
- ✅ Tablets
- ✅ Móviles (pantallas pequeñas: layout de 1 columna)

## 🎨 Tecnologías

- **HTML5** puro (no requiere bundler)
- **CSS3** con gradientes y animaciones
- **JavaScript** vanilla (no frameworks)
- **Fetch API** para peticiones HTTP
- **LocalStorage** para persistencia

## 🔒 Seguridad

⚠️ **Nota:** Este frontend es para desarrollo y testing únicamente.

- No valida inputs del lado del cliente
- Credenciales visibles en código fuente
- Sin protección contra XSS
- CORS abierto (`*`)

Para producción, implementa:
- Validación de inputs
- Almacenamiento seguro de credenciales
- Sanitización de HTML
- CORS específico
- HTTPS obligatorio

---

**Ubicación:** `proxy/frontend/index.html`  
**Documentación del proxy:** `proxy/README.md`
