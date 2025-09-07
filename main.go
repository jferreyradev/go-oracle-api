package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/joho/godotenv"
	_ "github.com/sijms/go-ora/v2"
)

var db *sql.DB

func main() {
	// Cargar variables de entorno desde .env si existe
	_ = godotenv.Load()

	user := os.Getenv("ORACLE_USER")
	password := os.Getenv("ORACLE_PASSWORD")
	host := os.Getenv("ORACLE_HOST")
	port := os.Getenv("ORACLE_PORT")
	service := os.Getenv("ORACLE_SERVICE")

	dsn := fmt.Sprintf("oracle://%s:%s@%s:%s/%s", user, password, host, port, service)
	var err error
	db, err = sql.Open("oracle", dsn)
	if err != nil {
		log.Fatalf("Error abriendo conexión: %v", err)
	}
	defer db.Close()

	http.HandleFunc("/ping", authMiddleware(pingHandler))
	http.HandleFunc("/query", authMiddleware(queryHandler))
	http.HandleFunc("/exec", authMiddleware(execHandler))
	http.HandleFunc("/procedure", authMiddleware(procedureHandler))
	log.Println("Microservicio escuchando en :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
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
	for i, p := range req.Params {
		placeholders[i] = fmt.Sprintf(":%d", i+1)
		if strings.ToUpper(p.Direction) == "OUT" {
			var outVar sql.NullString
			args[i] = sql.Out{Dest: &outVar}
			outIndexes[i] = p.Name
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
		if outVal, ok := args[i].(sql.Out); ok {
			if ptr, ok := outVal.Dest.(*sql.NullString); ok {
				if ptr.Valid {
					out[name] = ptr.String
				} else {
					out[name] = nil
				}
			}
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
