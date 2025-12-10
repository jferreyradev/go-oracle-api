package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/sijms/go-ora/v2"
)

var db *sql.DB
var logFileName string  // Nombre del log de la instancia
var instanceName string // Nombre/etiqueta de la instancia

// JobStatus representa el estado de un job asíncrono
type JobStatus string

const (
	JobStatusPending   JobStatus = "pending"
	JobStatusRunning   JobStatus = "running"
	JobStatusCompleted JobStatus = "completed"
	JobStatusFailed    JobStatus = "failed"
)

// AsyncJob representa un job de procedimiento en ejecución
type AsyncJob struct {
	ID        string                 `json:"id"`
	Status    JobStatus              `json:"status"`
	ProcName  string                 `json:"procedure_name"`
	StartTime time.Time              `json:"start_time"`
	EndTime   *time.Time             `json:"end_time,omitempty"`
	Duration  string                 `json:"duration,omitempty"`
	Result    map[string]interface{} `json:"result,omitempty"`
	Error     string                 `json:"error,omitempty"`
	Progress  int                    `json:"progress"` // 0-100
}

// JobManager gestiona los jobs asíncronos
type JobManager struct {
	jobs map[string]*AsyncJob
	mu   sync.RWMutex
}

var jobManager = &JobManager{
	jobs: make(map[string]*AsyncJob),
}

// generateJobID genera un ID único para el job
func generateJobID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// CreateJob crea un nuevo job y lo registra (en memoria y BD)
func (jm *JobManager) CreateJob(procName string) *AsyncJob {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	job := &AsyncJob{
		ID:        generateJobID(),
		Status:    JobStatusPending,
		ProcName:  procName,
		StartTime: time.Now(),
		Progress:  0,
	}
	jm.jobs[job.ID] = job

	// Guardar en base de datos
	go jm.saveJobToDB(job)

	return job
}

// GetJob obtiene un job por su ID
func (jm *JobManager) GetJob(id string) (*AsyncJob, bool) {
	jm.mu.RLock()
	defer jm.mu.RUnlock()
	job, exists := jm.jobs[id]
	return job, exists
}

// GetAllJobs retorna todos los jobs
func (jm *JobManager) GetAllJobs() []*AsyncJob {
	jm.mu.RLock()
	defer jm.mu.RUnlock()

	jobs := make([]*AsyncJob, 0, len(jm.jobs))
	for _, job := range jm.jobs {
		jobs = append(jobs, job)
	}
	return jobs
}

// UpdateJob actualiza el estado de un job (en memoria y BD)
func (jm *JobManager) UpdateJob(id string, updateFn func(*AsyncJob)) {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	if job, exists := jm.jobs[id]; exists {
		updateFn(job)
		// Actualizar en base de datos
		go jm.updateJobInDB(job)
	}
}

// CleanupOldJobs elimina jobs completados hace más de 24 horas
func (jm *JobManager) CleanupOldJobs() {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	cutoff := time.Now().Add(-24 * time.Hour)
	for id, job := range jm.jobs {
		if job.EndTime != nil && job.EndTime.Before(cutoff) {
			delete(jm.jobs, id)
		}
	}
}

// saveJobToDB guarda un job en la base de datos
func (jm *JobManager) saveJobToDB(job *AsyncJob) {
	if db == nil {
		return
	}

	_, err := db.Exec(`
		INSERT INTO ASYNC_JOBS (
			JOB_ID, STATUS, PROCEDURE_NAME, START_TIME, 
			END_TIME, DURATION, RESULT, ERROR_MSG, PROGRESS
		) VALUES (
			:1, :2, :3, :4, :5, :6, :7, :8, :9
		)`,
		job.ID,
		string(job.Status),
		job.ProcName,
		job.StartTime,
		job.EndTime,
		job.Duration,
		nil, // RESULT será actualizado después
		job.Error,
		job.Progress,
	)

	if err != nil {
		log.Printf("Error guardando job %s en BD: %v", job.ID, err)
	}
}

// updateJobInDB actualiza un job en la base de datos
func (jm *JobManager) updateJobInDB(job *AsyncJob) {
	if db == nil {
		return
	}

	// Convertir resultado a JSON
	var resultJSON string
	if job.Result != nil {
		if jsonBytes, err := json.Marshal(job.Result); err == nil {
			resultJSON = string(jsonBytes)
		}
	}

	_, err := db.Exec(`
		UPDATE ASYNC_JOBS SET
			STATUS = :1,
			END_TIME = :2,
			DURATION = :3,
			RESULT = :4,
			ERROR_MSG = :5,
			PROGRESS = :6
		WHERE JOB_ID = :7`,
		string(job.Status),
		job.EndTime,
		job.Duration,
		resultJSON,
		job.Error,
		job.Progress,
		job.ID,
	)

	if err != nil {
		log.Printf("Error actualizando job %s en BD: %v", job.ID, err)
	}
}

// LoadJobsFromDB carga jobs desde la base de datos al iniciar
func (jm *JobManager) LoadJobsFromDB() error {
	if db == nil {
		return fmt.Errorf("base de datos no disponible")
	}

	// Cargar solo jobs de las últimas 24 horas que no estén completados
	rows, err := db.Query(`
		SELECT 
			JOB_ID, STATUS, PROCEDURE_NAME, START_TIME,
			END_TIME, DURATION, RESULT, ERROR_MSG, PROGRESS
		FROM ASYNC_JOBS
		WHERE START_TIME >= SYSDATE - 1
		ORDER BY START_TIME DESC
	`)

	if err != nil {
		// Si la tabla no existe, no es un error crítico
		if strings.Contains(err.Error(), "ORA-00942") {
			log.Println("Tabla ASYNC_JOBS no existe. Ejecuta sql/create_async_jobs_table.sql")
			return nil
		}
		return err
	}
	defer rows.Close()

	jm.mu.Lock()
	defer jm.mu.Unlock()

	count := 0
	for rows.Next() {
		var job AsyncJob
		var endTime sql.NullTime
		var duration, resultJSON, errorMsg sql.NullString

		err := rows.Scan(
			&job.ID,
			&job.Status,
			&job.ProcName,
			&job.StartTime,
			&endTime,
			&duration,
			&resultJSON,
			&errorMsg,
			&job.Progress,
		)

		if err != nil {
			log.Printf("Error leyendo job: %v", err)
			continue
		}

		if endTime.Valid {
			job.EndTime = &endTime.Time
		}
		if duration.Valid {
			job.Duration = duration.String
		}
		if resultJSON.Valid && resultJSON.String != "" {
			json.Unmarshal([]byte(resultJSON.String), &job.Result)
		}
		if errorMsg.Valid {
			job.Error = errorMsg.String
		}

		jm.jobs[job.ID] = &job
		count++
	}

	if count > 0 {
		log.Printf("Cargados %d jobs desde la base de datos", count)
	}

	return nil
}

// InitializeAsyncJobsTable crea la tabla si no existe
func InitializeAsyncJobsTable() error {
	if db == nil {
		return fmt.Errorf("base de datos no disponible")
	}

	// Verificar si la tabla existe
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = 'ASYNC_JOBS'").Scan(&count)
	if err != nil {
		return err
	}

	if count > 0 {
		log.Println("Tabla ASYNC_JOBS ya existe")
		return nil
	}

	// Crear la tabla
	log.Println("Creando tabla ASYNC_JOBS...")

	createTableSQL := `
		CREATE TABLE ASYNC_JOBS (
			JOB_ID VARCHAR2(32) PRIMARY KEY,
			STATUS VARCHAR2(20) NOT NULL,
			PROCEDURE_NAME VARCHAR2(200) NOT NULL,
			START_TIME TIMESTAMP NOT NULL,
			END_TIME TIMESTAMP,
			DURATION VARCHAR2(50),
			RESULT CLOB,
			ERROR_MSG CLOB,
			PROGRESS NUMBER DEFAULT 0,
			CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`

	_, err = db.Exec(createTableSQL)
	if err != nil {
		return fmt.Errorf("error creando tabla ASYNC_JOBS: %v", err)
	}

	// Crear índices
	db.Exec("CREATE INDEX IDX_ASYNC_JOBS_STATUS ON ASYNC_JOBS(STATUS)")
	db.Exec("CREATE INDEX IDX_ASYNC_JOBS_START_TIME ON ASYNC_JOBS(START_TIME)")
	db.Exec("CREATE INDEX IDX_ASYNC_JOBS_CREATED_AT ON ASYNC_JOBS(CREATED_AT)")

	log.Println("Tabla ASYNC_JOBS creada exitosamente")
	return nil
}

// setWindowTitle cambia el título de la ventana según la plataforma
func setWindowTitle(title string) {
	switch runtime.GOOS {
	case "windows":
		// Windows: usar cmd title
		exec.Command("cmd", "/C", "title", title).Run()
	case "linux":
		// Linux: escape sequence para terminales compatibles
		fmt.Printf("\033]0;%s\007", title)
	case "darwin":
		// macOS: escape sequence para Terminal.app
		fmt.Printf("\033]0;%s\007", title)
	default:
		// Otras plataformas: no hacer nada o usar escape sequence genérico
		fmt.Printf("\033]0;%s\007", title)
	}
}

// Configuración de la aplicación
type AppConfig struct {
	OracleUser     string
	OraclePassword string
	OracleHost     string
	OraclePort     string
	OracleService  string
	ListenPort     string
}

// Carga la configuración desde variables de entorno y argumentos, valida obligatorias
func loadConfig() AppConfig {
	envFile := ".env"
	if len(os.Args) > 1 && os.Args[1] != "" {
		envFile = os.Args[1]
	} else if customEnv := os.Getenv("ENV_FILE"); customEnv != "" {
		envFile = customEnv
	}
	_ = godotenv.Load(envFile)

	user := os.Getenv("ORACLE_USER")
	password := os.Getenv("ORACLE_PASSWORD")
	host := os.Getenv("ORACLE_HOST")
	port := os.Getenv("ORACLE_PORT")
	service := os.Getenv("ORACLE_SERVICE")

	missing := []string{}
	if user == "" {
		missing = append(missing, "ORACLE_USER")
	}
	if password == "" {
		missing = append(missing, "ORACLE_PASSWORD")
	}
	if host == "" {
		missing = append(missing, "ORACLE_HOST")
	}
	if port == "" {
		missing = append(missing, "ORACLE_PORT")
	}
	if service == "" {
		missing = append(missing, "ORACLE_SERVICE")
	}
	if len(missing) > 0 {
		msg := "Faltan variables obligatorias: " + strings.Join(missing, ", ") + "\nRevisa tu archivo .env o variables de entorno."
		fmt.Fprintln(os.Stderr, msg)
		_ = os.WriteFile("log/last_error.txt", []byte(msg+"\n"), 0644)
		os.Exit(2)
	}

	listenPort := os.Getenv("PORT")
	if listenPort == "" {
		if len(os.Args) > 2 && os.Args[2] != "" {
			listenPort = os.Args[2]
		} else {
			listenPort = "8080"
		}
	}

	return AppConfig{
		OracleUser:     user,
		OraclePassword: password,
		OracleHost:     host,
		OraclePort:     port,
		OracleService:  service,
		ListenPort:     listenPort,
	}
}

// Abre la conexión a Oracle y la retorna
func openOracleConnection(cfg AppConfig) (*sql.DB, error) {
	dsn := fmt.Sprintf("oracle://%s:%s@%s:%s/%s", cfg.OracleUser, cfg.OraclePassword, cfg.OracleHost, cfg.OraclePort, cfg.OracleService)
	return sql.Open("oracle", dsn)
}

func main() {
	// ===============================
	// 1. Mostrar ayuda si se solicita
	// ===============================
	if len(os.Args) > 1 {
		arg := strings.ToLower(os.Args[1])
		if arg == "-h" || arg == "--help" || arg == "help" {
			fmt.Print(`
Go Oracle API - Opciones de ejecución

USO:
  go run main.go [archivo_env] [puerto] [nombre_instancia]
  go-oracle-api.exe [archivo_env] [puerto] [nombre_instancia]

Argumentos opcionales:
  archivo_env       Archivo de variables de entorno (por defecto .env)
  puerto            Puerto donde escuchará la API (por defecto 8080)
  nombre_instancia  Nombre para identificar esta instancia (por defecto auto)

También puedes usar variables de entorno:
  ENV_FILE          Archivo de configuración
  PORT              Puerto de escucha
  INSTANCE_NAME     Nombre de la instancia

Ejemplos:
  go run main.go .env1 8081 "Produccion"
  go run main.go .env2 8082 "Testing"
  
  set INSTANCE_NAME=Desarrollo
  go run main.go .env3 8083

Para más información consulta:
  - README.md
  - docs/CONFIGURACION_ENV.md
  - Endpoint /docs
`)
			os.Exit(0)
		}
	}

	// ===============================
	// 2. Configuración de logging e identificación de instancia
	// ===============================

	// Determinar nombre de instancia
	instanceName = "auto"
	if len(os.Args) > 3 && os.Args[3] != "" {
		instanceName = os.Args[3]
	} else if customInstance := os.Getenv("INSTANCE_NAME"); customInstance != "" {
		instanceName = customInstance
	}

	// Crear carpeta log si no existe
	if _, err := os.Stat("log"); os.IsNotExist(err) {
		_ = os.Mkdir("log", 0755)
	}

	// Generar nombre de log único por instancia
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	if instanceName != "auto" {
		logFileName = fmt.Sprintf("log/%s_%s.log", instanceName, timestamp)
	} else {
		logFileName = "log/app-" + timestamp + ".log"
	}
	logFile, err := os.OpenFile(logFileName, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err == nil {
		log.SetOutput(logFile) // Solo archivo, no consola
	} else {
		log.SetOutput(os.Stdout)
		log.Printf("No se pudo abrir %s para logging: %v", logFileName, err)
	}

	// ===============================
	// 3. Registro de todos los endpoints
	// ===============================
	http.HandleFunc("/docs", docsHandler)
	http.HandleFunc("/logs", logRequest(authMiddleware(logsHandler)))
	http.HandleFunc("/upload", logRequest(authMiddleware(uploadHandler)))
	http.HandleFunc("/ping", logRequest(authMiddleware(pingHandler)))
	http.HandleFunc("/query", logRequest(authMiddleware(queryHandler)))
	http.HandleFunc("/exec", logRequest(authMiddleware(execHandler)))
	http.HandleFunc("/procedure", logRequest(authMiddleware(procedureHandler)))
	http.HandleFunc("/procedure/async", logRequest(authMiddleware(asyncProcedureHandler)))
	http.HandleFunc("/jobs/", logRequest(authMiddleware(jobsHandler))) // /jobs/{id} y /jobs

	// ===============================
	// 4. Carga de configuración y conexión a Oracle
	// ===============================
	cfg := loadConfig()

	db, err = openOracleConnection(cfg)
	if err != nil {
		_ = os.WriteFile("log/last_error.txt", []byte(fmt.Sprintf("Error abriendo conexión: %v\n", err)), 0644)
		log.Fatalf("Error abriendo conexión: %v", err)
	}
	defer db.Close()
	port := cfg.ListenPort
	user := cfg.OracleUser
	host := cfg.OracleHost
	service := cfg.OracleService

	// ===============================
	// 5. Inicializar sistema de jobs asíncronos
	// ===============================
	// Verificar/crear tabla ASYNC_JOBS
	if err := InitializeAsyncJobsTable(); err != nil {
		log.Printf("Advertencia: No se pudo inicializar tabla ASYNC_JOBS: %v", err)
	}

	// Cargar jobs existentes desde la base de datos
	if err := jobManager.LoadJobsFromDB(); err != nil {
		log.Printf("Advertencia: No se pudieron cargar jobs desde BD: %v", err)
	}

	// ===============================
	// 7. Detección de IPs locales
	// ===============================
	ips := []string{"0.0.0.0"}
	if addrs, err := net.InterfaceAddrs(); err == nil {
		ips = []string{}
		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
				ips = append(ips, ipnet.IP.String())
			}
		}
		if len(ips) == 0 {
			ips = []string{"0.0.0.0"}
		}
	}

	// ===============================
	// 8. Resumen de arranque y estado
	// ===============================
	fmt.Println("==============================")
	if instanceName != "auto" {
		fmt.Printf("INSTANCIA: %s\n", instanceName)
		// Cambiar título de la ventana según la plataforma
		setWindowTitle(fmt.Sprintf("Go Oracle API - %s (Puerto %s)", instanceName, port))
	} else {
		// Título por defecto
		setWindowTitle(fmt.Sprintf("Go Oracle API - Puerto %s", port))
	}
	fmt.Println("API escuchando en el puerto:", port)
	fmt.Printf("Conectado a Oracle: usuario=%s host=%s puerto=%s servicio=%s\n", user, host, cfg.OraclePort, service)
	fmt.Printf("Log de esta instancia: %s\n", logFileName)
	fmt.Println("==============================")
	log.Println("==============================")
	log.Println("Estado de la API al iniciar:")
	for _, ip := range ips {
		log.Printf("- Endpoint disponible: http://%s:%s", ip, port)
	}
	log.Println("- Endpoint de logs: /logs")
	log.Println("- Endpoint de ping: /ping")
	log.Println("- Endpoint de query: /query")
	log.Println("- Endpoint de exec: /exec")
	log.Println("- Endpoint de procedure: /procedure")
	log.Println("- Endpoint de upload: /upload")
	log.Printf("- Conectado a Oracle: usuario=%s host=%s puerto=%s servicio=%s", user, host, port, service)
	// Estado de conexión a Oracle
	if err := db.Ping(); err == nil {
		log.Printf("- Conexión a Oracle: OK")
	} else {
		log.Printf("- Conexión a Oracle: ERROR: %v", err)
		// Registrar error de ping en archivo especial
		_ = os.WriteFile("log/last_error.txt", []byte(fmt.Sprintf("Error de conexión a Oracle (ping): %v\n", err)), 0644)
	}
	log.Println("==============================")
	fmt.Println("Endpoints disponibles:")
	for _, ip := range ips {
		fmt.Printf("- http://%s:%s\n", ip, port)
	}
	fmt.Println("  /logs      - Consulta el log actual de la instancia")
	fmt.Println("  /ping      - Prueba de vida de la API (GET)")
	fmt.Println("  /query     - Ejecuta una consulta SQL (GET)")
	fmt.Println("  /exec      - Ejecuta una sentencia SQL (POST)")
	fmt.Println("  /procedure - Ejecuta un procedimiento almacenado (POST)")
	fmt.Println("  /procedure/async - Ejecuta un procedimiento en segundo plano (POST)")
	fmt.Println("  /jobs      - Lista todos los jobs asíncronos (GET)")
	fmt.Println("  /jobs/{id} - Consulta el estado de un job específico (GET)")
	fmt.Println("  /upload    - Sube un archivo como BLOB (POST)")
	fmt.Println("\nPara detalles de uso y ejemplos, consulta la documentación en:")
	fmt.Println("  - /docs (endpoint)")
	fmt.Println("  - docs/USO_Y_PRUEBAS.md (archivo)")

	// ===============================
	// 9. Iniciar limpieza periódica de jobs antiguos
	// ===============================
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			jobManager.CleanupOldJobs()
			log.Println("Limpieza de jobs antiguos completada")
		}
	}()

	// ===============================
	// 10. Iniciar servidor HTTP con graceful shutdown
	// ===============================
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: http.DefaultServeMux,
	}

	// Canal para señales del sistema
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("Servidor escuchando en 0.0.0.0:%s (Ctrl+C para detener)", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Error al iniciar el servidor: %v", err)
		}
	}()

	<-quit
	log.Println("\nSeñal de apagado recibida, cerrando servidor...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Error en shutdown: %v", err)
	}
	log.Println("Servidor cerrado correctamente.")
}

// docsHandler sirve el contenido del README.md como documentación básica
func docsHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	data, err := os.ReadFile("README.md")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Error leyendo la documentación: " + err.Error()))
		return
	}
	w.Write(data)
}

// logsHandler sirve el contenido del archivo de log de la instancia actual
func logsHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if logFileName == "" {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("No hay log de instancia disponible"))
		return
	}
	data, err := os.ReadFile(logFileName)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Error leyendo el log: " + err.Error()))
		return
	}
	w.Write(data)
}

// logRequest es un middleware que registra cada petición HTTP entrante
func logRequest(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		if colon := strings.LastIndex(ip, ":"); colon != -1 {
			ip = ip[:colon]
		}
		log.Printf("%s %s desde %s", r.Method, r.URL.Path, ip)
		next(w, r)
	}
}

// uploadHandler recibe archivos vía multipart/form-data y los guarda en una tabla BLOB
func uploadHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Solo se permite POST"})
		return
	}
	err := r.ParseMultipartForm(100 << 20) // 100 MB máximo
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error al leer el archivo: " + err.Error()})
		return
	}
	file, handler, err := r.FormFile("file")
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Archivo no recibido: " + err.Error()})
		return
	}
	defer file.Close()

	// Leer el archivo en memoria (para archivos muy grandes, usar streaming a la BD)
	data := make([]byte, handler.Size)
	_, err = file.Read(data)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error leyendo archivo: " + err.Error()})
		return
	}

	// Metadatos opcionales
	nombre := handler.Filename
	descripcion := r.FormValue("descripcion")

	// Insertar en la tabla (ejemplo: archivos(id, nombre, descripcion, contenido BLOB))
	_, err = db.Exec("INSERT INTO archivos (nombre, descripcion, contenido) VALUES (:1, :2, :3)", nombre, descripcion, data)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error guardando en BD: " + err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "nombre": nombre})
}

// procedureHandler ejecuta un procedimiento almacenado con parámetros IN y OUT
func procedureHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Solo se permite POST"})
		return
	}

	var req struct {
		Name   string `json:"name"`
		Params []struct {
			Name      string      `json:"name"`
			Value     interface{} `json:"value,omitempty"`
			Direction string      `json:"direction,omitempty"`
			Type      string      `json:"type,omitempty"` // "number", "string", "date"
		} `json:"params"`
		IsFunction bool `json:"isFunction,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
		return
	}
	if req.Name == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Falta el campo 'name'"})
		return
	}

	placeholders := []string{}
	args := []interface{}{}
	outIndexes := make(map[int]string)
	outBuffers := make(map[int]*string)
	outNumMap := make(map[int]*sql.NullFloat64)

	// Si es función, el primer OUT es el valor de retorno
	if req.IsFunction {
		// Buscar el primer parámetro OUT (valor de retorno)
		retIndex := -1
		for i, p := range req.Params {
			if strings.ToUpper(p.Direction) == "OUT" {
				retIndex = i
				break
			}
		}
		if retIndex == -1 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Debe incluir un parámetro OUT para el valor de retorno"})
			return
		}
		// Agregar el OUT de retorno como primer parámetro
		p := req.Params[retIndex]
		placeholders = append(placeholders, ":1")
		if strings.Contains(strings.ToLower(p.Name), "resultado") || strings.Contains(strings.ToLower(p.Name), "total") || strings.Contains(strings.ToLower(p.Name), "count") || strings.Contains(strings.ToLower(p.Name), "suma") || strings.Contains(strings.ToLower(p.Name), "num") {
			var outNum sql.NullFloat64
			args = append(args, sql.Out{Dest: &outNum, In: false})
			outIndexes[0] = p.Name
			outNumMap[0] = &outNum
		} else {
			outStr := ""
			args = append(args, sql.Out{Dest: &outStr, In: false})
			outIndexes[0] = p.Name
			outBuffers[0] = &outStr
		}
		// Agregar el resto de parámetros (excepto el OUT de retorno)
		paramPos := 2
		for i, p := range req.Params {
			if i == retIndex {
				continue
			}
			placeholders = append(placeholders, fmt.Sprintf(":%d", paramPos))
			if strings.ToUpper(p.Direction) == "OUT" {
				lowerName := strings.ToLower(p.Name)
				// Verificar tipo explícito o inferir por nombre
				isNumeric := strings.ToLower(p.Type) == "number" ||
					strings.Contains(lowerName, "resultado") || strings.Contains(lowerName, "result") ||
					strings.Contains(lowerName, "total") || strings.Contains(lowerName, "count") ||
					strings.Contains(lowerName, "suma") || strings.Contains(lowerName, "num") ||
					strings.Contains(lowerName, "int") || strings.Contains(lowerName, "id")

				if isNumeric {
					var outNum sql.NullFloat64
					args = append(args, sql.Out{Dest: &outNum, In: false})
					outIndexes[paramPos-1] = p.Name
					outNumMap[paramPos-1] = &outNum
				} else {
					outStr := strings.Repeat(" ", 4000) // Buffer de 4000 caracteres
					args = append(args, sql.Out{Dest: &outStr, In: false})
					outIndexes[paramPos-1] = p.Name
					outBuffers[paramPos-1] = &outStr
				}
			} else {
				args = append(args, p.Value)
			}
			paramPos++
		}
		call := fmt.Sprintf("BEGIN :1 := %s(%s); END;", req.Name, strings.Join(placeholders[1:], ", "))

		stmt, err := db.Prepare(call)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		defer stmt.Close()

		if _, err := stmt.Exec(args...); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		out := make(map[string]interface{})
		for i, name := range outIndexes {
			if numPtr, ok := outNumMap[i]; ok && numPtr != nil {
				if numPtr.Valid {
					out[name] = numPtr.Float64
				} else {
					out[name] = nil
				}
				continue
			}
			if ptr, ok := outBuffers[i]; ok && ptr != nil {
				out[name] = *ptr
			}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok", "out": out})
		return
	}

	// Procedimiento normal (no función)
	for i, p := range req.Params {
		placeholders = append(placeholders, fmt.Sprintf(":%d", i+1))
		if strings.ToUpper(p.Direction) == "OUT" {
			lowerName := strings.ToLower(p.Name)
			// Verificar tipo explícito o inferir por nombre
			isNumeric := strings.ToLower(p.Type) == "number" ||
				strings.Contains(lowerName, "resultado") || strings.Contains(lowerName, "result") ||
				strings.Contains(lowerName, "total") || strings.Contains(lowerName, "count") ||
				strings.Contains(lowerName, "suma") || strings.Contains(lowerName, "num") ||
				strings.Contains(lowerName, "int") || strings.Contains(lowerName, "id")

			if isNumeric {
				var outNum sql.NullFloat64
				args = append(args, sql.Out{Dest: &outNum, In: false})
				outIndexes[0] = p.Name
				outNumMap[0] = &outNum
			} else {
				outStr := strings.Repeat(" ", 4000) // Buffer de 4000 caracteres
				args = append(args, sql.Out{Dest: &outStr, In: false})
				outIndexes[0] = p.Name
				outBuffers[0] = &outStr
			}
		} else {
			// Detección automática de fechas por nombre o formato
			if strings.Contains(strings.ToLower(p.Name), "fecha") || strings.Contains(strings.ToLower(p.Name), "periodo") {
				// Intentar parsear como yyyy-mm-dd o dd/mm/yyyy
				var t time.Time
				var err error
				if s, ok := p.Value.(string); ok {
					t, err = time.Parse("2006-01-02", s)
					if err != nil {
						t, err = time.Parse("02/01/2006", s)
					}
					if err == nil {
						args = append(args, t)
						continue
					}
				}
			}
			args = append(args, p.Value)
		}
	}
	call := fmt.Sprintf("BEGIN %s(%s); END;", req.Name, strings.Join(placeholders, ", "))

	stmt, err := db.Prepare(call)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	defer stmt.Close()

	if _, err := stmt.Exec(args...); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	out := make(map[string]interface{})
	for i, name := range outIndexes {
		if numPtr, ok := outNumMap[i]; ok && numPtr != nil {
			if numPtr.Valid {
				out[name] = numPtr.Float64
			} else {
				out[name] = nil
			}
			continue
		}
		if ptr, ok := outBuffers[i]; ok && ptr != nil {
			out[name] = *ptr
		}
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok", "out": out})
}

// asyncProcedureHandler ejecuta un procedimiento de forma asíncrona
func asyncProcedureHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Solo se permite POST"})
		return
	}

	var req struct {
		Name       string `json:"name"`
		IsFunction bool   `json:"isFunction"`
		Params     []struct {
			Name      string      `json:"name"`
			Value     interface{} `json:"value,omitempty"`
			Direction string      `json:"direction"`
			Type      string      `json:"type,omitempty"`
		} `json:"params"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
		return
	}

	// Crear el job
	job := jobManager.CreateJob(req.Name)

	// Responder inmediatamente con el ID del job
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":           "accepted",
		"job_id":           job.ID,
		"message":          "Procedimiento ejecutándose en segundo plano",
		"check_status_url": fmt.Sprintf("/jobs/%s", job.ID),
	})

	// Ejecutar el procedimiento en una goroutine
	go func() {
		// Actualizar estado a running
		jobManager.UpdateJob(job.ID, func(j *AsyncJob) {
			j.Status = JobStatusRunning
			j.Progress = 10
		})

		// Preparar parámetros igual que en procedureHandler
		placeholders := []string{}
		args := []interface{}{}
		outIndexes := []string{}
		outBuffers := make(map[int]*string)
		outNumMap := make(map[int]*sql.NullFloat64)

		if req.IsFunction {
			outIdx := 0
			placeholders = append(placeholders, ":1")
			ptr := new(string)
			*ptr = ""
			outBuffers[outIdx] = ptr
			args = append(args, sql.Out{Dest: ptr})
			outIndexes = append(outIndexes, "return_value")
		}

		for _, p := range req.Params {
			if p.Direction == "OUT" {
				outIdx := len(outIndexes)
				placeholders = append(placeholders, fmt.Sprintf(":%d", len(placeholders)+1))

				// Detección automática de tipo
				pType := strings.ToLower(p.Type)
				pNameLower := strings.ToLower(p.Name)
				isNumber := false

				if pType == "number" || pType == "integer" || pType == "float" {
					isNumber = true
				} else if pType == "" {
					numberKeywords := []string{"resultado", "result", "total", "count", "suma", "num", "int", "id"}
					for _, kw := range numberKeywords {
						if strings.Contains(pNameLower, kw) {
							isNumber = true
							break
						}
					}
				}

				if isNumber {
					numPtr := new(sql.NullFloat64)
					outNumMap[outIdx] = numPtr
					args = append(args, sql.Out{Dest: numPtr})
				} else {
					ptr := new(string)
					*ptr = strings.Repeat(" ", 4000)
					outBuffers[outIdx] = ptr
					args = append(args, sql.Out{Dest: ptr})
				}
				outIndexes = append(outIndexes, p.Name)
			} else {
				placeholders = append(placeholders, fmt.Sprintf(":%d", len(placeholders)+1))

				// Detección automática de fechas
				if strings.Contains(strings.ToLower(p.Name), "fecha") || strings.Contains(strings.ToLower(p.Name), "periodo") {
					var t time.Time
					var err error
					if s, ok := p.Value.(string); ok {
						t, err = time.Parse("2006-01-02", s)
						if err != nil {
							t, err = time.Parse("02/01/2006", s)
						}
						if err == nil {
							args = append(args, t)
							continue
						}
					}
				}
				args = append(args, p.Value)
			}
		}

		jobManager.UpdateJob(job.ID, func(j *AsyncJob) {
			j.Progress = 30
		})

		call := fmt.Sprintf("BEGIN %s(%s); END;", req.Name, strings.Join(placeholders, ", "))

		stmt, err := db.Prepare(call)
		if err != nil {
			endTime := time.Now()
			jobManager.UpdateJob(job.ID, func(j *AsyncJob) {
				j.Status = JobStatusFailed
				j.Error = err.Error()
				j.EndTime = &endTime
				j.Duration = endTime.Sub(j.StartTime).String()
				j.Progress = 100
			})
			return
		}
		defer stmt.Close()

		jobManager.UpdateJob(job.ID, func(j *AsyncJob) {
			j.Progress = 50
		})

		if _, err := stmt.Exec(args...); err != nil {
			endTime := time.Now()
			jobManager.UpdateJob(job.ID, func(j *AsyncJob) {
				j.Status = JobStatusFailed
				j.Error = err.Error()
				j.EndTime = &endTime
				j.Duration = endTime.Sub(j.StartTime).String()
				j.Progress = 100
			})
			return
		}

		jobManager.UpdateJob(job.ID, func(j *AsyncJob) {
			j.Progress = 80
		})

		// Recopilar resultados OUT
		out := make(map[string]interface{})
		for i, name := range outIndexes {
			if numPtr, ok := outNumMap[i]; ok && numPtr != nil {
				if numPtr.Valid {
					out[name] = numPtr.Float64
				} else {
					out[name] = nil
				}
				continue
			}
			if ptr, ok := outBuffers[i]; ok && ptr != nil {
				out[name] = *ptr
			}
		}

		// Completado exitosamente
		endTime := time.Now()
		jobManager.UpdateJob(job.ID, func(j *AsyncJob) {
			j.Status = JobStatusCompleted
			j.Result = out
			j.EndTime = &endTime
			j.Duration = endTime.Sub(j.StartTime).String()
			j.Progress = 100
		})
	}()
}

// jobsHandler maneja consultas de estado de jobs
func jobsHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/jobs")
	path = strings.TrimPrefix(path, "/")

	// Si hay un ID, buscar ese job específico
	if path != "" {
		job, exists := jobManager.GetJob(path)
		if !exists {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Job no encontrado"})
			return
		}
		json.NewEncoder(w).Encode(job)
		return
	}

	// Sin ID, listar todos los jobs
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Solo se permite GET"})
		return
	}

	jobs := jobManager.GetAllJobs()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"total": len(jobs),
		"jobs":  jobs,
	})
}

func pingHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if err := db.Ping(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func queryHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Solo se permite POST"})
		return
	}

	var req struct {
		Query string `json:"query"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
		return
	}
	if strings.TrimSpace(req.Query) == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Falta el campo 'query'"})
		return
	}

	// Normalizar saltos de línea: reemplazar \r\n y \n por salto de línea real
	normalizedQuery := strings.ReplaceAll(req.Query, "\r\n", "\n")
	normalizedQuery = strings.ReplaceAll(normalizedQuery, "\\n", "\n")
	rows, err := db.Query(normalizedQuery)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	results := []map[string]interface{}{}
	for rows.Next() {
		columns := make([]interface{}, len(cols))
		columnPointers := make([]interface{}, len(cols))
		for i := range columns {
			columnPointers[i] = &columns[i]
		}
		if err := rows.Scan(columnPointers...); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		rowMap := make(map[string]interface{})
		for i, colName := range cols {
			val := columns[i]
			b, ok := val.([]byte)
			if ok {
				rowMap[colName] = string(b)
			} else {
				rowMap[colName] = val
			}
		}
		results = append(results, rowMap)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"results": results})
}

func ipAllowed(remoteIP string, allowedIPs []string) bool {
	parsedRemote := net.ParseIP(remoteIP)
	if parsedRemote == nil {
		return false
	}
	for _, ip := range allowedIPs {
		ip = strings.TrimSpace(ip)
		if ip == "" {
			continue
		}
		if ip == "localhost" && (remoteIP == "127.0.0.1" || remoteIP == "::1") {
			return true
		}
		if strings.Contains(ip, "/") {
			// Rango CIDR
			_, cidrNet, err := net.ParseCIDR(ip)
			if err == nil && cidrNet.Contains(parsedRemote) {
				return true
			}
		} else {
			// IP exacta
			if ip == remoteIP {
				return true
			}
		}
	}
	return false
}

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		enableCORS(&w, r)

		// Permitir peticiones OPTIONS (preflight) sin autenticación
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if os.Getenv("API_NO_AUTH") == "1" {
			next(w, r)
			return
		}
		token := os.Getenv("API_TOKEN")
		authHeader := r.Header.Get("Authorization")
		expected := "Bearer " + token
		if token == "" || authHeader != expected {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "No autorizado"})
			return
		}
		allowedIPs := os.Getenv("API_ALLOWED_IPS")
		if allowedIPs != "" {
			ipList := strings.Split(allowedIPs, ",")
			remoteIP := r.RemoteAddr
			if colon := strings.LastIndex(remoteIP, ":"); colon != -1 {
				remoteIP = remoteIP[:colon]
			}
			remoteIP = strings.Trim(remoteIP, "[]")
			log.Printf("Debug IP: remoteIP=%s, allowedIPs=%v", remoteIP, ipList)
			if !ipAllowed(remoteIP, ipList) {
				log.Printf("IP rechazada: %s", remoteIP)
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "IP no permitida", "ip": remoteIP})
				return
			}
		}
		next(w, r)
	}
}

func execHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Solo se permite POST"})
		return
	}

	var req struct {
		Query string `json:"query"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
		return
	}
	if req.Query == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Falta el campo 'query'"})
		return
	}

	// Detectar si es un comando de modificación
	q := req.Query
	qType := ""
	if len(q) > 0 {
		for i := 0; i < len(q) && (q[i] == ' ' || q[i] == '\t' || q[i] == '\n'); i++ {
			q = q[1:]
		}
		if len(q) >= 6 && (q[:6] == "INSERT" || q[:6] == "insert") {
			qType = "exec"
		} else if len(q) >= 6 && (q[:6] == "UPDATE" || q[:6] == "update") {
			qType = "exec"
		} else if len(q) >= 6 && (q[:6] == "DELETE" || q[:6] == "delete") {
			qType = "exec"
		}
	}

	if qType == "exec" {
		res, err := db.Exec(req.Query)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		rowsAffected, _ := res.RowsAffected()
		json.NewEncoder(w).Encode(map[string]interface{}{"rows_affected": rowsAffected})
		return
	}

	rows, err := db.Query(req.Query)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	results := []map[string]interface{}{}
	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		rowMap := make(map[string]interface{})
		for i, col := range columns {
			var v interface{}
			val := values[i]
			b, ok := val.([]byte)
			if ok {
				v = string(b)
			} else {
				v = val
			}
			rowMap[col] = v
		}
		results = append(results, rowMap)
	}
	json.NewEncoder(w).Encode(results)
}

// enableCORS agrega los headers necesarios para CORS
func enableCORS(w *http.ResponseWriter, _ *http.Request) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}
