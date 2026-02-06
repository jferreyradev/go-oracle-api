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
	"regexp"
	"runtime"
	"strconv"
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
	Params    map[string]interface{} `json:"params,omitempty"`
	StartTime time.Time              `json:"start_time"`
	EndTime   *time.Time             `json:"end_time,omitempty"`
	Duration  string                 `json:"duration,omitempty"`
	Result    map[string]interface{} `json:"result,omitempty"`
	Error     string                 `json:"error,omitempty"`
	Progress  int                    `json:"progress"` // 0-100
}

// QueryLog representa un registro de consulta ejecutada
type QueryLog struct {
	ID            string    `json:"id"`
	QueryType     string    `json:"query_type"` // QUERY, EXEC, PROCEDURE
	QueryText     string    `json:"query_text"`
	Params        string    `json:"params,omitempty"`
	ExecutionTime time.Time `json:"execution_time"`
	Duration      string    `json:"duration"`
	RowsAffected  int64     `json:"rows_affected"`
	Success       bool      `json:"success"`
	ErrorMsg      string    `json:"error_msg,omitempty"`
	UserIP        string    `json:"user_ip,omitempty"`
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
	if _, err := rand.Read(b); err != nil {
		log.Printf("Error generando ID: %v", err)
		// Fallback: usar timestamp
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// CreateJob crea un nuevo job y lo registra (en memoria y BD)
func (jm *JobManager) CreateJob(procName string, params map[string]interface{}) *AsyncJob {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	job := &AsyncJob{
		ID:        generateJobID(),
		Status:    JobStatusPending,
		ProcName:  procName,
		Params:    params,
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

// formatObjectName formatea el nombre de un procedimiento/función considerando esquema
// Retorna el nombre formateado según las reglas:
// - Si schema especificado: SCHEMA.NAME (sin comillas)
// - Si name contiene punto: "PARTE1"."PARTE2" (con comillas)
// - Si nombre simple: NAME (sin comillas, en mayúsculas)
func formatObjectName(schema, name string) string {
	if schema != "" {
		// Si se especifica el esquema por separado, usar SCHEMA.NAME sin comillas
		return fmt.Sprintf("%s.%s", strings.ToUpper(schema), strings.ToUpper(name))
	} else if strings.Contains(name, ".") && !strings.Contains(name, "\"") {
		// Si contiene punto y no tiene comillas, agregar comillas dobles a cada parte
		parts := strings.Split(name, ".")
		for i, part := range parts {
			parts[i] = fmt.Sprintf("\"%s\"", strings.ToUpper(part))
		}
		return strings.Join(parts, ".")
	}
	// Nombre simple, sin esquema
	return strings.ToUpper(name)
}

// DeleteJob elimina un job específico por ID (memoria y BD)
func (jm *JobManager) DeleteJob(id string) error {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	if _, exists := jm.jobs[id]; !exists {
		return fmt.Errorf("job no encontrado")
	}

	// Eliminar de memoria
	delete(jm.jobs, id)

	// Eliminar de BD
	if db != nil {
		_, err := db.Exec("DELETE FROM ASYNC_JOBS WHERE JOB_ID = :1", id)
		if err != nil {
			log.Printf("Error eliminando job %s de BD: %v", id, err)
			return err
		}
	}

	return nil
}

// DeleteJobs elimina múltiples jobs según criterios
func (jm *JobManager) DeleteJobs(status []string, olderThanDays int) (int, error) {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	var deleted []string
	cutoff := time.Now().AddDate(0, 0, -olderThanDays)

	for id, job := range jm.jobs {
		shouldDelete := false

		// Filtro por status
		if len(status) > 0 {
			for _, s := range status {
				if string(job.Status) == s {
					shouldDelete = true
					break
				}
			}
		} else if olderThanDays > 0 {
			// Filtro por fecha
			if job.StartTime.Before(cutoff) {
				shouldDelete = true
			}
		}

		if shouldDelete {
			deleted = append(deleted, id)
		}
	}

	// Eliminar de memoria
	for _, id := range deleted {
		delete(jm.jobs, id)
	}

	// Eliminar de BD
	if db != nil && len(deleted) > 0 {
		for _, id := range deleted {
			_, err := db.Exec("DELETE FROM ASYNC_JOBS WHERE JOB_ID = :1", id)
			if err != nil {
				log.Printf("Error eliminando job %s de BD: %v", id, err)
			}
		}
	}

	return len(deleted), nil
}

// saveJobToDB guarda un job en la base de datos
func (jm *JobManager) saveJobToDB(job *AsyncJob) {
	if db == nil {
		return
	}

	// Convertir parámetros a JSON
	var paramsJSON string
	if job.Params != nil {
		if jsonBytes, err := json.Marshal(job.Params); err == nil {
			paramsJSON = string(jsonBytes)
		}
	}

	_, err := db.Exec(`
		INSERT INTO ASYNC_JOBS (
			JOB_ID, STATUS, PROCEDURE_NAME, PARAMS, START_TIME, 
			END_TIME, DURATION, RESULT, ERROR_MSG, PROGRESS
		) VALUES (
			:1, :2, :3, :4, :5, :6, :7, :8, :9, :10
		)`,
		job.ID,
		string(job.Status),
		job.ProcName,
		paramsJSON,
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
func (jm *JobManager) LoadJobsFromDB() {
	if db == nil {
		return
	}

	rows, err := db.Query(`
		SELECT JOB_ID, STATUS, PROCEDURE_NAME, PARAMS, START_TIME,
		       END_TIME, DURATION, RESULT, ERROR_MSG, PROGRESS
		FROM ASYNC_JOBS
		WHERE START_TIME >= SYSDATE - 1
		ORDER BY START_TIME DESC
	`)

	if err != nil {
		if strings.Contains(err.Error(), "ORA-00942") {
			log.Println("⚠️  Tabla ASYNC_JOBS no existe. Ejecuta: sqlplus @sql/create_async_jobs_table.sql")
		}
		return
	}
	defer rows.Close()

	jm.mu.Lock()
	defer jm.mu.Unlock()

	count := 0
	for rows.Next() {
		var job AsyncJob
		var endTime sql.NullTime
		var duration, paramsJSON, resultJSON, errorMsg sql.NullString

		err := rows.Scan(&job.ID, &job.Status, &job.ProcName, &paramsJSON, &job.StartTime,
			&endTime, &duration, &resultJSON, &errorMsg, &job.Progress)

		if err == nil {
			if endTime.Valid {
				job.EndTime = &endTime.Time
			}
			if duration.Valid {
				job.Duration = duration.String
			}
			if paramsJSON.Valid && paramsJSON.String != "" {
				if err := json.Unmarshal([]byte(paramsJSON.String), &job.Params); err != nil {
					log.Printf("Error deserializando parámetros del job %s: %v", job.ID, err)
				}
			}
			if resultJSON.Valid && resultJSON.String != "" {
				if err := json.Unmarshal([]byte(resultJSON.String), &job.Result); err != nil {
					log.Printf("Error deserializando resultado del job %s: %v", job.ID, err)
				}
			}
			if errorMsg.Valid {
				job.Error = errorMsg.String
			}
			jm.jobs[job.ID] = &job
			count++
		}
	}

	if count > 0 {
		log.Printf("✅ Cargados %d jobs desde Oracle", count)
	}
}

// createTableIfNotExists crea la tabla ASYNC_JOBS si no existe
func createTableIfNotExists() error {
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
		log.Println("✅ Tabla ASYNC_JOBS ya existe")
		return nil
	}

	// Crear la tabla
	log.Println("📝 Creando tabla ASYNC_JOBS...")

	createTableSQL := `
		CREATE TABLE ASYNC_JOBS (
			JOB_ID VARCHAR2(32) PRIMARY KEY,
			STATUS VARCHAR2(20) NOT NULL,
			PROCEDURE_NAME VARCHAR2(200) NOT NULL,
			PARAMS CLOB,
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
		return fmt.Errorf("error creando tabla: %v", err)
	}

	// Crear índices
	if _, err := db.Exec("CREATE INDEX IDX_ASYNC_JOBS_STATUS ON ASYNC_JOBS(STATUS)"); err != nil {
		log.Printf("⚠️  Error creando índice IDX_ASYNC_JOBS_STATUS: %v", err)
	}
	if _, err := db.Exec("CREATE INDEX IDX_ASYNC_JOBS_START_TIME ON ASYNC_JOBS(START_TIME)"); err != nil {
		log.Printf("⚠️  Error creando índice IDX_ASYNC_JOBS_START_TIME: %v", err)
	}
	if _, err := db.Exec("CREATE INDEX IDX_ASYNC_JOBS_CREATED_AT ON ASYNC_JOBS(CREATED_AT)"); err != nil {
		log.Printf("⚠️  Error creando índice IDX_ASYNC_JOBS_CREATED_AT: %v", err)
	}

	log.Println("✅ Tabla ASYNC_JOBS creada exitosamente")
	return nil
}

// createQueryLogTable crea la tabla QUERY_LOG si no existe
func createQueryLogTable() error {
	// Verificar si la tabla existe
	var tableName string
	err := db.QueryRow("SELECT table_name FROM user_tables WHERE table_name = 'QUERY_LOG'").Scan(&tableName)
	if err == nil {
		log.Println("✅ Tabla QUERY_LOG ya existe")
		return nil
	}

	log.Println("📝 Creando tabla QUERY_LOG...")

	createTableSQL := `
		CREATE TABLE QUERY_LOG (
			LOG_ID VARCHAR2(32) PRIMARY KEY,
			QUERY_TYPE VARCHAR2(20) NOT NULL,
			QUERY_TEXT CLOB NOT NULL,
			PARAMS CLOB,
			EXECUTION_TIME TIMESTAMP NOT NULL,
			DURATION VARCHAR2(50),
			ROWS_AFFECTED NUMBER,
			SUCCESS NUMBER(1) DEFAULT 1,
			ERROR_MSG CLOB,
			USER_IP VARCHAR2(50),
			CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`

	_, err = db.Exec(createTableSQL)
	if err != nil {
		return fmt.Errorf("error creando tabla QUERY_LOG: %v", err)
	}

	// Crear índices
	if _, err := db.Exec("CREATE INDEX IDX_QUERY_LOG_TYPE ON QUERY_LOG(QUERY_TYPE)"); err != nil {
		log.Printf("⚠️  Error creando índice IDX_QUERY_LOG_TYPE: %v", err)
	}
	if _, err := db.Exec("CREATE INDEX IDX_QUERY_LOG_TIME ON QUERY_LOG(EXECUTION_TIME)"); err != nil {
		log.Printf("⚠️  Error creando índice IDX_QUERY_LOG_TIME: %v", err)
	}
	if _, err := db.Exec("CREATE INDEX IDX_QUERY_LOG_SUCCESS ON QUERY_LOG(SUCCESS)"); err != nil {
		log.Printf("⚠️  Error creando índice IDX_QUERY_LOG_SUCCESS: %v", err)
	}
	if _, err := db.Exec("CREATE INDEX IDX_QUERY_LOG_CREATED ON QUERY_LOG(CREATED_AT)"); err != nil {
		log.Printf("⚠️  Error creando índice IDX_QUERY_LOG_CREATED: %v", err)
	}

	log.Println("✅ Tabla QUERY_LOG creada exitosamente")
	return nil
}

// saveQueryLog guarda un registro de consulta en la base de datos
func saveQueryLog(qlog *QueryLog) {
	startTime := time.Now()

	// Preparar valores para INSERT
	successInt := 0
	if qlog.Success {
		successInt = 1
	}

	query := `
		INSERT INTO QUERY_LOG (
			LOG_ID, QUERY_TYPE, QUERY_TEXT, PARAMS,
			EXECUTION_TIME, DURATION, ROWS_AFFECTED,
			SUCCESS, ERROR_MSG, USER_IP, CREATED_AT
		) VALUES (
			:1, :2, :3, :4, :5, :6, :7, :8, :9, :10, CURRENT_TIMESTAMP
		)`

	_, err := db.Exec(query,
		qlog.ID,
		qlog.QueryType,
		qlog.QueryText,
		qlog.Params,
		qlog.ExecutionTime,
		qlog.Duration,
		qlog.RowsAffected,
		successInt,
		qlog.ErrorMsg,
		qlog.UserIP,
	)

	if err != nil {
		log.Printf("Error guardando query log %s en BD: %v", qlog.ID, err)
	} else {
		elapsed := time.Since(startTime)
		if elapsed > 100*time.Millisecond {
			log.Printf("⚠️  saveQueryLog tardó %v para log %s", elapsed, qlog.ID)
		}
	}
}

// generateID genera un ID único para los logs
func generateID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		log.Printf("Error generando ID: %v", err)
		// Fallback: usar timestamp
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("%x", b)
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
	database, err := sql.Open("oracle", dsn)
	if err != nil {
		return nil, fmt.Errorf("error al abrir driver Oracle: %w", err)
	}

	// Configurar pool de conexiones para procedimientos largos
	database.SetMaxOpenConns(25)                  // Máximo de conexiones abiertas
	database.SetMaxIdleConns(5)                   // Conexiones idle
	database.SetConnMaxLifetime(0)                // Sin límite de tiempo de vida (0 = infinito)
	database.SetConnMaxIdleTime(10 * time.Minute) // Cerrar idle después de 10 min

	// Verificar que la conexión sea válida con timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := database.PingContext(ctx); err != nil {
		database.Close()
		return nil, fmt.Errorf("no se pudo conectar a la base de datos Oracle (host=%s:%s servicio=%s usuario=%s): %w",
			cfg.OracleHost, cfg.OraclePort, cfg.OracleService, cfg.OracleUser, err)
	}

	return database, nil
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
		if err := os.Mkdir("log", 0755); err != nil {
			log.Printf("⚠️  No se pudo crear carpeta log: %v", err)
		}
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
		defer logFile.Close()  // Cerrar el archivo al finalizar
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
	http.HandleFunc("/download", logRequest(authMiddleware(downloadHandler)))
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

	fmt.Println("==============================")
	fmt.Println("Intentando conectar a Oracle...")
	fmt.Printf("Host: %s:%s\n", cfg.OracleHost, cfg.OraclePort)
	fmt.Printf("Servicio: %s\n", cfg.OracleService)
	fmt.Printf("Usuario: %s\n", cfg.OracleUser)
	fmt.Println("==============================")

	db, err = openOracleConnection(cfg)
	if err != nil {
		errorMsg := fmt.Sprintf("\n❌ ERROR FATAL: No se pudo establecer conexión con la base de datos\n\n%v\n\nVerifica:\n1. Que Oracle esté ejecutándose\n2. Los datos de conexión en el archivo .env\n3. La conectividad de red al servidor\n4. El firewall y puertos abiertos\n\n", err)
		fmt.Fprint(os.Stderr, errorMsg)
		_ = os.WriteFile("log/last_error.txt", []byte(errorMsg), 0644)
		log.Fatal(errorMsg)
	}
	defer db.Close()

	fmt.Println("✅ Conexión a Oracle establecida correctamente")
	fmt.Println()

	port := cfg.ListenPort
	user := cfg.OracleUser
	host := cfg.OracleHost
	service := cfg.OracleService

	// ===============================
	// 5. Inicializar tabla y cargar jobs asíncronos
	// ===============================
	if err := createTableIfNotExists(); err != nil {
		log.Printf("⚠️  No se pudo crear/verificar tabla ASYNC_JOBS: %v", err)
	}
	if err := createQueryLogTable(); err != nil {
		log.Printf("⚠️  No se pudo crear/verificar tabla QUERY_LOG: %v", err)
	}
	jobManager.LoadJobsFromDB()

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
	log.Println("- Endpoint de download: /download")
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
	fmt.Println("  /procedure - Ejecuta un procedimiento almacenado (POST)")
	fmt.Println("  /procedure/async - Ejecuta un procedimiento en segundo plano (POST)")
	fmt.Println("  /jobs                - Lista todos los jobs asíncronos (GET)")
	fmt.Println("  /jobs?status=...     - Elimina jobs por status: completed,failed (DELETE)")
	fmt.Println("  /jobs?older_than=7   - Elimina jobs más antiguos que N días (DELETE)")
	fmt.Println("  /jobs/{id}           - Consulta el estado de un job específico (GET)")
	fmt.Println("  /jobs/{id}           - Elimina un job específico (DELETE)")
	fmt.Println("  /upload    - Sube un archivo como BLOB (POST)")
	fmt.Println("  /download  - Descarga un archivo BLOB por ID (GET)")
	fmt.Println("              Params: id (requerido), table (opcional, default: archivos)")
	fmt.Println("              Ejemplo: /download?id=123 o /download?id=123&table=documentos")
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
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
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

// downloadHandler descarga archivos BLOB desde la base de datos
func downloadHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Solo se permite GET"})
		return
	}

	// Obtener parámetros de la query
	id := r.URL.Query().Get("id")
	table := r.URL.Query().Get("table")

	if id == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Falta el parámetro 'id'"})
		return
	}

	// Tabla por defecto
	if table == "" {
		table = "archivos"
	}

	// Validar nombre de tabla para prevenir SQL injection
	// Solo permitir letras, números y guiones bajos, máximo 30 caracteres
	validTableName := regexp.MustCompile(`^[a-zA-Z0-9_]+$`)
	if !validTableName.MatchString(table) || len(table) > 30 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Nombre de tabla inválido"})
		return
	}

	// Query para obtener el archivo
	query := fmt.Sprintf("SELECT nombre, contenido FROM %s WHERE id = :1", table)

	var nombre string
	var contenido []byte

	err := db.QueryRow(query, id).Scan(&nombre, &contenido)
	if err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Archivo no encontrado"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error consultando BD: " + err.Error()})
		return
	}

	// Detectar tipo MIME basado en la extensión del archivo
	contentType := "application/octet-stream"
	if strings.HasSuffix(strings.ToLower(nombre), ".pdf") {
		contentType = "application/pdf"
	} else if strings.HasSuffix(strings.ToLower(nombre), ".jpg") || strings.HasSuffix(strings.ToLower(nombre), ".jpeg") {
		contentType = "image/jpeg"
	} else if strings.HasSuffix(strings.ToLower(nombre), ".png") {
		contentType = "image/png"
	} else if strings.HasSuffix(strings.ToLower(nombre), ".txt") {
		contentType = "text/plain"
	} else if strings.HasSuffix(strings.ToLower(nombre), ".json") {
		contentType = "application/json"
	}

	// Configurar headers para la descarga
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", nombre))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(contenido)))

	// Enviar el contenido del archivo
	w.WriteHeader(http.StatusOK)
	w.Write(contenido)
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
		Schema string `json:"schema,omitempty"` // Esquema del procedimiento/función
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

	// Log para debug: mostrar el JSON recibido
	reqJSON, _ := json.MarshalIndent(req, "", "  ")
	log.Printf("[PROCEDURE] JSON recibido:\n%s", string(reqJSON))

	if req.Name == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Falta el campo 'name'"})
		return
	}

	if req.Schema != "" {
		log.Printf("[PROCEDURE] Ejecutando: %s.%s con %d parámetros", req.Schema, req.Name, len(req.Params))
	} else {
		log.Printf("[PROCEDURE] Ejecutando: %s con %d parámetros", req.Name, len(req.Params))
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

		// Formatear el nombre para manejar esquema.función correctamente
		functionName := formatObjectName(req.Schema, req.Name)

		call := fmt.Sprintf("BEGIN :1 := %s(%s); END;", functionName, strings.Join(placeholders[1:], ", "))
		log.Printf("[PROCEDURE] SQL generado para función: %s", call)

		stmt, err := db.Prepare(call)
		if err != nil {
			errorMsg := err.Error()

			// Mejorar el mensaje de error
			if strings.Contains(errorMsg, "PLS-00201") {
				errorMsg = fmt.Sprintf("Función '%s' no encontrada. Verifica que existe en la base de datos.", req.Name)
			} else if strings.Contains(errorMsg, "PLS-00306") {
				errorMsg = fmt.Sprintf("Parámetros incorrectos para '%s'. Verifica tipos y cantidad de parámetros.", req.Name)
			}

			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": errorMsg})
			return
		}
		defer stmt.Close()

		if _, err := stmt.Exec(args...); err != nil {
			errorMsg := err.Error()

			// Mejorar mensajes de error comunes
			if strings.Contains(errorMsg, "ORA-06502") {
				errorMsg = "Error de conversión de tipos. Verifica que los tipos de datos sean correctos."
			} else if strings.Contains(errorMsg, "ORA-01403") {
				errorMsg = "No se encontraron datos. La función no retornó resultados."
			}

			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": errorMsg})
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
	outParamIndex := 0 // Contador para rastrear índice de parámetros OUT
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
				outIndexes[outParamIndex] = p.Name
				outNumMap[outParamIndex] = &outNum
			} else {
				outStr := strings.Repeat(" ", 4000) // Buffer de 4000 caracteres
				args = append(args, sql.Out{Dest: &outStr, In: false})
				outIndexes[outParamIndex] = p.Name
				outBuffers[outParamIndex] = &outStr
			}
			outParamIndex++ // Incrementar índice para el siguiente OUT
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

	// Formatear el nombre para manejar esquema.procedimiento correctamente
	procedureName := formatObjectName(req.Schema, req.Name)

	call := fmt.Sprintf("BEGIN %s(%s); END;", procedureName, strings.Join(placeholders, ", "))
	log.Printf("[PROCEDURE] SQL generado para procedimiento: %s", call)

	// Crear log
	startExec := time.Now()
	paramsJSON, _ := json.Marshal(req.Params)
	qlog := &QueryLog{
		ID:            generateID(),
		QueryType:     "PROCEDURE",
		QueryText:     req.Name,
		Params:        string(paramsJSON),
		ExecutionTime: startExec,
		UserIP:        r.RemoteAddr,
	}

	stmt, err := db.Prepare(call)
	if err != nil {
		errorMsg := err.Error()

		// Mejorar el mensaje de error
		if strings.Contains(errorMsg, "PLS-00201") {
			errorMsg = fmt.Sprintf("Procedimiento '%s' no encontrado. Verifica que existe en la base de datos.", req.Name)
		} else if strings.Contains(errorMsg, "PLS-00306") {
			errorMsg = fmt.Sprintf("Parámetros incorrectos para '%s'. Verifica tipos y cantidad de parámetros.", req.Name)
		}

		qlog.Success = false
		qlog.ErrorMsg = errorMsg
		qlog.Duration = time.Since(startExec).String()
		go saveQueryLog(qlog)

		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": errorMsg})
		return
	}
	defer stmt.Close()

	if _, err := stmt.Exec(args...); err != nil {
		errorMsg := err.Error()

		// Mejorar mensajes de error comunes
		if strings.Contains(errorMsg, "ORA-06502") {
			errorMsg = "Error de conversión de tipos. Verifica que los tipos de datos sean correctos."
		} else if strings.Contains(errorMsg, "ORA-01403") {
			errorMsg = "No se encontraron datos. El procedimiento no retornó resultados."
		}

		qlog.Success = false
		qlog.ErrorMsg = errorMsg
		qlog.Duration = time.Since(startExec).String()
		go saveQueryLog(qlog)

		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": errorMsg})
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

	qlog.Success = true
	qlog.RowsAffected = int64(len(out))
	qlog.Duration = time.Since(startExec).String()
	go saveQueryLog(qlog)

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
		Schema     string `json:"schema,omitempty"` // Esquema del procedimiento/función
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

	// Preparar parámetros para guardar en el job
	paramsMap := make(map[string]interface{})
	paramsMap["name"] = req.Name
	paramsMap["isFunction"] = req.IsFunction
	paramsArray := []map[string]interface{}{}
	for _, p := range req.Params {
		paramObj := map[string]interface{}{
			"name":      p.Name,
			"direction": p.Direction,
		}
		if p.Value != nil {
			paramObj["value"] = p.Value
		}
		if p.Type != "" {
			paramObj["type"] = p.Type
		}
		paramsArray = append(paramsArray, paramObj)
	}
	paramsMap["params"] = paramsArray

	// Crear el job con los parámetros
	job := jobManager.CreateJob(req.Name, paramsMap)

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
		// Capturar panics para evitar que el job quede colgado
		defer func() {
			if r := recover(); r != nil {
				endTime := time.Now()
				jobManager.UpdateJob(job.ID, func(j *AsyncJob) {
					j.Status = JobStatusFailed
					j.Error = fmt.Sprintf("Panic recuperado: %v", r)
					j.EndTime = &endTime
					j.Duration = endTime.Sub(j.StartTime).String()
					j.Progress = 100
				})
				log.Printf("❌ Panic en job %s: %v", job.ID, r)
			}
		}()

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

		// Formatear el nombre para manejar esquema.procedimiento correctamente
		procedureName := formatObjectName(req.Schema, req.Name)

		call := fmt.Sprintf("BEGIN %s(%s); END;", procedureName, strings.Join(placeholders, ", "))

		stmt, err := db.Prepare(call)
		if err != nil {
			endTime := time.Now()
			errorMsg := err.Error()

			// Mejorar el mensaje de error para procedimientos no encontrados
			if strings.Contains(errorMsg, "PLS-00201") {
				errorMsg = fmt.Sprintf("Procedimiento '%s' no encontrado. Verifica que existe en la base de datos.", req.Name)
			} else if strings.Contains(errorMsg, "PLS-00306") {
				errorMsg = fmt.Sprintf("Parámetros incorrectos para '%s'. Verifica tipos y cantidad de parámetros.", req.Name)
			}

			jobManager.UpdateJob(job.ID, func(j *AsyncJob) {
				j.Status = JobStatusFailed
				j.Error = errorMsg
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
			errorMsg := err.Error()

			// Mejorar mensajes de error comunes
			if strings.Contains(errorMsg, "ORA-06502") {
				errorMsg = "Error de conversión de tipos. Verifica que los tipos de datos sean correctos."
			} else if strings.Contains(errorMsg, "ORA-01403") {
				errorMsg = "No se encontraron datos. El procedimiento no retornó resultados."
			}

			jobManager.UpdateJob(job.ID, func(j *AsyncJob) {
				j.Status = JobStatusFailed
				j.Error = errorMsg
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

	// Si hay un ID, buscar/eliminar ese job específico
	if path != "" {
		if r.Method == http.MethodDelete {
			err := jobManager.DeleteJob(path)
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}
			json.NewEncoder(w).Encode(map[string]string{
				"message": "Job eliminado correctamente",
				"job_id":  path,
			})
			return
		}

		// GET de job específico
		job, exists := jobManager.GetJob(path)
		if !exists {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Job no encontrado"})
			return
		}
		json.NewEncoder(w).Encode(job)
		return
	}

	// Sin ID - Listar o eliminar múltiples jobs
	if r.Method == http.MethodDelete {
		// DELETE /jobs?status=completed,failed&older_than=7
		queryParams := r.URL.Query()
		statusParam := queryParams.Get("status")
		olderThanParam := queryParams.Get("older_than")

		var statusFilter []string
		if statusParam != "" {
			statusFilter = strings.Split(statusParam, ",")
		}

		olderThan := 0
		if olderThanParam != "" {
			if days, err := strconv.Atoi(olderThanParam); err == nil {
				olderThan = days
			}
		}

		// Validar que al menos un filtro esté presente
		if len(statusFilter) == 0 && olderThan == 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Debes especificar al menos un filtro: ?status=completed,failed o ?older_than=7",
			})
			return
		}

		count, err := jobManager.DeleteJobs(statusFilter, olderThan)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "Jobs eliminados correctamente",
			"deleted": count,
		})
		return
	}

	// GET - Listar todos los jobs
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Solo se permite GET o DELETE"})
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

	// Detectar si es una consulta de log (evitar recursión)
	upperQuery := strings.ToUpper(normalizedQuery)
	isLogQuery := strings.Contains(upperQuery, "FROM QUERY_LOG") ||
		strings.Contains(upperQuery, "FROM ASYNC_JOBS") ||
		strings.Contains(upperQuery, "USER_TABLES")

	// Crear log solo si no es una consulta de log
	var qlog *QueryLog
	var startExec time.Time
	if !isLogQuery {
		startExec = time.Now()
		qlog = &QueryLog{
			ID:            generateID(),
			QueryType:     "QUERY",
			QueryText:     normalizedQuery,
			ExecutionTime: startExec,
			UserIP:        r.RemoteAddr,
		}
	}

	log.Printf("[QUERY] Ejecutando: %s", normalizedQuery)
	rows, err := db.Query(normalizedQuery)
	if err != nil {
		if qlog != nil {
			qlog.Success = false
			qlog.ErrorMsg = err.Error()
			qlog.Duration = time.Since(startExec).String()
			go saveQueryLog(qlog)
		}

		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		if qlog != nil {
			qlog.Success = false
			qlog.ErrorMsg = err.Error()
			qlog.Duration = time.Since(startExec).String()
			go saveQueryLog(qlog)
		}

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
			if qlog != nil {
				qlog.Success = false
				qlog.ErrorMsg = err.Error()
				qlog.Duration = time.Since(startExec).String()
				go saveQueryLog(qlog)
			}

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

	// Registro exitoso
	if qlog != nil {
		qlog.Success = true
		qlog.RowsAffected = int64(len(results))
		qlog.Duration = time.Since(startExec).String()
		go saveQueryLog(qlog)
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

	log.Printf("[EXEC] Ejecutando: %s", req.Query)

	// Crear log
	startExec := time.Now()
	qlog := &QueryLog{
		ID:            generateID(),
		QueryType:     "EXEC",
		QueryText:     req.Query,
		ExecutionTime: startExec,
		UserIP:        r.RemoteAddr,
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
			qlog.Success = false
			qlog.ErrorMsg = err.Error()
			qlog.Duration = time.Since(startExec).String()
			go saveQueryLog(qlog)

			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		rowsAffected, err := res.RowsAffected()
		if err != nil {
			log.Printf("⚠️  No se pudo obtener rows affected: %v", err)
			rowsAffected = 0
		}

		qlog.Success = true
		qlog.RowsAffected = rowsAffected
		qlog.Duration = time.Since(startExec).String()
		go saveQueryLog(qlog)

		json.NewEncoder(w).Encode(map[string]interface{}{"rows_affected": rowsAffected})
		return
	}

	rows, err := db.Query(req.Query)
	if err != nil {
		qlog.Success = false
		qlog.ErrorMsg = err.Error()
		qlog.Duration = time.Since(startExec).String()
		go saveQueryLog(qlog)

		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		qlog.Success = false
		qlog.ErrorMsg = err.Error()
		qlog.Duration = time.Since(startExec).String()
		go saveQueryLog(qlog)

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
			qlog.Success = false
			qlog.ErrorMsg = err.Error()
			qlog.Duration = time.Since(startExec).String()
			go saveQueryLog(qlog)

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

	qlog.Success = true
	qlog.RowsAffected = int64(len(results))
	qlog.Duration = time.Since(startExec).String()
	go saveQueryLog(qlog)

	json.NewEncoder(w).Encode(results)
}

// enableCORS agrega los headers necesarios para CORS
func enableCORS(w *http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = "*"
	}
	(*w).Header().Set("Access-Control-Allow-Origin", origin)
	(*w).Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
	(*w).Header().Set("Access-Control-Allow-Credentials", "true")
	(*w).Header().Set("Access-Control-Max-Age", "3600")
}
