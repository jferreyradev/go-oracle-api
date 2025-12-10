# Pruebas de Procedimientos Asíncronos

## ✅ Estado: Funcionando Correctamente

Los endpoints asíncronos están **operativos y funcionando**.

## 🧪 Cómo Probar

### Opción 1: Script Batch (Windows)

```bash
.\scripts\test_async_manual.bat
```

### Opción 2: Comandos Manuales con curl

#### 1. Verificar que la API está corriendo
```bash
curl -H "Authorization: Bearer test1" http://10.6.150.91:3000/ping
```

#### 2. Iniciar un procedimiento asíncrono
```bash
curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer test1" http://10.6.150.91:3000/procedure/async -d "{\"name\":\"suma_simple\",\"params\":[{\"name\":\"a\",\"value\":5},{\"name\":\"b\",\"value\":7},{\"name\":\"resultado\",\"direction\":\"OUT\"}]}"
```

**Respuesta:**
```json
{
  "status": "accepted",
  "job_id": "a8ee0dafa7cb668bc04be8c5489c7d52",
  "message": "Procedimiento ejecutándose en segundo plano",
  "check_status_url": "/jobs/a8ee0dafa7cb668bc04be8c5489c7d52"
}
```

#### 3. Consultar estado del job
```bash
curl -H "Authorization: Bearer test1" http://10.6.150.91:3000/jobs/a8ee0dafa7cb668bc04be8c5489c7d52
```

**Respuesta (completado):**
```json
{
  "id": "a8ee0dafa7cb668bc04be8c5489c7d52",
  "status": "completed",
  "procedure_name": "suma_simple",
  "start_time": "2025-12-10T15:55:58Z",
  "end_time": "2025-12-10T15:55:58Z",
  "duration": "1.0483ms",
  "result": {
    "resultado": 12
  },
  "progress": 100
}
```

#### 4. Listar todos los jobs
```bash
curl -H "Authorization: Bearer test1" http://10.6.150.91:3000/jobs/
```

**Nota:** La barra `/` al final es importante.

### Opción 3: Script Node.js (si está instalado)

```bash
node scripts/test_async.js
```

**Requisitos:**
- Node.js 18+ instalado
- Modificar `API_URL` y `API_TOKEN` en el script si es necesario

## 📊 Resultados de Prueba

✅ **POST /procedure/async** - Funciona correctamente  
✅ **GET /jobs/{id}** - Funciona correctamente  
✅ **GET /jobs/** - Funciona correctamente  
✅ **Ejecución asíncrona** - Job se completa en segundo plano  
✅ **Resultados OUT** - Se reciben correctamente  

## 🎯 Ejemplo Real Probado

**Procedimiento:** `suma_simple(a=5, b=7, resultado OUT)`  
**Job ID:** `a8ee0dafa7cb668bc04be8c5489c7d52`  
**Estado:** Completado  
**Duración:** 1.0483ms  
**Resultado:** 12 (5 + 7)  

## 🚀 Prueba Completa con PowerShell

```powershell
# 1. Iniciar procedimiento
$response = Invoke-RestMethod -Uri "http://10.6.150.91:3000/procedure/async" `
  -Method Post `
  -Headers @{"Authorization"="Bearer test1"; "Content-Type"="application/json"} `
  -Body '{"name":"suma_simple","params":[{"name":"a","value":10},{"name":"b","value":20},{"name":"resultado","direction":"OUT"}]}'

Write-Host "Job ID: $($response.job_id)"

# 2. Consultar estado
Start-Sleep -Seconds 1
$status = Invoke-RestMethod -Uri "http://10.6.150.91:3000/jobs/$($response.job_id)" `
  -Headers @{"Authorization"="Bearer test1"}

Write-Host "Estado: $($status.status)"
Write-Host "Resultado: $($status.result.resultado)"
```

## ⚠️ Notas Importantes

1. **API debe estar corriendo** antes de ejecutar las pruebas:
   ```bash
   .\go-oracle-api.exe
   ```

2. **Puerto configurado:** 3000 (según tu `.env`)

3. **Token:** test1 (según tu configuración)

4. **Endpoint /jobs** requiere barra final (`/jobs/`) para listar todos

## 🐛 Troubleshooting

**Error: Connection refused**
- Verifica que la API esté corriendo
- Verifica el puerto en `.env`

**Error: 401 Unauthorized**
- Verifica el token en el script

**Error: Job no encontrado**
- El job se eliminó (> 24 horas)
- Verifica el job_id

---

**Conclusión:** Los endpoints asíncronos están funcionando perfectamente. ✅
