# 📚 Documentación del Proxy Server

Documentación completa del proxy server para go-oracle-api.

---

## 📑 Tabla de Contenidos

### 🔐 Autenticación
**[PROXY_AUTH.md](PROXY_AUTH.md)**  
Sistema completo de autenticación con tokens:
- Usuarios y roles (admin, user, readonly)
- Flujo de login/logout
- Gestión de sesiones (24h duración, 2h inactividad)
- Ejemplos de uso con curl y JavaScript
- Seguridad y mejores prácticas

### 🎨 Frontend Web
**[FRONTEND.md](FRONTEND.md)**  
Interfaz web para testing del proxy:
- Características del frontend
- Workflow típico de uso
- Endpoints pre-configurados
- Custom requests
- Debugging y troubleshooting
- Tecnologías utilizadas

---

## 🚀 Quick Links

### Para empezar
1. Lee el [README principal](../README.md) para iniciar el proxy
2. Revisa [PROXY_AUTH.md](PROXY_AUTH.md) para entender la autenticación
3. Abre [frontend/index.html](../frontend/index.html) para probar con la interfaz web

### Para desarrolladores
- **API Reference**: Ver [PROXY_AUTH.md](PROXY_AUTH.md) - Sección "Endpoints"
- **Tests**: Ver carpeta [tests/](../tests/)
- **Código fuente**: [proxy.ts](../proxy.ts)

### Documentación del proyecto
- **Guía rápida del proyecto**: [../../GUIA_RAPIDA.md](../../GUIA_RAPIDA.md)
- **Sistema de Jobs**: [../../docs/ASYNC_JOBS.md](../../docs/ASYNC_JOBS.md)
- **Uso de la API**: [../../docs/USO_Y_PRUEBAS.md](../../docs/USO_Y_PRUEBAS.md)

---

## 🎯 Casos de Uso Comunes

### 1. Testing Rápido
```bash
# Iniciar proxy
cd proxy
deno run --allow-net --allow-env proxy.ts

# Abrir frontend
start frontend/index.html  # Windows
```

### 2. Integración en Aplicación Web
Ver ejemplos en [PROXY_AUTH.md](PROXY_AUTH.md) - Sección "Ejemplos de Integración"

### 3. Automatización con Scripts
Ver tests en [tests/](../tests/) para ejemplos de automatización

---

## 🔧 Características Técnicas

### Autenticación
- ✅ Token-based (JWT-like)
- ✅ Sesiones con expiración configurable
- ✅ 3 roles: admin, user, readonly
- ✅ Protección contra inactividad
- ✅ Limpieza automática de sesiones expiradas

### Proxy
- ✅ Transparente (reenvía todas las requests)
- ✅ Agrega automáticamente token del backend
- ✅ CORS configurado
- ✅ Rate limiting (100 req/min)
- ✅ Logging colorizado
- ✅ Estadísticas en tiempo real

### Frontend
- ✅ HTML/CSS/JS puro (no requiere build)
- ✅ Responsive (móvil, tablet, desktop)
- ✅ LocalStorage para persistencia
- ✅ 8 endpoints pre-configurados
- ✅ Editor de requests personalizados

---

## 📊 Estadísticas

El proxy provee estadísticas en tiempo real:

```bash
curl http://localhost:8000/_proxy/stats
```

Incluye:
- Total de requests (éxitos/errores)
- Top 10 endpoints más usados
- Estadísticas de autenticación
- Sesiones activas
- Rate limits activos

---

## 🐛 Troubleshooting

### Problemas comunes

**Error: "Token requerido"**
- Solución: Hacer login primero en `/login`

**Error: "Token expirado"**
- Solución: Las sesiones expiran después de 24h o 2h de inactividad

**Error: "Forbidden (403)"**
- Solución: Usuario `demo` (readonly) no puede hacer POST/DELETE/PUT

**Error: "Cannot connect to backend"**
- Solución: Verificar que el backend esté corriendo en puerto 3000

Ver más en [PROXY_AUTH.md](PROXY_AUTH.md) - Sección "Solución de Problemas"

---

## 🤝 Contribuir

Para mejorar la documentación:

1. **PROXY_AUTH.md**: Agregar ejemplos de integración
2. **FRONTEND.md**: Documentar nuevas características
3. **README.md**: Mantener actualizado con cambios

---

## 📝 Changelog

### v2.0 (16 dic 2024)
- ✅ Sistema de autenticación implementado
- ✅ Frontend web creado
- ✅ Documentación completa
- ✅ Tests organizados en carpeta dedicada
- ✅ CORS mejorado con preflight

### v1.0
- ✅ Proxy básico funcional
- ✅ Rate limiting
- ✅ Logging

---

**Última actualización:** 16 de diciembre de 2024  
**Versión:** 2.0
