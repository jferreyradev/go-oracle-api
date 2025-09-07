package main

import (
	"net/http"
	"os"
	"testing"

	"github.com/joho/godotenv"
)

func init() {
	_ = godotenv.Load()
}

func TestPingLocal(t *testing.T) {
	url := "http://localhost:8080/ping"
	testPingEndpoint(t, url)
}

func TestPingRemote(t *testing.T) {
	remote := os.Getenv("API_REMOTE_HOST") // Ejemplo: http://192.168.1.100:8080
	if remote == "" {
		t.Skip("API_REMOTE_HOST no definido")
	}
	url := remote + "/ping"
	testPingEndpoint(t, url)
}

func testPingEndpoint(t *testing.T, url string) {
	token := os.Getenv("API_TOKEN")
	if token == "" {
		t.Fatal("API_TOKEN no definido")
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatalf("Error creando request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Error haciendo request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Errorf("Status inesperado: %d", resp.StatusCode)
	}
}
