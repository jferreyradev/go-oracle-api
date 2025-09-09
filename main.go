package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/joho/godotenv"
	_ "github.com/sijms/go-ora/v2"
)

// DatabaseConfig holds configuration for a single database
type DatabaseConfig struct {
	Name     string
	User     string
	Password string
	Host     string
	Port     string
	Service  string
}

// DatabaseManager manages multiple database connections
type DatabaseManager struct {
	mu          sync.RWMutex
	connections map[string]*sql.DB
	configs     map[string]*DatabaseConfig
}

// NewDatabaseManager creates a new database manager
func NewDatabaseManager() *DatabaseManager {
	return &DatabaseManager{
		connections: make(map[string]*sql.DB),
		configs:     make(map[string]*DatabaseConfig),
	}
}

// AddDatabase adds a database configuration and creates the connection
func (dm *DatabaseManager) AddDatabase(config *DatabaseConfig) error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	dsn := fmt.Sprintf("oracle://%s:%s@%s:%s/%s", 
		config.User, config.Password, config.Host, config.Port, config.Service)
	
	db, err := sql.Open("oracle", dsn)
	if err != nil {
		return fmt.Errorf("error opening connection to %s: %v", config.Name, err)
	}

	// Test the connection
	if err := db.Ping(); err != nil {
		db.Close()
		return fmt.Errorf("error connecting to %s: %v", config.Name, err)
	}

	dm.connections[config.Name] = db
	dm.configs[config.Name] = config
	log.Printf("Conectado a Oracle (%s): %s@%s:%s/%s (OK)", config.Name, config.User, config.Host, config.Port, config.Service)
	
	return nil
}

// GetDatabase returns a database connection by name
func (dm *DatabaseManager) GetDatabase(name string) (*sql.DB, error) {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	
	db, exists := dm.connections[name]
	if !exists {
		return nil, fmt.Errorf("database instance '%s' not found", name)
	}
	return db, nil
}

// GetDatabaseNames returns all available database names
func (dm *DatabaseManager) GetDatabaseNames() []string {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	
	names := make([]string, 0, len(dm.connections))
	for name := range dm.connections {
		names = append(names, name)
	}
	return names
}

// Close closes all database connections
func (dm *DatabaseManager) Close() {
	dm.mu.Lock()
	defer dm.mu.Unlock()
	
	for name, db := range dm.connections {
		if db != nil {
			db.Close()
			log.Printf("Closed connection to database: %s", name)
		}
	}
}

var dbManager *DatabaseManager
var db *sql.DB // Keep for backward compatibility

// loadDatabaseConfigs loads database configurations from environment variables
func loadDatabaseConfigs() []*DatabaseConfig {
	var configs []*DatabaseConfig

	// Check for default/single database configuration (backward compatibility)
	if user := os.Getenv("ORACLE_USER"); user != "" {
		config := &DatabaseConfig{
			Name:     "default",
			User:     user,
			Password: os.Getenv("ORACLE_PASSWORD"),
			Host:     os.Getenv("ORACLE_HOST"),
			Port:     os.Getenv("ORACLE_PORT"),
			Service:  os.Getenv("ORACLE_SERVICE"),
		}
		if config.Password != "" && config.Host != "" && config.Port != "" && config.Service != "" {
			configs = append(configs, config)
		}
	}

	// Check for multiple database configurations (DB1_, DB2_, etc.)
	for _, env := range os.Environ() {
		if strings.HasSuffix(env, "_ORACLE_USER=") {
			continue
		}
		if strings.Contains(env, "_ORACLE_USER=") {
			parts := strings.SplitN(env, "=", 2)
			if len(parts) != 2 {
				continue
			}
			envKey := parts[0]
			prefix := strings.TrimSuffix(envKey, "_ORACLE_USER")
			
			// Skip the default ORACLE_USER (no prefix)
			if prefix == "ORACLE" {
				continue
			}

			config := &DatabaseConfig{
				Name:     strings.ToLower(prefix),
				User:     parts[1],
				Password: os.Getenv(prefix + "_ORACLE_PASSWORD"),
				Host:     os.Getenv(prefix + "_ORACLE_HOST"),
				Port:     os.Getenv(prefix + "_ORACLE_PORT"),
				Service:  os.Getenv(prefix + "_ORACLE_SERVICE"),
			}

			// Validate configuration
			if config.Password != "" && config.Host != "" && config.Port != "" && config.Service != "" {
				configs = append(configs, config)
			}
		}
	}

	return configs
}

// listInstancesHandler returns available database instances
func listInstancesHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	instances := dbManager.GetDatabaseNames()
	response := map[string]interface{}{
		"instances": instances,
		"count":     len(instances),
	}
	json.NewEncoder(w).Encode(response)
}

// instanceHandler routes requests to specific database instances
func instanceHandler(w http.ResponseWriter, r *http.Request) {
	// Parse the URL path: /instances/{instanceName}/{endpoint}
	path := strings.TrimPrefix(r.URL.Path, "/instances/")
	parts := strings.SplitN(path, "/", 2)
	
	if len(parts) < 2 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "URL inválida. Use: /instances/{instanceName}/{endpoint}",
		})
		return
	}

	instanceName := parts[0]
	endpoint := parts[1]

	// Get the database connection
	instanceDB, err := dbManager.GetDatabase(instanceName)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("Instancia de base de datos '%s' no encontrada", instanceName),
		})
		return
	}

	// Route to appropriate handler with the specific database
	switch endpoint {
	case "ping":
		instancePingHandler(w, r, instanceDB)
	case "query":
		instanceQueryHandler(w, r, instanceDB)
	case "exec":
		instanceExecHandler(w, r, instanceDB)
	case "procedure":
		instanceProcedureHandler(w, r, instanceDB)
	case "upload":
		instanceUploadHandler(w, r, instanceDB)
	default:
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("Endpoint '%s' no encontrado", endpoint),
		})
	}
}

func main() {
	// Configurar logging a archivo
	logFile, err := os.OpenFile("app.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err == nil {
		log.SetOutput(logFile)
	} else {
		log.Printf("No se pudo abrir app.log para logging: %v", err)
	}

	// Load environment file
	envFile := ".env"
	if len(os.Args) > 1 && os.Args[1] != "" {
		envFile = os.Args[1]
	} else if customEnv := os.Getenv("ENV_FILE"); customEnv != "" {
		envFile = customEnv
	}
	_ = godotenv.Load(envFile)

	// Initialize database manager
	dbManager = NewDatabaseManager()
	defer dbManager.Close()

	// Load database configurations
	configs := loadDatabaseConfigs()
	if len(configs) == 0 {
		log.Fatalf("No se encontraron configuraciones de base de datos válidas")
	}

	// Setup database connections
	successfulConnections := 0
	for _, config := range configs {
		if err := dbManager.AddDatabase(config); err != nil {
			log.Printf("Error configurando base de datos %s: %v", config.Name, err)
			continue
		}
		successfulConnections++
	}

	if successfulConnections == 0 {
		log.Printf("Advertencia: No se pudo conectar a ninguna base de datos. El servicio funcionará en modo limitado.")
	}

	// Set up backward compatibility - use first database as default
	if len(dbManager.GetDatabaseNames()) > 0 {
		defaultName := dbManager.GetDatabaseNames()[0]
		db, _ = dbManager.GetDatabase(defaultName)
		log.Printf("Base de datos por defecto: %s", defaultName)
	}

	// Setup HTTP handlers
	http.HandleFunc("/logs", logRequest(authMiddleware(logsHandler)))
	http.HandleFunc("/upload", logRequest(authMiddleware(uploadHandler)))

	// Backward compatibility endpoints (use default database)
	http.HandleFunc("/ping", logRequest(authMiddleware(pingHandler)))
	http.HandleFunc("/query", logRequest(authMiddleware(queryHandler)))
	http.HandleFunc("/exec", logRequest(authMiddleware(execHandler)))
	http.HandleFunc("/procedure", logRequest(authMiddleware(procedureHandler)))

	// Multiple instance endpoints
	http.HandleFunc("/instances/", logRequest(authMiddleware(instanceHandler)))
	http.HandleFunc("/instances", logRequest(authMiddleware(listInstancesHandler)))

	// Get port configuration
	port := os.Getenv("PORT")
	if port == "" {
		if len(os.Args) > 2 && os.Args[2] != "" {
			port = os.Args[2]
		} else {
			port = "8080"
		}
	}

	// Obtener IPs locales
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
	for _, ip := range ips {
		log.Printf("Microservicio escuchando en http://%s:%s", ip, port)
	}

	// Show available database instances
	log.Printf("Instancias de base de datos disponibles: %v", dbManager.GetDatabaseNames())

	log.Fatal(http.ListenAndServe("0.0.0.0:"+port, nil))
}

// Instance-specific handlers that use a specific database connection

// instancePingHandler pings a specific database instance
func instancePingHandler(w http.ResponseWriter, r *http.Request, instanceDB *sql.DB) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if err := instanceDB.Ping(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// instanceQueryHandler executes queries on a specific database instance
func instanceQueryHandler(w http.ResponseWriter, r *http.Request, instanceDB *sql.DB) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	// Ejemplo: SELECT sysdate FROM dual
	row := instanceDB.QueryRow("SELECT sysdate FROM dual")
	var sysdate string
	if err := row.Scan(&sysdate); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"sysdate": sysdate})
}

// instanceExecHandler executes SQL commands on a specific database instance
func instanceExecHandler(w http.ResponseWriter, r *http.Request, instanceDB *sql.DB) {
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
		res, err := instanceDB.Exec(req.Query)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		rowsAffected, _ := res.RowsAffected()
		json.NewEncoder(w).Encode(map[string]interface{}{"rows_affected": rowsAffected})
		return
	}

	rows, err := instanceDB.Query(req.Query)
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

// instanceProcedureHandler executes stored procedures on a specific database instance
func instanceProcedureHandler(w http.ResponseWriter, r *http.Request, instanceDB *sql.DB) {
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
		} `json:"params"`
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

	placeholders := make([]string, len(req.Params))
	args := make([]interface{}, len(req.Params))
	outIndexes := make(map[int]string)
	outBuffers := make(map[int]*string)
	outNumMap := make(map[int]*sql.NullFloat64)
	for i, p := range req.Params {
		placeholders[i] = fmt.Sprintf(":%d", i+1)
		if strings.ToUpper(p.Direction) == "OUT" {
			lowerName := strings.ToLower(p.Name)
			if strings.Contains(lowerName, "resultado") || strings.Contains(lowerName, "total") || strings.Contains(lowerName, "count") || strings.Contains(lowerName, "suma") || strings.Contains(lowerName, "num") {
				var outNum sql.NullFloat64
				args[i] = sql.Out{Dest: &outNum, In: false}
				outIndexes[i] = p.Name
				outNumMap[i] = &outNum
			} else {
				outStr := ""
				args[i] = sql.Out{Dest: &outStr, In: false}
				outIndexes[i] = p.Name
				outBuffers[i] = &outStr
			}
		} else {
			args[i] = p.Value
		}
	}
	call := fmt.Sprintf("BEGIN %s(%s); END;", req.Name, strings.Join(placeholders, ", "))

	stmt, err := instanceDB.Prepare(call)
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

// instanceUploadHandler handles file uploads to a specific database instance
func instanceUploadHandler(w http.ResponseWriter, r *http.Request, instanceDB *sql.DB) {
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
	_, err = instanceDB.Exec("INSERT INTO archivos (nombre, descripcion, contenido) VALUES (:1, :2, :3)", nombre, descripcion, data)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Error guardando en BD: " + err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "nombre": nombre})
}

// logsHandler sirve el contenido del archivo de log (app.log)
func logsHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w, r)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	data, err := os.ReadFile("app.log")
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
		} `json:"params"`
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

	placeholders := make([]string, len(req.Params))
	args := make([]interface{}, len(req.Params))
	outIndexes := make(map[int]string)
	outBuffers := make(map[int]*string)
	outNumMap := make(map[int]*sql.NullFloat64)
	for i, p := range req.Params {
		placeholders[i] = fmt.Sprintf(":%d", i+1)
		if strings.ToUpper(p.Direction) == "OUT" {
			lowerName := strings.ToLower(p.Name)
			if strings.Contains(lowerName, "resultado") || strings.Contains(lowerName, "total") || strings.Contains(lowerName, "count") || strings.Contains(lowerName, "suma") || strings.Contains(lowerName, "num") {
				var outNum sql.NullFloat64
				args[i] = sql.Out{Dest: &outNum, In: false}
				outIndexes[i] = p.Name
				outNumMap[i] = &outNum
			} else {
				outStr := ""
				args[i] = sql.Out{Dest: &outStr, In: false}
				outIndexes[i] = p.Name
				outBuffers[i] = &outStr
			}
		} else {
			args[i] = p.Value
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
	// Ejemplo: SELECT sysdate FROM dual
	row := db.QueryRow("SELECT sysdate FROM dual")
	var sysdate string
	if err := row.Scan(&sysdate); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"sysdate": sysdate})
}

func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		enableCORS(&w, r)
		if os.Getenv("API_NO_AUTH") == "1" {
			// Seguridad desactivada para pruebas
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
		// Validación de IPs permitidas
		allowedIPs := os.Getenv("API_ALLOWED_IPS")
		if allowedIPs != "" {
			ipList := strings.Split(allowedIPs, ",")
			remoteIP := r.RemoteAddr
			if colon := strings.LastIndex(remoteIP, ":"); colon != -1 {
				remoteIP = remoteIP[:colon]
			}
			// Eliminar corchetes de IPv6
			remoteIP = strings.Trim(remoteIP, "[]")
			log.Printf("Debug IP: remoteIP=%s, allowedIPs=%v", remoteIP, ipList)
			allowed := false
			for _, ip := range ipList {
				ip = strings.TrimSpace(ip)
				if ip == remoteIP {
					allowed = true
					break
				}
				// Aceptar 'localhost' si la IP es 127.0.0.1 o ::1
				if ip == "localhost" && (remoteIP == "127.0.0.1" || remoteIP == "::1") {
					allowed = true
					break
				}
			}
			if !allowed {
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
func enableCORS(w *http.ResponseWriter, r *http.Request) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}
