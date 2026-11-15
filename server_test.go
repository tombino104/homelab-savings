package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	dir := t.TempDir()
	handler, err := newHandler(dir)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv, dir
}

func put(t *testing.T, url, contentType, body string, headers map[string]string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPut, url+"/api/state", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func get(t *testing.T, url string) (int, string) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return resp.StatusCode, string(body)
}

func TestEmptyStateIsAnEmptyObject(t *testing.T) {
	srv, _ := newTestServer(t)
	status, body := get(t, srv.URL+"/api/state")
	if status != http.StatusOK || body != "{}" {
		t.Fatalf("got %d %q", status, body)
	}
}

func TestStateRoundTrip(t *testing.T) {
	srv, dir := newTestServer(t)
	payload := `{"v":1,"currency":"EUR"}`
	if resp := put(t, srv.URL, "application/json", payload, nil); resp.StatusCode != http.StatusNoContent {
		t.Fatalf("put status %d", resp.StatusCode)
	}
	_, body := get(t, srv.URL+"/api/state")
	if body != payload {
		t.Fatalf("got %q", body)
	}
	if _, err := os.Stat(filepath.Join(dir, "state.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "state.json.tmp")); !os.IsNotExist(err) {
		t.Fatal("temporary file left behind")
	}
}

func TestRejectsInvalidBodies(t *testing.T) {
	srv, _ := newTestServer(t)
	cases := map[string]string{
		"not json":   "nope",
		"array":      "[1,2]",
		"null":       "null",
		"empty body": "",
	}
	for name, body := range cases {
		if resp := put(t, srv.URL, "application/json", body, nil); resp.StatusCode != http.StatusBadRequest {
			t.Errorf("%s: status %d", name, resp.StatusCode)
		}
	}
}

func TestRejectsWrongContentType(t *testing.T) {
	srv, _ := newTestServer(t)
	if resp := put(t, srv.URL, "text/plain", "{}", nil); resp.StatusCode != http.StatusUnsupportedMediaType {
		t.Fatalf("status %d", resp.StatusCode)
	}
}

func TestRejectsOversizedBody(t *testing.T) {
	srv, _ := newTestServer(t)
	big := `{"x":"` + strings.Repeat("a", maxStateBytes) + `"}`
	if resp := put(t, srv.URL, "application/json", big, nil); resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status %d", resp.StatusCode)
	}
}

func TestRejectsCrossSiteWrites(t *testing.T) {
	srv, _ := newTestServer(t)
	resp := put(t, srv.URL, "application/json", "{}", map[string]string{"Sec-Fetch-Site": "cross-site"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status %d", resp.StatusCode)
	}
	resp = put(t, srv.URL, "application/json", "{}", map[string]string{"Sec-Fetch-Site": "same-origin"})
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status %d", resp.StatusCode)
	}
}

func TestHealthAndStaticFiles(t *testing.T) {
	srv, _ := newTestServer(t)
	if status, body := get(t, srv.URL+"/health"); status != http.StatusOK || body != "ok" {
		t.Fatalf("health: %d %q", status, body)
	}
	status, body := get(t, srv.URL+"/")
	if status != http.StatusOK || !strings.Contains(body, "<html") {
		t.Fatalf("index: %d", status)
	}
}

func TestSecurityHeaders(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Error("missing nosniff")
	}
	if !strings.Contains(resp.Header.Get("Content-Security-Policy"), "default-src 'self'") {
		t.Error("missing CSP")
	}
}
