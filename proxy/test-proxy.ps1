# Script para probar el proxy multi-backend

Write-Host "`n🧪 Iniciando pruebas del proxy..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Gray

# Configurar variables
$PORT = 9000
$PROXY_URL = "http://localhost:$PORT"

# Iniciar el proxy en background
Write-Host "1️⃣ Iniciando proxy en puerto $PORT..." -ForegroundColor Yellow
$env:CONFIG_URL = "https://backends-proliq.deno.dev/items"
$env:CONFIG_TOKEN = "desarrollotoken"
$env:PORT = "$PORT"

$proxyJob = Start-Process -FilePath "deno" `
    -ArgumentList "run --allow-net --allow-env .\proxy\simple-proxy.ts" `
    -PassThru `
    -NoNewWindow

Write-Host "   Esperando que el proxy inicie..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Test 1: Health Check
Write-Host "`n2️⃣ TEST: Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod "$PROXY_URL/_health"
    Write-Host "   ✅ Proxy respondiendo" -ForegroundColor Green
    Write-Host "   Backends: $($health.totalBackends)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    Stop-Process $proxyJob.Id -Force
    exit 1
}

# Test 2: Listar backends
Write-Host "`n3️⃣ TEST: Listar backends disponibles" -ForegroundColor Yellow
try {
    $backends = Invoke-RestMethod "$PROXY_URL/_backends"
    Write-Host "   ✅ $($backends.total) backends encontrados:" -ForegroundColor Green
    foreach ($b in $backends.backends) {
        Write-Host "      • $($b.name): $($b.prefix) → $($b.url)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Request a través del proxy
Write-Host "`n4️⃣ TEST: Request a través del proxy" -ForegroundColor Yellow
$testPath = "/desa/api/procedures"
try {
    Write-Host "   Probando: $PROXY_URL$testPath" -ForegroundColor Gray
    $response = Invoke-RestMethod "$PROXY_URL$testPath"
    Write-Host "   ✅ Request exitoso" -ForegroundColor Green
    if ($response) {
        Write-Host "   Respuesta recibida: $(($response | ConvertTo-Json -Compress).Substring(0, 100))..." -ForegroundColor Gray
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "   ⚠️  Status: $statusCode" -ForegroundColor Yellow
    Write-Host "   Mensaje: $($_.Exception.Message)" -ForegroundColor Gray
}

# Test 4: Request a path no existente
Write-Host "`n5️⃣ TEST: Path no existente (debe dar error 404)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod "$PROXY_URL/noexiste/test"
    Write-Host "   ❌ Debería haber dado 404" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Host "   ✅ Error 404 correcto" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Status inesperado: $statusCode" -ForegroundColor Yellow
    }
}

# Resumen
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "✅ Pruebas completadas" -ForegroundColor Green
Write-Host "`nEl proxy sigue corriendo en: $PROXY_URL" -ForegroundColor Cyan
Write-Host "PID del proceso: $($proxyJob.Id)" -ForegroundColor Gray
Write-Host "`nPara detener el proxy:" -ForegroundColor Yellow
Write-Host "   Stop-Process $($proxyJob.Id)" -ForegroundColor White
Write-Host "`nPara hacer requests:" -ForegroundColor Yellow
Write-Host "   Invoke-RestMethod $PROXY_URL/desa/api/procedures" -ForegroundColor White
Write-Host ""
