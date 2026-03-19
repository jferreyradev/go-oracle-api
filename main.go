package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
	go_ora "github.com/sijms/go-ora/v2"
)

// ===== Data Structures =====

type QueryRequest struct {
	Query string `json:"query"`
}

type Param struct {
	Name      string          `json:"name"`
	Value     json.RawMessage `json:"value"`
	Direction string          `json:"direction"`
	Type      string          `json:"type"`
}

type ProcRequest struct {
	Schema     string  `json:"schema"`
	Name       string  `json:"name"`
	IsFunction bool    `json:"isFunction"`
	Params     []Param `json:"params"`
}

type Job struct {
	ID        string      `json:"id"`
	Status    string      `json:"status"`
	ProcName  string      `json:"proc_name"`
	StartTime time.Time   `json:"start_time"`
	EndTime   *time.Time  `json:"end_time,omitempty"`
	Duration  string      `json:"duration,omitempty"`
	Result    interface{} `json:"result,omitempty"`
	ErrorMsg  string      `json:"error_msg,omitempty"`
	Progress  int         `json:"progress"`
	CreatedAt time.Time   `json:"created_at"`
}

// ===== Globals =====

var (
	db          *sql.DB
	logger      *log.Logger
	logFilePath string
	apiToken    string
	allowedIPs  []string
	noAuth      bool
	corsOrigin  string
	jobs        = make(map[string]*Job)
	jobsMu      sync.RWMutex
)

// ===== Main =====

func main() {
	envFile := ".env"
	port := "8080"
	instanceName := "default"

	args := os.Args[1:]
	if len(args) >= 1 {
		envFile = args[0]
	}
	if len(args) >= 2 {
		port = args[1]
	}
	if len(args) >= 3 {
		instanceName = args[2]
	}

	if v := os.Getenv("ENV_FILE"); v != "" {
		envFile = v
	}
	if v := os.Getenv("PORT"); v != "" {
		port = v
	}

	if err := godotenv.Load(envFile); err != nil {
		log.Printf("Warning: Could not load %s: %v\n", envFile, err)
	}

	logFilePath = setupLogFileName(instanceName, port)
	if err := os.MkdirAll("log", 0700); err != nil {
		log.Fatalf("Failed to create log directory: %v", err)
	}
	lf, err := os.OpenFile(logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		log.Fatalf("Failed to open log file: %v", err)
	}
	defer lf.Close()
	logger = log.New(io.MultiWriter(os.Stdout, lf), "", log.LstdFlags)

	apiToken = os.Getenv("API_TOKEN")
	noAuth = os.Getenv("API_NO_AUTH") == "1"
	corsOrigin = os.Getenv("CORS_ORIGIN")
	if corsOrigin == "" {
		corsOrigin = "*"
	}
	if ipList := os.Getenv("API_ALLOWED_IPS"); ipList != "" {
		for _, ip := range strings.Split(ipList, ",") {
			if ip = strings.TrimSpace(ip); ip != "" {
				allowedIPs = append(allowedIPs, ip)
			}
		}
	}

	oraUser := os.Getenv("ORACLE_USER")
	oraPass := os.Getenv("ORACLE_PASSWORD")
	oraHost := os.Getenv("ORACLE_HOST")
	oraPortStr := os.Getenv("ORACLE_PORT")
	oraService := os.Getenv("ORACLE_SERVICE")
	oraPort := 1521
	if oraPortStr != "" {
		if p, err := strconv.Atoi(oraPortStr); err == nil {
			oraPort = p
		}
	}

	connStr := go_ora.BuildUrl(oraHost, oraPort, oraService, oraUser, oraPass, nil)
	db, err = sql.Open("oracle", connStr)
	if err != nil {
		logger.Fatalf("Failed to open Oracle connection: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	mux := http.NewServeMux()
	mux.HandleFunc("/ping", withMiddleware(pingHandler))
	mux.HandleFunc("/query", withMiddleware(queryHandler))
	mux.HandleFunc("/exec", withMiddleware(execHandler))
	mux.HandleFunc("/procedure/async", withMiddleware(asyncProcedureHandler))
	mux.HandleFunc("/procedure", withMiddleware(procedureHandler))
	mux.HandleFunc("/jobs/", withMiddleware(jobHandler))
	mux.HandleFunc("/jobs", withMiddleware(jobsHandler))
	mux.HandleFunc("/upload", withMiddleware(uploadHandler))
	mux.HandleFunc("/logs", withMiddleware(logsHandler))
	mux.HandleFunc("/docs", withMiddleware(docsHandler))

	logger.Printf("Go Oracle API - Instance: %s, Port: %s", instanceName, port)
	logger.Printf("Log: %s", logFilePath)
	logger.Printf("Oracle: %s@%s:%d/%s", oraUser, oraHost, oraPort, oraService)
	logger.Printf("Listening on :%s", port)

	if err := http.ListenAndServe(":"+port, mux); err != nil {
		logger.Fatalf("Server failed: %v", err)
	}
}

// ===== Middleware =====

func withMiddleware(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// CORS
		w.Header().Set("Access-Control-Allow-Origin", corsOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if !noAuth {
			// IP check
			if len(allowedIPs) > 0 {
				clientIP := r.RemoteAddr
				if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
					clientIP = clientIP[:idx]
				}
				clientIP = strings.Trim(clientIP, "[]")
				allowed := false
				for _, ip := range allowedIPs {
					if ip == clientIP {
						allowed = true
						break
					}
				}
				if !allowed {
					http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
					return
				}
			}

			// Token check
			if apiToken != "" {
				auth := r.Header.Get("Authorization")
				expected := "Bearer " + apiToken
				if auth != expected {
					http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
					return
				}
			}
		}

		h(w, r)
	}
}

// ===== Handlers =====

func pingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	err := db.Ping()
	if err != nil {
		logger.Printf("Ping failed: %v", err)
		jsonError(w, "Oracle connection failed: "+err.Error(), http.StatusServiceUnavailable)
		return
	}
	logger.Printf("PING ok")
	jsonResponse(w, map[string]string{"status": "ok", "message": "pong"})
}

func queryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	query := normalizeQuery(req.Query)
	if query == "" {
		jsonError(w, "Query is required", http.StatusBadRequest)
		return
	}
	logger.Printf("QUERY: %s", truncate(query, 100))

	rows, err := db.Query(query)
	if err != nil {
		logger.Printf("Query error: %v", err)
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var results []map[string]interface{}
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		row := make(map[string]interface{})
		for i, col := range cols {
			row[col] = formatValue(vals[i])
		}
		results = append(results, row)
	}
	if results == nil {
		results = []map[string]interface{}{}
	}
	jsonResponse(w, map[string]interface{}{"results": results})
}

func execHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	query := normalizeQuery(req.Query)
	if query == "" {
		jsonError(w, "Query is required", http.StatusBadRequest)
		return
	}
	logger.Printf("EXEC: %s", truncate(query, 100))

	result, err := db.Exec(query)
	if err != nil {
		logger.Printf("Exec error: %v", err)
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	jsonResponse(w, map[string]interface{}{"status": "ok", "rows_affected": rowsAffected})
}

func procedureHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var req ProcRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "Procedure name is required", http.StatusBadRequest)
		return
	}
	logger.Printf("PROCEDURE: %s (isFunction=%v)", req.Name, req.IsFunction)

	outVals, err := executeProcedure(req)
	if err != nil {
		logger.Printf("Procedure error: %v", err)
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]interface{}{"status": "ok", "out": outVals})
}

func asyncProcedureHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var req ProcRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		jsonError(w, "Procedure name is required", http.StatusBadRequest)
		return
	}

	jobID := generateJobID()
	now := time.Now()
	job := &Job{
		ID:        jobID,
		Status:    "pending",
		ProcName:  req.Name,
		StartTime: now,
		Progress:  0,
		CreatedAt: now,
	}

	jobsMu.Lock()
	jobs[jobID] = job
	jobsMu.Unlock()

	logger.Printf("ASYNC JOB %s created: %s", jobID, req.Name)

	go func() {
		jobsMu.Lock()
		job.Status = "running"
		job.Progress = 30
		jobsMu.Unlock()

		outVals, err := executeProcedure(req)
		endTime := time.Now()

		jobsMu.Lock()
		job.EndTime = &endTime
		job.Duration = endTime.Sub(job.StartTime).String()
		if err != nil {
			job.Status = "failed"
			job.ErrorMsg = err.Error()
			job.Progress = 100
			logger.Printf("ASYNC JOB %s failed: %v", jobID, err)
		} else {
			job.Status = "completed"
			job.Result = outVals
			job.Progress = 100
			logger.Printf("ASYNC JOB %s completed", jobID)
		}
		jobsMu.Unlock()
	}()

	jsonResponse(w, map[string]interface{}{"job_id": jobID, "status": "pending"})
}

func jobHandler(w http.ResponseWriter, r *http.Request) {
	jobID := strings.TrimPrefix(r.URL.Path, "/jobs/")
	if jobID == "" {
		jobsHandler(w, r)
		return
	}

	jobsMu.RLock()
	job, ok := jobs[jobID]
	jobsMu.RUnlock()

	if !ok {
		jsonError(w, "Job not found", http.StatusNotFound)
		return
	}
	jsonResponse(w, job)
}

func jobsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		jobsMu.RLock()
		list := make([]*Job, 0, len(jobs))
		for _, j := range jobs {
			list = append(list, j)
		}
		jobsMu.RUnlock()
		jsonResponse(w, map[string]interface{}{"total": len(list), "jobs": list})

	case http.MethodDelete:
		statusFilter := r.URL.Query().Get("status")
		statuses := map[string]bool{}
		if statusFilter != "" {
			for _, s := range strings.Split(statusFilter, ",") {
				statuses[strings.TrimSpace(s)] = true
			}
		}
		deleted := 0
		jobsMu.Lock()
		for id, j := range jobs {
			if len(statuses) == 0 || statuses[j.Status] {
				delete(jobs, id)
				deleted++
			}
		}
		jobsMu.Unlock()
		jsonResponse(w, map[string]interface{}{"status": "ok", "deleted": deleted})

	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		jsonError(w, "Failed to parse multipart form: "+err.Error(), http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "File field is required: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		jsonError(w, "Failed to read file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	desc := r.FormValue("descripcion")
	logger.Printf("UPLOAD: %s (%d bytes), descripcion=%s", header.Filename, len(data), desc)

	_, err = db.Exec(
		"INSERT INTO FILE_UPLOADS (filename, descripcion, content, created_at) VALUES (:1, :2, :3, CURRENT_TIMESTAMP)",
		header.Filename, desc, data,
	)
	if err != nil {
		logger.Printf("Upload error: %v", err)
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]interface{}{"status": "ok", "filename": header.Filename, "size": len(data)})
}

func logsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	data, err := os.ReadFile(logFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.Write([]byte(""))
			return
		}
		jsonError(w, "Failed to read log: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write(data)
}

func docsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, `<!DOCTYPE html>
<html><head><title>Go Oracle API Docs</title></head>
<body>
<h1>Go Oracle API</h1>
<h2>Endpoints</h2>
<ul>
<li>GET /ping - Connectivity check</li>
<li>POST /query - Execute SELECT query</li>
<li>POST /exec - Execute INSERT/UPDATE/DELETE/DDL</li>
<li>POST /procedure - Execute stored procedure/function (sync)</li>
<li>POST /procedure/async - Execute stored procedure asynchronously</li>
<li>GET /jobs - List async jobs</li>
<li>GET /jobs/{id} - Get job status</li>
<li>DELETE /jobs - Delete jobs</li>
<li>POST /upload - Upload file as BLOB</li>
<li>GET /logs - Get server log</li>
</ul>
</body></html>`)
}

// ===== Procedure Execution =====

func executeProcedure(req ProcRequest) (map[string]interface{}, error) {
	objName := formatObjectName(req.Schema, req.Name)

	// Separate OUT and IN params
	var outParams []Param
	var inParams []Param
	if req.IsFunction {
		for _, p := range req.Params {
			if strings.ToUpper(p.Direction) == "OUT" {
				outParams = append(outParams, p)
			} else {
				inParams = append(inParams, p)
			}
		}
	} else {
		// For procedures, keep order but track which are OUT
		for _, p := range req.Params {
			if strings.ToUpper(p.Direction) == "OUT" {
				outParams = append(outParams, p)
			}
		}
	}

	// Build SQL and args
	var callSQL string
	var args []interface{}
	outDests := map[string]interface{}{}

	if req.IsFunction {
		// Function: BEGIN :result := FUNC_NAME(:p1, :p2); END;
		var retParam Param
		if len(outParams) > 0 {
			retParam = outParams[0]
		} else {
			retParam = Param{Name: "result", Direction: "OUT"}
		}

		// Build IN param placeholders
		inPlaceholders := make([]string, len(inParams))
		for i, p := range inParams {
			inPlaceholders[i] = ":" + p.Name
		}

		callSQL = fmt.Sprintf("BEGIN :%s := %s(%s); END;",
			retParam.Name, objName, strings.Join(inPlaceholders, ", "))

		// Return value (OUT) as first arg
		dest, err := makeOutDest(retParam)
		if err != nil {
			return nil, err
		}
		args = append(args, sql.Named(retParam.Name, sql.Out{Dest: dest}))
		outDests[retParam.Name] = dest

		// IN params
		for _, p := range inParams {
			val, err := makeInVal(p)
			if err != nil {
				return nil, fmt.Errorf("param %s: %w", p.Name, err)
			}
			args = append(args, sql.Named(p.Name, val))
		}
	} else {
		// Procedure: BEGIN PROC_NAME(:p1, :p2, :p3); END;
		placeholders := make([]string, len(req.Params))
		for i, p := range req.Params {
			placeholders[i] = ":" + p.Name
		}
		callSQL = fmt.Sprintf("BEGIN %s(%s); END;", objName, strings.Join(placeholders, ", "))

		for _, p := range req.Params {
			if strings.ToUpper(p.Direction) == "OUT" {
				dest, err := makeOutDest(p)
				if err != nil {
					return nil, err
				}
				args = append(args, sql.Named(p.Name, sql.Out{Dest: dest}))
				outDests[p.Name] = dest
			} else {
				val, err := makeInVal(p)
				if err != nil {
					return nil, fmt.Errorf("param %s: %w", p.Name, err)
				}
				args = append(args, sql.Named(p.Name, val))
			}
		}
	}

	logger.Printf("CALL: %s", callSQL)
	_, err := db.Exec(callSQL, args...)
	if err != nil {
		return nil, err
	}

	// Extract OUT values
	result := make(map[string]interface{})
	for name, destPtr := range outDests {
		// Find the original param to get type info
		var paramType string
		for _, p := range req.Params {
			if p.Name == name {
				paramType = strings.ToLower(p.Type)
				break
			}
		}
		result[name] = extractOutVal(destPtr, paramType)
	}
	return result, nil
}

// makeOutDest creates a pointer for an OUT parameter based on its type
func makeOutDest(p Param) (interface{}, error) {
	t := strings.ToLower(p.Type)
	switch {
	case t == "date":
		v := new(time.Time)
		return v, nil
	case isNumberType(t, p.Name):
		v := new(float64)
		return v, nil
	default:
		v := new(string)
		return v, nil
	}
}

// makeInVal converts a Param's JSON value to a Go value for use as an IN parameter
func makeInVal(p Param) (interface{}, error) {
	if p.Value == nil || string(p.Value) == "null" {
		return nil, nil
	}
	// Check if it's a date by name hint
	nameLower := strings.ToLower(p.Name)
	if strings.Contains(nameLower, "fecha") || strings.Contains(nameLower, "periodo") || strings.ToLower(p.Type) == "date" {
		var strVal string
		if err := json.Unmarshal(p.Value, &strVal); err == nil {
			t, err := parseDateString(strVal)
			if err != nil {
				return nil, fmt.Errorf("invalid date format for %s: %w", p.Name, err)
			}
			return t, nil
		}
	}
	// Try number
	var numVal float64
	if err := json.Unmarshal(p.Value, &numVal); err == nil {
		return numVal, nil
	}
	// Try string
	var strVal string
	if err := json.Unmarshal(p.Value, &strVal); err == nil {
		return strVal, nil
	}
	// Fallback: raw
	return string(p.Value), nil
}

// extractOutVal dereferences a pointer returned from Oracle OUT param
func extractOutVal(dest interface{}, paramType string) interface{} {
	switch v := dest.(type) {
	case *time.Time:
		if v != nil && !v.IsZero() {
			return v.Format("02-01-2006")
		}
		return nil
	case *float64:
		if v != nil {
			return *v
		}
		return nil
	case *string:
		if v != nil {
			return *v
		}
		return nil
	}
	return nil
}

// ===== Helpers =====

func formatObjectName(schema, name string) string {
	if schema != "" {
		// Validate: no double-quotes allowed in schema/name to prevent injection through quoted identifiers
		schema = strings.ReplaceAll(schema, `"`, "")
		name = strings.ReplaceAll(name, `"`, "")
		return fmt.Sprintf(`"%s"."%s"`, schema, name)
	}
	return name
}

func parseDateString(s string) (time.Time, error) {
	layouts := []string{"2006-01-02", "02/01/2006", "2006-01-02T15:04:05", "02-01-2006"}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unable to parse date: %q", s)
}

func setupLogFileName(instanceName string, port string) string {
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	instName := instanceName
	if instanceName == "auto" {
		instName = "inst-auto"
	}
	return fmt.Sprintf("log/go-oracle-api__inst-%s__port-%s__%s.log", instName, port, timestamp)
}

func isNumberType(typeName string, paramName string) bool {
	typeName = strings.ToLower(typeName)
	if typeName == "number" || typeName == "integer" || typeName == "int" ||
		typeName == "float" || typeName == "numeric" {
		return true
	}
	paramName = strings.ToLower(paramName)
	for _, kw := range []string{"resultado", "result", "total", "count", "suma", "num", "int", "id"} {
		if strings.Contains(paramName, kw) {
			return true
		}
	}
	return false
}

func normalizeQuery(q string) string {
	q = strings.ReplaceAll(q, `\n`, "\n")
	q = strings.ReplaceAll(q, `\r`, "\r")
	return strings.TrimSpace(q)
}

func formatValue(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case []byte:
		return string(val)
	case time.Time:
		return val.Format("2006-01-02T15:04:05")
	default:
		return val
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func generateJobID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Fallback to timestamp-based ID if crypto/rand fails
		return hex.EncodeToString([]byte(strconv.FormatInt(time.Now().UnixNano(), 16)))
	}
	return hex.EncodeToString(b)
}

func jsonResponse(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}