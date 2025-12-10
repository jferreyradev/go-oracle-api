# Ejecutar Tests Asíncronos

El script `test_async.js` es **compatible con múltiples runtimes**.

## 🚀 Opciones de Ejecución

### Con Deno

```bash
deno run --allow-net scripts/test_async.js
```

**Ventajas:**
- ✅ No requiere instalación de dependencias
- ✅ Fetch nativo incluido
- ✅ Seguro por defecto (requiere permisos explícitos)

### Con Bun

```bash
bun scripts/test_async.js
```

**Ventajas:**
- ✅ Muy rápido
- ✅ Compatible con Node.js
- ✅ Fetch nativo incluido

### Con Node.js

```bash
node scripts/test_async.js
```

**Requisitos:**
- Node.js 18+ (para fetch nativo)

## 📋 Verificar Instalación

```bash
# Verificar Deno
deno --version

# Verificar Bun
bun --version

# Verificar Node.js
node --version
```

## 🔧 Instalación de Runtimes

### Instalar Deno (Windows)

```powershell
# Con Scoop
scoop install deno

# Con Chocolatey
choco install deno

# Manualmente
irm https://deno.land/install.ps1 | iex
```

### Instalar Bun (Windows)

```powershell
# Instalador de Bun
powershell -c "irm bun.sh/install.ps1|iex"
```

### Instalar Node.js (Windows)

Descarga desde: https://nodejs.org/

## 🎯 Ejemplo de Ejecución

```powershell
# Si tienes Deno
PS> deno run --allow-net scripts/test_async.js
============================================================
  PRUEBAS DE PROCEDIMIENTOS ASÍNCRONOS
============================================================

=== Creando procedimiento de prueba ===
✅ Procedimiento proc_largo creado

=== Test 1: Ejecución Asíncrona Básica ===
Iniciando procedimiento que tarda 10 segundos...
✅ Job iniciado: a8ee0dafa7cb668bc04be8c5489c7d52

Monitoreando progreso...
🔄 Estado: running     Progreso: 50%
🔄 Estado: running     Progreso: 80%
✅ Estado: completed   Progreso: 100%

🎉 Completado en 10.2s
   Resultado: { resultado: 1000 }
...
```

## ⚡ Comparación de Rendimiento

| Runtime | Velocidad Startup | Memoria | Compatibilidad |
|---------|-------------------|---------|----------------|
| Deno | ~100ms | ~20MB | ✅ Excelente |
| Bun | ~50ms | ~15MB | ✅ Excelente |
| Node.js | ~200ms | ~30MB | ✅ Excelente |

## 🐛 Troubleshooting

### Error: fetch is not defined (Node.js < 18)

**Solución:** Actualiza a Node.js 18+ o usa Deno/Bun

```bash
node --version  # Debe ser v18.0.0 o superior
```

### Error: Deno command not found

**Solución:** Instala Deno o agrega al PATH

```powershell
# Verificar instalación
deno --version

# Si no está instalado
irm https://deno.land/install.ps1 | iex

# Agregar al PATH
$env:Path += ";$HOME\.deno\bin"
```

### Error: Connection refused

**Solución:** Asegúrate de que la API esté corriendo

```bash
# En otra terminal
.\go-oracle-api.exe
```

## 📝 Configuración

Si tu API usa diferente URL o token, edita el script:

```javascript
const API_URL = 'http://10.6.150.91:3000';  // Cambiar aquí
const API_TOKEN = 'test1';                   // Cambiar aquí
```

## 🎉 Recomendación

**Para desarrollo rápido:** Usa **Bun** (más rápido)  
**Para producción/CI:** Usa **Deno** (más seguro)  
**Para compatibilidad:** Usa **Node.js** (más común)

---

**Todos funcionan igual, elige el que prefieras!** 🚀
