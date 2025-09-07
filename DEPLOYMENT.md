# Despliegue del Microservicio Go Oracle API

## 1. Compilar el binario en la máquina de desarrollo

### Para Windows:
```sh
GOOS=windows GOARCH=amd64 go build -o oracle-api.exe
```

### Para Linux:
```sh
GOOS=linux GOARCH=amd64 go build -o oracle-api
```

## 2. Copiar archivos al servidor destino
- El binario (`oracle-api.exe` o `oracle-api`)
- El archivo `.env` con la configuración

## 3. Ejecutar como servicio en segundo plano

### En Windows (como servicio con NSSM):
1. Descarga NSSM: https://nssm.cc/download
2. Instala el servicio:
   - Abre una terminal como administrador.
   - Ejecuta:
     ```sh
     nssm install GoOracleAPI "C:\ruta\a\oracle-api.exe"
     ```
   - En la pestaña "Environment", agrega las variables de entorno necesarias o asegúrate de que `.env` esté en el mismo directorio.
   - Inicia el servicio:
     ```sh
     nssm start GoOracleAPI
     ```

### En Linux (como servicio systemd):
1. Copia el binario y `.env` a `/opt/oracle-api` (o la ruta que prefieras).
2. Crea el archivo de servicio `/etc/systemd/system/oracle-api.service` con este contenido:
   ```ini
   [Unit]
   Description=Go Oracle API Microservice
   After=network.target

   [Service]
   WorkingDirectory=/opt/oracle-api
   ExecStart=/opt/oracle-api/oracle-api
   EnvironmentFile=/opt/oracle-api/.env
   Restart=always
   User=oracleapi

   [Install]
   WantedBy=multi-user.target
   ```
   - Crea el usuario `oracleapi` si no existe: `sudo useradd -r -s /bin/false oracleapi`
3. Recarga systemd y habilita el servicio:
   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable oracle-api
   sudo systemctl start oracle-api
   ```

## 4. Verificar el servicio
- En Windows: revisa el Administrador de servicios o usa `nssm status GoOracleAPI`.
- En Linux: `systemctl status oracle-api`

## 5. Notas
- Asegúrate de abrir el puerto 8080 en el firewall si es necesario.
- El servicio leerá las variables de entorno desde el archivo `.env` si usas `EnvironmentFile` en Linux, o desde el entorno del sistema/servicio en Windows.
- Puedes detener el servicio con `nssm stop GoOracleAPI` (Windows) o `systemctl stop oracle-api` (Linux).

## Troubleshooting y ejemplos de logs

### Ver logs del servicio
- **Windows:**
  - Si usas NSSM, puedes redirigir la salida a un archivo desde la pestaña "I/O" al instalar el servicio.
  - También puedes ver logs en tiempo real ejecutando el binario manualmente en una terminal.
- **Linux:**
  - Usa `journalctl -u oracle-api -f` para ver los logs en tiempo real.

### Ejemplo de log de inicio correcto
```
2025/09/07 15:43:32 Microservicio escuchando en :8080
```

### Ejemplo de log de acceso denegado por IP
```
2025/09/07 15:43:41 Debug IP: remoteIP=192.168.1.50, allowedIPs=[127.0.0.1 ::1 localhost 192.168.1.100]
2025/09/07 15:43:41 IP rechazada: 192.168.1.50
```

### Problemas comunes
- **El servicio no inicia:**
  - Verifica que el binario tenga permisos de ejecución (Linux: `chmod +x oracle-api`).
  - Revisa que el archivo `.env` esté presente y correctamente configurado.
  - Consulta los logs para mensajes de error.
- **No responde en el puerto 8080:**
  - Asegúrate de que el firewall permita el puerto 8080.
  - Verifica que no haya otro proceso usando ese puerto.
- **Error 403 (IP no permitida):**
  - Revisa el log para ver qué IP está usando la petición y agrégala a `API_ALLOWED_IPS`.
- **Error de conexión a Oracle:**
  - Verifica las credenciales y la conectividad de red con la base de datos.

### Cómo reiniciar el servicio
- **Windows:**
  - `nssm restart GoOracleAPI`
- **Linux:**
  - `sudo systemctl restart oracle-api`
