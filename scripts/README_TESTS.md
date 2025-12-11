# Tests de Procedimientos Asíncronos

Scripts compatibles con **Deno, Bun y Node.js**.

## Scripts Disponibles

### Tests
- **`test_quick.js`** - ⚡ Test rápido de conectividad (30 seg)
- **`test_async.js`** - Tests completos de endpoints asíncronos
- **`test_demora.js`** - Demo con procedimiento de larga duración
- **`test_persistencia.js`** - Verifica persistencia en Oracle

### Utilidades
- **`view_jobs.js`** - 📊 Visualiza todos los jobs en tabla

## Ejecutar Tests

```bash
# Test rápido (recomendado primero)
deno run --allow-net scripts/test_quick.js

# Ver todos los jobs
deno run --allow-net scripts/view_jobs.js

# Tests completos
deno run --allow-net scripts/test_async.js

# Demo con delays
deno run --allow-net scripts/test_demora.js

# Test de persistencia
deno run --allow-net scripts/test_persistencia.js
```

### Con otros runtimes

```bash
# Con Bun
bun scripts/test_quick.js

# Con Node.js (18+)
node scripts/test_quick.js
```

## Instalar Runtimes

### Deno (Windows)
```powershell
irm https://deno.land/install.ps1 | iex
```

### Bun (Windows)
```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

### Node.js
Descargar desde: https://nodejs.org/

## Configuración

Edita los scripts si usas diferente URL o token:

```javascript
const API_BASE = 'http://10.6.150.91:3000';  // Cambiar aquí
const TOKEN = 'test1';                        // Tu token
```

## Troubleshooting

**"Connection refused"** → API no está corriendo
```bash
.\go-oracle-api.exe
```

**"fetch is not defined"** (Node.js) → Actualizar a Node.js 18+
```bash
node --version  # Debe ser v18+
```

**"Deno command not found"** → Agregar al PATH o reinstalar
```powershell
$env:Path += ";$HOME\.deno\bin"
```

**Firewall bloquea** → Ver `docs/FIREWALL_WINDOWS.md`


const API_TOKEN = 'test1';                   // Cambiar aquí
```

## 🎉 Recomendación

**Para desarrollo rápido:** Usa **Bun** (más rápido)  
**Para producción/CI:** Usa **Deno** (más seguro)  
**Para compatibilidad:** Usa **Node.js** (más común)

---

**Todos funcionan igual, elige el que prefieras!** 🚀
