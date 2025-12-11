# Tests de Procedimientos Asíncronos

Scripts compatibles con **Deno, Bun y Node.js**.

## Scripts Disponibles

- **`test_async.js`** - Tests completos de endpoints asíncronos
- **`test_demora.js`** - Demo con procedimiento de larga duración
- **`test_persistencia.js`** - Verifica persistencia en Oracle

## Ejecutar Tests

```bash
# Con Deno (recomendado)
deno run --allow-net scripts/test_async.js

# Con Bun
bun scripts/test_async.js

# Con Node.js (18+)
node scripts/test_async.js
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
const API_BASE = 'http://127.0.0.1:3000';
const TOKEN = 'tu_token';
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

const API_TOKEN = 'test1';                   // Cambiar aquí
```

## 🎉 Recomendación

**Para desarrollo rápido:** Usa **Bun** (más rápido)  
**Para producción/CI:** Usa **Deno** (más seguro)  
**Para compatibilidad:** Usa **Node.js** (más común)

---

**Todos funcionan igual, elige el que prefieras!** 🚀
