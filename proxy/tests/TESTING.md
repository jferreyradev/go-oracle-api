# Testing del Proxy en Deno Deploy

## Ejecución Rápida

Una vez que tu proxy esté deployado en Deno Deploy, pruébalo con:

```bash
# Test básico
deno run --allow-net proxy/tests/test_deploy.ts https://tu-proxy.deno.dev

# Con output detallado
deno run --allow-net proxy/tests/test_deploy.ts https://tu-proxy.deno.dev --verbose
```

## Ejemplo Completo

```bash
# 1. Deployar en Deno Deploy (en dashboard)
# https://dash.deno.com → New Project → proxy-deploy.ts

# 2. Esperar a que esté listo (1-2 min)

# 3. Testear (reemplaza con tu URL real)
deno run --allow-net proxy/tests/test_deploy.ts https://my-proxy.deno.dev --verbose

# Output esperado:
# ✓ Health Check (45ms)
# ✓ Get Available Users (52ms)
# ✓ Login Success (admin) (68ms)
# ✓ Login Failure (bad password) (45ms)
# ✓ Request without token (should fail) (38ms)
# ... más tests
```

## Tests Incluidos

### 1. Health Check
- Verifica que el proxy está respondiendo
- Comprueba que tiene conexión con el backend

### 2. Usuarios y Autenticación
- Obtiene lista de usuarios disponibles
- Login exitoso
- Login con credenciales incorrectas
- Login con datos incompletos

### 3. Protección de Endpoints
- Request sin token → 401
- Request con token inválido → 401
- Request con token válido → acceso

### 4. Roles y Permisos
- Login con usuario readonly
- Estadísticas de autenticación

### 5. CORS
- Headers CORS presentes
- Preflight OPTIONS funciona

### 6. Logout
- Invalidar sesión
- Token usado después de logout → 401

### 7. Rate Limiting
- Verifica que el mecanismo está activo

### 8. Conectividad del Backend
- Verifica que el proxy puede alcanzar el backend

## Interpretación de Resultados

### ✓ Todos los tests pasaron
El proxy está **100% funcional** en Deno Deploy.

### ✗ Algunos tests fallaron

#### "Expected status 200, got 404"
- Backend no está disponible o ruta incorrecta
- Verifica `API_URL` en variables de entorno

#### "Expected status 200, got 401"
- Problema de autenticación
- Verifica `API_TOKEN` en variables de entorno

#### "Health status should be ok"
- Proxy no está respondiendo correctamente
- Revisa logs: `deno deploy logs --project=tu-proxy`

#### "CORS header should be present"
- Headers CORS no se están enviando
- Verifica que proxy-deploy.ts tiene configuración CORS

## Testing Manual con cURL

```bash
# Health check
curl https://tu-proxy.deno.dev/_proxy/health

# Usuarios
curl https://tu-proxy.deno.dev/_proxy/users

# Login
TOKEN=$(curl -s -X POST https://tu-proxy.deno.dev/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

echo "Token: $TOKEN"

# Usar token
curl https://tu-proxy.deno.dev/api/procedures \
  -H "Authorization: Bearer $TOKEN"

# Logout
curl -X POST https://tu-proxy.deno.dev/logout \
  -H "Authorization: Bearer $TOKEN"

# Estadísticas
curl https://tu-proxy.deno.dev/_proxy/stats
```

## Testing con curl (Windows PowerShell)

```powershell
# Health check
Invoke-WebRequest https://tu-proxy.deno.dev/_proxy/health

# Login
$response = Invoke-WebRequest -Method POST `
  -Uri https://tu-proxy.deno.dev/login `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"username":"admin","password":"admin123"}'

$token = ($response.Content | ConvertFrom-Json).token
Write-Host "Token: $token"

# Usar token
$headers = @{"Authorization"="Bearer $token"}
Invoke-WebRequest https://tu-proxy.deno.dev/api/procedures `
  -Headers $headers
```

## Monitoreo en Tiempo Real

```bash
# Ver logs del deployment
deno deploy logs --project=tu-proxy

# Salida en tiempo real:
# [2025-12-28T10:30:45Z] GET /api/procedures 200 45ms
# [2025-12-28T10:30:46Z] POST /login 200 52ms
# ...
```

## Casos de Uso Avanzados

### 1. Testear bajo carga

```bash
# 100 requests en paralelo
for i in {1..100}; do
  deno run --allow-net proxy/tests/test_deploy.ts https://tu-proxy.deno.dev &
done
wait
```

### 2. Testing de sesiones

```bash
# Verificar que sesiones expiran
TOKEN=$(curl -s -X POST https://tu-proxy.deno.dev/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# Usar token
curl https://tu-proxy.deno.dev/_proxy/stats \
  -H "Authorization: Bearer $TOKEN"

# Esperar 2+ horas de inactividad
sleep 7200

# Token debería estar expirado
curl https://tu-proxy.deno.dev/_proxy/stats \
  -H "Authorization: Bearer $TOKEN"
# Resultado: 401 Unauthorized
```

### 3. Validar CORS desde JavaScript

```javascript
// En browser console:
fetch('https://tu-proxy.deno.dev/_proxy/health')
  .then(r => r.json())
  .then(d => console.log('✓ CORS funciona:', d))
  .catch(e => console.error('✗ CORS error:', e))
```

## Requisitos

- Deno 1.40+
- Acceso a red (sin firewall bloqueando)
- URL válida del proxy en Deno Deploy

## Troubleshooting

### "error: Network error"
```
Solución: Verifica conectividad a internet y que la URL sea correcta
```

### "Expected status 200, got 500"
```
Solución: Revisa logs en Deno Deploy dashboard
deno deploy logs --project=tu-proxy
```

### Tests lentos (>1000ms)
```
Solución: Posible latencia de red o problemas de conectividad
Intenta desde una región cercana
```

### Sesiones se pierden inmediatamente
```
Solución: Es normal en Deno Deploy sin persistencia
Para persistencia, implementa Deno KV (ver DEPLOY_GUIDE.md)
```

## Próximas mejoras

- [ ] Tests con Deno KV
- [ ] Tests de JWT tokens
- [ ] Load testing avanzado
- [ ] Monitoring continuo con alertas
