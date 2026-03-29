# Testing en Go para Booking System con Windmill - Best Practices

## Unit Tests con stdlib testing

### Test File Structure

```go
// internal/booking/create_test.go
package booking

import (
    "context"
    "testing"
    "time"
)

// Naming convention: Test<Function>_<Scenario>
func TestCreateBooking_ValidInput_Success(t *testing.T) {
    // Arrange
    ctx := context.Background()
    req := CreateBookingRequest{
        ProviderID:  1,
        ServiceID:   1,
        StartTime:   time.Now().Add(24 * time.Hour),
        ChatID:      "123456",
        UserName:    "John Doe",
        UserEmail:   "john@example.com",
    }
    
    // Act
    result, err := CreateBooking(ctx, req)
    
    // Assert
    if err != nil {
        t.Fatalf("Expected no error, got %v", err)
    }
    if result.ID == "" {
        t.Error("Expected booking ID to be set")
    }
    if result.Status != "confirmed" {
        t.Errorf("Expected status 'confirmed', got '%s'", result.Status)
    }
}
```

### Table-Driven Tests

```go
// internal/booking/validate_test.go
package booking

import (
    "testing"
    "time"
)

func TestValidateBookingRequest(t *testing.T) {
    tests := []struct {
        name    string
        req     CreateBookingRequest
        wantErr bool
        errMsg  string
    }{
        {
            name: "valid request",
            req: CreateBookingRequest{
                ProviderID:  1,
                ServiceID:   1,
                StartTime:   time.Now().Add(24 * time.Hour),
                ChatID:      "123456",
                UserName:    "John",
                UserEmail:   "john@example.com",
            },
            wantErr: false,
        },
        {
            name: "missing provider_id",
            req: CreateBookingRequest{
                ProviderID:  0, // Invalid
                ServiceID:   1,
                StartTime:   time.Now().Add(24 * time.Hour),
                ChatID:      "123456",
            },
            wantErr: true,
            errMsg:  "provider_id is required",
        },
        {
            name: "missing service_id",
            req: CreateBookingRequest{
                ProviderID:  1,
                ServiceID:   0, // Invalid
                StartTime:   time.Now().Add(24 * time.Hour),
                ChatID:      "123456",
            },
            wantErr: true,
            errMsg:  "service_id is required",
        },
        {
            name: "past start_time",
            req: CreateBookingRequest{
                ProviderID:  1,
                ServiceID:   1,
                StartTime:   time.Now().Add(-24 * time.Hour), // Past
                ChatID:      "123456",
            },
            wantErr: true,
            errMsg:  "start_time must be in the future",
        },
        {
            name: "invalid email format",
            req: CreateBookingRequest{
                ProviderID:  1,
                ServiceID:   1,
                StartTime:   time.Now().Add(24 * time.Hour),
                ChatID:      "123456",
                UserEmail:   "invalid-email", // Invalid
            },
            wantErr: true,
            errMsg:  "invalid email format",
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := ValidateBookingRequest(tt.req)
            
            if (err != nil) != tt.wantErr {
                t.Errorf("ValidateBookingRequest() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            
            if tt.wantErr && err != nil && err.Error() != tt.errMsg {
                t.Errorf("Expected error '%s', got '%s'", tt.errMsg, err.Error())
            }
        })
    }
}
```

### Test Helpers

```go
// internal/booking/test_helpers.go
package booking

import (
    "testing"
    "time"
)

// Helper function for creating valid test requests
func CreateTestBookingRequest(t *testing.T) CreateBookingRequest {
    t.Helper() // Marks this as a helper for better error reporting
    
    return CreateBookingRequest{
        ProviderID:  1,
        ServiceID:   1,
        StartTime:   time.Now().Add(24 * time.Hour),
        ChatID:      "test_chat_id",
        UserName:    "Test User",
        UserEmail:   "test@example.com",
    }
}

// Helper for comparing timestamps with tolerance
func assertTimeEqual(t *testing.T, expected, actual time.Time, tolerance time.Duration) {
    t.Helper()
    
    diff := actual.Sub(expected)
    if diff < 0 {
        diff = -diff
    }
    if diff > tolerance {
        t.Errorf("Expected time %v, got %v (diff: %v)", expected, actual, diff)
    }
}
```

## Mocking Dependencies

### Mock HTTP Services con httptest

```go
// internal/infrastructure/gcal_test.go
package infrastructure

import (
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"
    "time"
)

func TestCreateGCalEvent_Success(t *testing.T) {
    // Create mock server
    mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Verify request
        if r.URL.Path != "/calendar/v3/calendars/primary/events" {
            t.Errorf("Unexpected path: %s", r.URL.Path)
        }
        if r.Method != http.MethodPost {
            t.Errorf("Expected POST, got %s", r.Method)
        }
        
        // Return mock response
        response := map[string]any{
            "id":      "mock_event_id_123",
            "status":  "confirmed",
            "htmlLink": "https://calendar.google.com/event?id=mock_event_id_123",
        }
        
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(response)
    }))
    defer mockServer.Close()
    
    // Override base URL for testing
    oldBaseURL := gcalBaseURL
    gcalBaseURL = mockServer.URL
    defer func() { gcalBaseURL = oldBaseURL }()
    
    // Execute
    ctx := context.Background()
    result := CreateGCalEvent(ctx, 1, time.Now(), time.Now().Add(time.Hour), "Test User")
    
    // Assert
    if !result.Success {
        t.Errorf("Expected success, got error: %v", result.Error)
    }
    if result.Data["event_id"] != "mock_event_id_123" {
        t.Errorf("Expected event_id 'mock_event_id_123', got '%v'", result.Data["event_id"])
    }
}

func TestCreateGCalEvent_ErrorResponse(t *testing.T) {
    // Mock server returning error
    mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusInternalServerError)
        json.NewEncoder(w).Encode(map[string]any{
            "error": map[string]any{
                "message": "Calendar API is down",
            },
        })
    }))
    defer mockServer.Close()
    
    // Test...
}

func TestCreateGCalEvent_Timeout(t *testing.T) {
    // Mock server that delays
    mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        time.Sleep(5 * time.Second) // Exceeds timeout
    }))
    defer mockServer.Close()
    
    // Test with short timeout...
}
```

### Mock con Interfaces y gomock

```go
// internal/booking/mock_db.go (generated with gomock)
package booking

import (
    "context"
    "database/sql"
    
    "github.com/golang/mock/gomock"
)

// MockDB is a mock of DB interface
type MockDB struct {
    ctrl     *gomock.Controller
    recorder *MockDBMockRecorder
}

// MockDBMockRecorder is the mock recorder for MockDB
type MockDBMockRecorder struct {
    mock *MockDB
}

// NewMockDB creates a new mock instance
func NewMockDB(ctrl *gomock.Controller) *MockDB {
    mock := &MockDB{ctrl: ctrl}
    mock.recorder = &MockDBMockRecorder{mock}
    return mock
}

// EXPECT returns an object that allows the caller to indicate expected use
func (m *MockDB) EXPECT() *MockDBMockRecorder {
    return m.recorder
}

// QueryRow mocks base method
func (m *MockDB) QueryRow(ctx context.Context, query string, args ...any) *sql.Row {
    m.ctrl.T.Helper()
    ret := m.ctrl.Call(m, "QueryRow", append([]any{ctx, query}, args...)...)
    ret0, _ := ret[0].(*sql.Row)
    return ret0
}

// QueryRow expects a call to QueryRow
func (mr *MockDBMockRecorder) QueryRow(ctx, query any, args ...any) *gomock.Call {
    mr.mock.ctrl.T.Helper()
    return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "QueryRow", reflect.TypeOf((*MockDB)(nil).QueryRow), append([]any{ctx, query}, args...)...)
}
```

### Test con Mock DB

```go
// internal/booking/create_test.go
package booking

import (
    "context"
    "database/sql"
    "testing"
    "time"
    
    "github.com/golang/mock/gomock"
    "github.com/stretchr/testify/assert"
)

func TestCreateBooking_DBError(t *testing.T) {
    ctrl := gomock.NewController(t)
    defer ctrl.Finish()
    
    // Create mock DB
    mockDB := NewMockDB(ctrl)
    
    // Setup expectations
    mockDB.EXPECT().
        QueryRow(gomock.Any(), gomock.Any(), gomock.Any()).
        Return(sql.ErrNoRows)
    
    // Execute
    ctx := context.Background()
    req := CreateTestBookingRequest(t)
    
    _, err := createBookingInDB(ctx, mockDB, req)
    
    // Assert
    assert.Error(t, err)
    assert.Contains(t, err.Error(), "failed to insert booking")
}

func TestCreateBooking_Success(t *testing.T) {
    ctrl := gomock.NewController(t)
    defer ctrl.Finish()
    
    mockDB := NewMockDB(ctrl)
    
    // Mock successful insert
    mockDB.EXPECT().
        QueryRow(gomock.Any(), gomock.Any(), gomock.Any()).
        DoAndReturn(func(ctx context.Context, query string, args ...any) *sql.Row {
            // Return mock booking ID
            return &sql.Row{}
        })
    
    // Execute and assert...
}
```

## Integration Tests con Docker

### Testcontainers Setup

```go
// tests/integration/testcontainers.go
package integration

import (
    "context"
    "database/sql"
    "fmt"
    "testing"
    "time"
    
    "github.com/testcontainers/testcontainers-go"
    "github.com/testcontainers/testcontainers-go/modules/postgres"
    "github.com/testcontainers/testcontainers-go/modules/redis"
    "github.com/testcontainers/testcontainers-go/wait"
    
    _ "github.com/lib/pq"
    "github.com/redis/go-redis/v9"
)

type TestContainers struct {
    PostgresContainer *postgres.PostgresContainer
    RedisContainer    *redis.RedisContainer
    PostgresDB        *sql.DB
    RedisClient       *redis.Client
}

func SetupTestContainers(t *testing.T) *TestContainers {
    t.Helper()
    
    ctx := context.Background()
    tc := &TestContainers{}
    
    // Start PostgreSQL
    pgContainer, err := postgres.Run(ctx,
        "postgres:17-alpine",
        postgres.WithDatabase("testdb"),
        postgres.WithUsername("testuser"),
        postgres.WithPassword("testpass"),
        testcontainers.WithWaitStrategy(
            wait.ForLog("database system is ready to accept connections").
                WithOccurrence(2).
                WithStartupTimeout(60*time.Second),
        ),
    )
    if err != nil {
        t.Fatalf("Failed to start PostgreSQL: %v", err)
    }
    tc.PostgresContainer = pgContainer
    
    // Get connection string
    pgConnStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
    if err != nil {
        t.Fatalf("Failed to get PostgreSQL connection string: %v", err)
    }
    
    // Connect to DB
    db, err := sql.Open("postgres", pgConnStr)
    if err != nil {
        t.Fatalf("Failed to connect to PostgreSQL: %v", err)
    }
    tc.PostgresDB = db
    
    // Run migrations
    if err := runMigrations(db); err != nil {
        t.Fatalf("Failed to run migrations: %v", err)
    }
    
    // Start Redis
    redisContainer, err := redis.Run(ctx,
        "redis:7-alpine",
        testcontainers.WithWaitStrategy(
            wait.ForLog("Ready to accept connections").
                WithStartupTimeout(30*time.Second),
        ),
    )
    if err != nil {
        t.Fatalf("Failed to start Redis: %v", err)
    }
    tc.RedisContainer = redisContainer
    
    // Get Redis endpoint
    redisEndpoint, err := redisContainer.Endpoint(ctx, "")
    if err != nil {
        t.Fatalf("Failed to get Redis endpoint: %v", err)
    }
    
    // Connect to Redis
    tc.RedisClient = redis.NewClient(&redis.Options{
        Addr: redisEndpoint,
    })
    
    return tc
}

func (tc *TestContainers) Cleanup(t *testing.T) {
    t.Helper()
    
    ctx := context.Background()
    
    tc.PostgresDB.Close()
    tc.RedisClient.Close()
    
    if err := tc.PostgresContainer.Terminate(ctx); err != nil {
        t.Logf("Failed to terminate PostgreSQL: %v", err)
    }
    if err := tc.RedisContainer.Terminate(ctx); err != nil {
        t.Logf("Failed to terminate Redis: %v", err)
    }
}

func (tc *TestContainers) ResetAll(t *testing.T) {
    t.Helper()
    
    ctx := context.Background()
    
    // Truncate all tables
    _, err := tc.PostgresDB.ExecContext(ctx, `
        TRUNCATE TABLE bookings, providers, services, availability 
        RESTART IDENTITY CASCADE
    `)
    if err != nil {
        t.Fatalf("Failed to truncate tables: %v", err)
    }
    
    // Flush Redis
    if err := tc.RedisClient.FlushAll(ctx).Err(); err != nil {
        t.Fatalf("Failed to flush Redis: %v", err)
    }
}
```

### Integration Test Examples

```go
// tests/integration/booking_test.go
package integration

import (
    "context"
    "testing"
    "time"
    
    "booking-titanium-wm/internal/booking"
    "booking-titanium-wm/internal/infrastructure"
)

var testContainers *TestContainers

// TestMain runs once before all tests
func TestMain(m *testing.M) {
    // Setup
    testContainers = SetupTestContainers()
    
    // Run tests
    m.Run()
    
    // Cleanup
    testContainers.Cleanup()
}

func TestBookingOrchestrator_FullFlow(t *testing.T) {
    // Reset state before test
    testContainers.ResetAll(t)
    
    ctx := context.Background()
    
    // Create test data
    providerID := createTestProvider(t, testContainers.PostgresDB)
    serviceID := createTestService(t, testContainers.PostgresDB)
    
    // Execute orchestrator
    result := booking.CreateBooking(ctx, booking.CreateBookingRequest{
        ProviderID:  providerID,
        ServiceID:   serviceID,
        StartTime:   time.Now().Add(24 * time.Hour),
        EndTime:     time.Now().Add(25 * time.Hour),
        ChatID:      "test_chat",
        UserName:    "Test User",
        UserEmail:   "test@example.com",
    })
    
    // Assert
    if result.Error != nil {
        t.Fatalf("Expected success, got error: %v", result.Error)
    }
    
    // Verify booking was created in DB
    var bookingID string
    err := testContainers.PostgresDB.QueryRow(
        "SELECT id FROM bookings WHERE provider_id = $1",
        providerID,
    ).Scan(&bookingID)
    
    if err != nil {
        t.Errorf("Booking was not created in database: %v", err)
    }
    
    // Verify lock was released
    var lockCount int
    err = testContainers.PostgresDB.QueryRow(
        "SELECT COUNT(*) FROM booking_locks WHERE provider_id = $1",
        providerID,
    ).Scan(&lockCount)
    
    if err != nil {
        t.Errorf("Failed to check locks: %v", err)
    }
    if lockCount != 0 {
        t.Errorf("Expected lock to be released, found %d locks", lockCount)
    }
}

func TestBookingOrchestrator_DoubleBooking_Prevented(t *testing.T) {
    testContainers.ResetAll(t)
    
    ctx := context.Background()
    
    providerID := createTestProvider(t, testContainers.PostgresDB)
    serviceID := createTestService(t, testContainers.PostgresDB)
    startTime := time.Now().Add(24 * time.Hour)
    
    // First booking should succeed
    result1 := booking.CreateBooking(ctx, booking.CreateBookingRequest{
        ProviderID:  providerID,
        ServiceID:   serviceID,
        StartTime:   startTime,
        ChatID:      "chat1",
        UserName:    "User 1",
    })
    
    if result1.Error != nil {
        t.Fatalf("First booking should succeed: %v", result1.Error)
    }
    
    // Second booking for same time should fail
    result2 := booking.CreateBooking(ctx, booking.CreateBookingRequest{
        ProviderID:  providerID,
        ServiceID:   serviceID,
        StartTime:   startTime,
        ChatID:      "chat2",
        UserName:    "User 2",
    })
    
    if result2.Error == nil {
        t.Error("Second booking should fail (double booking prevented)")
    }
}
```

### Test con Docker Compose

```yaml
# docker-compose.test.yml
version: '3.8'

services:
  postgres-test:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: testdb
    ports:
      - "5433:5432"  # Different port to avoid conflicts
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Run tests in container
  test-runner:
    build:
      context: ..
      dockerfile: Dockerfile.test
    depends_on:
      postgres-test:
        condition: service_healthy
      redis-test:
        condition: service_healthy
    environment:
      - TEST_DATABASE_URL=postgres://testuser:testpass@postgres-test:5432/testdb?sslmode=disable
      - TEST_REDIS_URL=redis://redis-test:6379
    command: ["go", "test", "-v", "-race", "-coverprofile=coverage.out", "./..."]
```

```bash
# Run integration tests
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

## Coverage Reports

### Generate Coverage

```bash
# Run tests with coverage
go test -v -race -coverprofile=coverage.out -covermode=atomic ./...

# View coverage in terminal
go tool cover -func=coverage.out

# Generate HTML report
go tool cover -html=coverage.out -o coverage.html

# Open in browser
open coverage.html  # macOS
xdg-open coverage.html  # Linux
start coverage.html  # Windows

# Coverage for specific package
go test -coverprofile=coverage.out ./internal/booking/
go tool cover -html=coverage.out

# Coverage with function-level detail
go test -coverprofile=coverage.out -covermode=set ./...
```

### Coverage Thresholds

```bash
# Check if coverage meets threshold
go test -coverprofile=coverage.out ./...
coverage=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | sed 's/%//')

if (( $(echo "$coverage < 80" | bc -l) )); then
    echo "Coverage is below 80%: $coverage%"
    exit 1
fi

echo "Coverage OK: $coverage%"
```

### Makefile Targets

```makefile
.PHONY: test test-unit test-integration test-cover test-cover-html

# Run all tests
test:
    go test -v ./...

# Run unit tests only (no DB required)
test-unit:
    go test -v ./pkg/... ./internal/message/... ./internal/ai/...

# Run integration tests (requires Docker)
test-integration:
    docker-compose -f docker-compose.test.yml up --abort-on-container-exit

# Run tests with coverage
test-cover:
    go test -v -race -coverprofile=coverage.out -covermode=atomic ./...
    go tool cover -func=coverage.out

# Generate HTML coverage report
test-cover-html: test-cover
    go tool cover -html=coverage.out -o coverage.html
    @echo "Opening coverage report..."
    open coverage.html 2>/dev/null || xdg-open coverage.html 2>/dev/null || echo "Open coverage.html in browser"

# Check coverage threshold (80%)
test-cover-check:
    @coverage=$$(go test -coverprofile=coverage.out ./... | grep total | awk '{print $$3}' | sed 's/%//'); \
    if [ $$(echo "$$coverage < 80" | bc -l) -eq 1 ]; then \
        echo "❌ Coverage is below 80%: $$coverage%"; \
        exit 1; \
    fi; \
    echo "✅ Coverage OK: $$coverage%"
```

## CI/CD con GitHub Actions

### Workflow Configuration

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  GO_VERSION: '1.25'

jobs:
  # ============================================================================
  # Lint
  # ============================================================================
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache: true
          cache-dependency-path: go.sum

      - name: Run golangci-lint
        uses: golangci/golangci-lint-action@v7
        with:
          version: latest
          args: --timeout=5m

  # ============================================================================
  # Test
  # ============================================================================
  test:
    name: Test
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: testuser
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache: true
          cache-dependency-path: go.sum

      - name: Run migrations
        run: |
          go run ./cmd/migrate up
        env:
          DATABASE_URL: postgres://testuser:testpass@localhost:5432/testdb?sslmode=disable

      - name: Run tests with coverage
        run: |
          go test -v -race -coverprofile=coverage.out -covermode=atomic ./...
        env:
          DATABASE_URL: postgres://testuser:testpass@localhost:5432/testdb?sslmode=disable
          REDIS_URL: redis://localhost:6379

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage.out
          flags: unittests
          fail_ci_if_error: false

  # ============================================================================
  # Build
  # ============================================================================
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: test
    strategy:
      matrix:
        goos: [linux, darwin, windows]
        goarch: [amd64, arm64]
        exclude:
          - goos: windows
            goarch: arm64

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: ${{ env.GO_VERSION }}
          cache: true

      - name: Build
        run: |
          GOOS=${{ matrix.goos }} GOARCH=${{ matrix.goarch }} go build \
            -ldflags='-w -s' \
            -o bin/booking-api-${{ matrix.goos }}-${{ matrix.goarch }} \
            ./cmd/api
          GOOS=${{ matrix.goos }} GOARCH=${{ matrix.goarch }} go build \
            -ldflags='-w -s' \
            -o bin/booking-workers-${{ matrix.goos }}-${{ matrix.goarch }} \
            ./cmd/workers

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: booking-${{ matrix.goos }}-${{ matrix.goarch }}
          path: bin/booking-*

  # ============================================================================
  # Security Scan
  # ============================================================================
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: test
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run govulncheck
        run: |
          go install golang.org/x/vuln/cmd/govulncheck@latest
          govulncheck ./...

  # ============================================================================
  # Docker Build (main branch only)
  # ============================================================================
  docker:
    name: Docker Build
    runs-on: ubuntu-latest
    needs: [test, build, security]
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            booking-titanium/api:latest
            booking-titanium/api:${{ github.sha }}
          platforms: linux/amd64,linux/arm64
          cache-from: type=registry,ref=booking-titanium/api:buildcache
          cache-to: type=registry,ref=booking-titanium/api:buildcache,mode=max
```

### Test Matrix

```yaml
# Test across multiple Go versions
test-matrix:
  strategy:
    matrix:
      go-version: ['1.24', '1.25']
      os: [ubuntu-latest, macos-latest]
  
  steps:
    - uses: actions/setup-go@v5
      with:
        go-version: ${{ matrix.go-version }}
    
    - run: go test -v ./...
```

## Errores Comunes

### ❌ Tests No Independientes

```go
// MAL: Tests dependen del orden
func TestCreateBooking(t *testing.T) {
    // Crea booking ID 1
}

func TestCancelBooking(t *testing.T) {
    // Asume booking ID 1 existe (falla si TestCreateBooking no corrió)
}

// BIEN: Cada test crea su propio estado
func TestCancelBooking(t *testing.T) {
    // Crea booking propio
    booking := createTestBooking(t)
    // Cancela ese booking
}
```

### ❌ No Limpiar Estado

```go
// MAL: Estado persiste entre tests
func TestBooking1(t *testing.T) {
    createBooking() // Inserta en DB
}

func TestBooking2(t *testing.T) {
    // Falla porque hay datos del test anterior
}

// BIEN: Resetear estado
func TestMain(m *testing.M) {
    testContainers = SetupTestContainers()
    m.Run()
    testContainers.Cleanup()
}

func TestBooking1(t *testing.T) {
    testContainers.ResetAll(t) // Limpia antes de cada test
    createBooking()
}
```

### ❌ Mocks Mal Configurados

```go
// MAL: Mock sin expectativas claras
mockDB.EXPECT().QueryRow(gomock.Any(), gomock.Any())

// BIEN: Expectativas específicas
mockDB.EXPECT().
    QueryRow(gomock.Any(), "INSERT INTO bookings...", gomock.Any()).
    Return(expectedRow)
```

### ❌ No Verificar Cobertura

```bash
# MAL: Sin verificación de cobertura
go test ./...

# BIEN: Verificar threshold mínimo
go test -coverprofile=coverage.out ./...
coverage=$(go tool cover -func=coverage.out | grep total | awk '{print $3}')
if [ $coverage < 80% ]; then exit 1; fi
```

## Checklist Producción

- [ ] Tests unitarios para toda lógica de negocio
- [ ] Table-driven tests para casos múltiples
- [ ] Mocks para dependencias externas (DB, HTTP)
- [ ] Integration tests con testcontainers
- [ ] Docker Compose para tests de integración
- [ ] Coverage report HTML generado
- [ ] Coverage threshold mínimo (80%)
- [ ] GitHub Actions workflow configurado
- [ ] Matrix testing para múltiples Go versions
- [ ] Lint (golangci-lint) en CI
- [ ] Security scan (govulncheck) en CI
- [ ] Build multi-plataforma
- [ ] Docker build y push en main
- [ ] Codecov integration para tracking
