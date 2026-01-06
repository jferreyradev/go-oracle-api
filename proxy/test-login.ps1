# Script para probar el sistema de login del proxy

Write-Host "`n🔐 Pruebas del sistema de Login" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Gray

$PORT = 9100
$PROXY_URL = "http://localhost:$PORT"

# Iniciar el proxy
Write-Host "1️⃣ Iniciando proxy con login..." -ForegroundColor Yellow
$env:CONFIG_URL = "https://backends-proliq.deno.dev/items"
$env:CONFIG_TOKEN = "desarrollotoken"
$env:PROXY_USERS = "admin:admin123,user:user456"
$env:PORT = "$PORT"

$proxyJob = Start-Process -FilePath "deno" `
    -ArgumentList "run --allow-net --allow-env .\proxy\simple-proxy.ts" `
    -PassThru `
    -NoNewWindow

Start-Sleep -Seconds 5

# Test 1: Info del proxy
Write-Host "`n2️⃣ TEST: Info del sistema" -ForegroundColor Yellow
try {
    $info = Invoke-RestMethod "$PROXY_URL/_info"
    Write-Host "   ✅ Autenticación: $($info.authentication.enabled)" -ForegroundColor Green
    Write-Host "   Usuarios: $($info.authentication.usersConfigured)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Stop-Process $proxyJob.Id -Force
    exit 1
}

# Test 2: Intento sin login (debe fallar)
Write-Host "`n3️⃣ TEST: Request sin login (debe fallar 401)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod "$PROXY_URL/desa/api/procedures"
    Write-Host "   ❌ Debería haber dado 401" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "   ✅ Error 401 correcto (sin autenticación)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Status inesperado: $statusCode" -ForegroundColor Yellow
    }
}

# Test 3: Login con credenciales incorrectas
Write-Host "`n4️⃣ TEST: Login con credenciales incorrectas" -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod "$PROXY_URL/login" -Method Post -Body '{"username":"admin","password":"wrongpass"}' -ContentType "application/json"
    Write-Host "   ❌ Debería haber dado 401" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "   ✅ Login rechazado correctamente" -ForegroundColor Green
    }
}

# Test 4: Login exitoso
Write-Host "`n5️⃣ TEST: Login exitoso" -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod "$PROXY_URL/login" -Method Post -Body '{"username":"admin","password":"admin123"}' -ContentType "application/json"
    Write-Host "   ✅ Login exitoso" -ForegroundColor Green
    Write-Host "   Usuario: $($login.username)" -ForegroundColor Gray
    Write-Host "   Token: $($login.token.Substring(0,20))..." -ForegroundColor Gray
    Write-Host "   Expira en: $($login.expiresIn / 3600) horas" -ForegroundColor Gray
    $token = $login.token
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Stop-Process $proxyJob.Id -Force
    exit 1
}

# Test 5: Request autenticado
Write-Host "`n6️⃣ TEST: Request con token válido" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    $response = Invoke-RestMethod "$PROXY_URL/desa/api/procedures" -Headers $headers
    Write-Host "   ✅ Request autenticado exitoso" -ForegroundColor Green
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "   ⚠️  Status: $statusCode (backend puede no estar disponible)" -ForegroundColor Yellow
}

# Test 6: Logout
Write-Host "`n7️⃣ TEST: Logout" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    $logout = Invoke-RestMethod "$PROXY_URL/logout" -Method Post -Headers $headers
    Write-Host "   ✅ Logout exitoso" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Request después del logout (debe fallar)
Write-Host "`n8️⃣ TEST: Request después del logout (debe fallar)" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    $response = Invoke-RestMethod "$PROXY_URL/desa/api/procedures" -Headers $headers
    Write-Host "   ❌ Debería haber dado 401" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "   ✅ Token invalidado correctamente" -ForegroundColor Green
    }
}

# Resumen
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "✅ Todas las pruebas completadas" -ForegroundColor Green
Write-Host "`nEl proxy sigue corriendo en: $PROXY_URL" -ForegroundColor Cyan
Write-Host "PID: $($proxyJob.Id)" -ForegroundColor Gray

Write-Host "`n📝 Flujo de trabajo:" -ForegroundColor Yellow
Write-Host "   1. POST /login con {username, password}" -ForegroundColor White
Write-Host "   2. Usar token: Authorization: Bearer <token>" -ForegroundColor White
Write-Host "   3. POST /logout para cerrar sesión" -ForegroundColor White

Write-Host "`n🔧 Para Postman:" -ForegroundColor Yellow
Write-Host "   1. POST $PROXY_URL/login" -ForegroundColor White
Write-Host "      Body: {""username"":""admin"",""password"":""admin123""}" -ForegroundColor Gray
Write-Host "   2. Copiar el token de la respuesta" -ForegroundColor White
Write-Host "   3. Headers: Authorization: Bearer <token>" -ForegroundColor White

Write-Host "`n⚠️  Para detener: Stop-Process $($proxyJob.Id)" -ForegroundColor Yellow
Write-Host ""
