# Encriptación de Tokens - Guía Técnica Detallada

Guía técnica sobre cómo funciona la encriptación AES-256-GCM de tokens.

Para uso básico, consulta [README.md](README.md#-seguridad).

---

## 🔐 Flujo de Encriptación

```
1. Backend Register (register.ts)
   Token: "mi-token-secreto"
   ↓ Encripta con AES-256-GCM
   Token guardado en KV: "AbC123...XyZ=" (base64)

2. Deno KV Storage
   Almacena: { name: "prod", token: "AbC123...XyZ=", ... }

3. Proxy (proxy-deploy.ts)
   Lee de KV: "AbC123...XyZ="
   ↓ Desencripta con la misma clave
   Token usado: "mi-token-secreto"
```

## ⚙️ Configuración

### 1. Al Registrar Backend

```bash
# Registrar con clave personalizada
deno run --allow-net --allow-env backend-register/register.ts \
  --name=prod \
  --url=http://10.6.46.114:3013 \
  --token=mi-token-secreto \
  --prefix=/prod \
  --config=https://tu-config.deno.dev/items \
  --key=mi-clave-secreta-2026 \
  --daemon
```

### 2. En el Proxy (Deno Deploy)

Configurar variable de entorno:
```
ENCRYPTION_KEY=mi-clave-secreta-2026
```

**Importante:** La `ENCRYPTION_KEY` debe ser **exactamente la misma** en ambos lados.

## 📝 Código del Proxy

El proxy ya incluye la función de desencriptación:

```typescript
// En proxy-deploy.ts
async function decryptToken(encryptedToken: string): Promise<string> {
    try {
        // ... lógica de desencriptación AES-256-GCM ...
        return decoder.decode(decryptedData);
    } catch (error) {
        // Si falla, devuelve el token sin desencriptar
        // (por compatibilidad con tokens legacy)
        return encryptedToken;
    }
}

// Al cargar backends desde KV
for (const item of data) {
    const decryptedToken = await decryptToken(item.token);
    backends.push({
        name: item.name,
        token: decryptedToken, // Token listo para usar
        // ...
    });
}
```

## ✅ Verificación

### 1. Ver Token Encriptado en KV

```bash
curl https://tu-config.deno.dev/items
```

Respuesta:
```json
[
  {
    "name": "prod",
    "url": "http://10.6.46.114:3013",
    "token": "YWJjZGVmZ2hpams...xyz==",  ← Encriptado
    "prefix": "/prod"
  }
]
```

### 2. Probar el Proxy

```bash
# El proxy desencripta automáticamente y usa el token real
curl https://tu-proxy.deno.dev/prod/api/procedures \
  -H "Authorization: Bearer <tu-token-de-sesion>"
```

El proxy internamente:
1. Lee el token encriptado del KV
2. Lo desencripta usando `ENCRYPTION_KEY`
3. Hace la petición al backend con el token real
4. Devuelve la respuesta

## 🔧 Troubleshooting

### Error: Token desencriptado es inválido

**Causa:** La `ENCRYPTION_KEY` no coincide entre register.ts y proxy-deploy.ts

**Solución:**
```bash
# Verificar ambas configuraciones usan la misma clave

# En register.ts
--key=mi-clave-exacta

# En Deno Deploy
ENCRYPTION_KEY=mi-clave-exacta
```

### Error: Cannot decrypt token

**Causa:** El token en KV no está encriptado correctamente

**Solución:**
1. Volver a registrar el backend con la clave correcta
2. Verificar que register.ts esté usando la versión actualizada

### Compatibilidad con tokens antiguos

El código es retrocompatible:
- Si el token está encriptado → desencripta
- Si el token no está encriptado → usa directamente
- Si falla la desencriptación → usa el valor original

## 🔐 Seguridad

**Buenas prácticas:**

1. **Usar ENCRYPTION_KEY diferente por entorno**
   ```bash
   # Producción
   ENCRYPTION_KEY=clave-super-secreta-prod-2026
   
   # Testing
   ENCRYPTION_KEY=clave-test-2026
   ```

2. **No hardcodear la clave**
   - Usar variables de entorno
   - Usar secretos de Deno Deploy
   - Nunca subir al repositorio

3. **Rotar claves periódicamente**
   - Cambiar ENCRYPTION_KEY cada 6-12 meses
   - Re-registrar todos los backends con la nueva clave

4. **Monitorear accesos**
   - Revisar logs del proxy
   - Detectar intentos de acceso no autorizado
