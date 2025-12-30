# Frontend Web

Interfaz web para testing del proxy en `frontend/index.html`.

## Abrir

```bash
# Windows
start frontend\index.html

# Linux/Mac
xdg-open frontend/index.html
open frontend/index.html
```

## Uso

1. **Login** con usuario/password (admin/admin123)
2. **Selecciona endpoint** de los botones preconfigurados
3. **Custom request** para endpoints propios
4. **Ver respuesta** en el panel inferior

## Endpoints Preconfigurados

- Ping
- List Procedures
- Execute Procedure
- Jobs Status
- Query Log
- Config

## Custom Request

```json
{
  "method": "POST",
  "endpoint": "/api/callprocedure",
  "body": {
    "procedure": "MI_PROC",
    "params": {"p1": "valor"}
  }
}
```

## Depuración

Abre DevTools (F12) para ver:
- Network requests
- Console errors
- Respuestas completas
