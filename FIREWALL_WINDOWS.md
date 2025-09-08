# Permitir el acceso al microservicio Go Oracle API a través del firewall de Windows

## Permitir el puerto para cualquier IP

Abre PowerShell como administrador y ejecuta:

```
New-NetFirewallRule -DisplayName "Go Oracle API" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080
```

Cambia `8080` por el puerto que uses si es diferente.

---

## Permitir solo desde una IP específica

Por ejemplo, para permitir solo desde la IP `192.168.1.50`:

```
New-NetFirewallRule -DisplayName "Go Oracle API Solo 192.168.1.50" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -RemoteAddress 192.168.1.50
```

Puedes agregar varias reglas para diferentes IPs.

---

## Eliminar la regla del firewall

Si necesitas eliminar la regla creada:

```
Remove-NetFirewallRule -DisplayName "Go Oracle API"
```

O usa el nombre que hayas puesto en `-DisplayName`.

---

## Notas
- Ejecuta siempre estos comandos en PowerShell como administrador.
- Si tienes otro firewall o antivirus, revisa su configuración también.
- Puedes ver todas las reglas con:

```
Get-NetFirewallRule | Select-Object DisplayName, Enabled, Direction, Action, LocalPort, RemoteAddress
```
