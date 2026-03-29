.PHONY: help build test test-unit test-integration test-watch test-cover clean run download lint fmt fix dev dev-services dev-stop docker-build docker-up docker-down db-shell db-backup db-restore cycle

# Default target
help:
	@echo "Booking Titanium - Makefile Commands"
	@echo ""
	@echo "=== DESARROLLO HÍBRIDO (Recomendado) ==="
	@echo "  make dev-services    - Start DB + Redis en Docker"
	@echo "  make dev-stop        - Stop servicios Docker"
	@echo "  make dev             - Run API local (conecta a DB Docker)"
	@echo "  make dev-watch       - Run API con hot reload (air)"
	@echo ""
	@echo "=== TESTS ==="
	@echo "  make test            - Run todos los tests"
	@echo "  make test-unit       - Run tests unitarios (rápido)"
	@echo "  make test-integration- Run tests integración (con DB)"
	@echo "  make test-watch      - Watch mode (auto re-run)"
	@echo "  make test-cover      - Tests con coverage HTML"
	@echo ""
	@echo "=== BUILD ==="
	@echo "  make build           - Build binary local"
	@echo "  make docker-build    - Build Docker image"
	@echo "  make docker-up       - Start full Docker stack"
	@echo "  make docker-down     - Stop full Docker stack"
	@echo ""
	@echo "=== DATABASE ==="
	@echo "  make db-shell        - PSQL shell"
	@echo "  make db-backup       - Backup database"
	@echo "  make db-restore      - Restore database"
	@echo ""
	@echo "=== UTILS ==="
	@echo "  make fix             - Format + mod tidy"
	@echo "  make lint            - Run linter"
	@echo "  make cycle           - Full cycle: fix → test → build"
	@echo ""

# Build all binaries
build:
	@echo "Building API server..."
	go build -o bin/api ./cmd/api
	@echo "Building workers..."
	go build -o bin/workers ./cmd/workers
	@echo "Build complete!"

# ==============================================================================
# DESARROLLO HÍBRIDO
# ==============================================================================

# Start solo servicios (DB + Redis)
dev-services:
	@echo "✓ Starting development services..."
	docker-compose -f docker-compose.dev/docker-compose.yml up -d
	@echo "✓ Services ready:"
	@echo "  - PostgreSQL: localhost:5432 (booking:booking123)"
	@echo "  - Redis: localhost:6379"
	@echo ""
	@echo "✓ Test connection:"
	@echo "  psql -h localhost -U booking -d bookings"

# Stop servicios
dev-stop:
	@echo "✓ Stopping development services..."
	docker-compose -f docker-compose.dev/docker-compose.yml down

# Run API local (conecta a DB en Docker)
dev:
	@echo "✓ Starting API server locally..."
	@echo "✓ Connecting to Docker DB at localhost:5432"
	go run ./cmd/api/main.go

# Hot reload local
dev-watch:
	@echo "✓ Starting with hot reload..."
	air

# ==============================================================================
# TESTS
# ==============================================================================

# Todos los tests
test:
	go test ./... -v

# Tests unitarios (rápido, sin DB)
test-unit:
	@echo "✓ Running unit tests (no DB required)..."
	go test ./pkg/... -v
	go test ./internal/message/... -v
	go test ./internal/ai/... -v

# Tests de integración (con DB Docker)
test-integration:
	@echo "✓ Make sure Docker services are running..."
	@echo "  make dev-services"
	go test ./internal/booking/... -v
	go test ./internal/availability/... -v
	go test ./internal/providers/... -v
	go test ./internal/orchestrator/... -v

# Watch mode (auto re-run tests)
test-watch:
	@echo "✓ Starting test watch mode..."
	gotestsum --watch ./...

# Tests con coverage
test-cover:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "✓ Coverage report generated: coverage.html"
	@echo "✓ Opening in browser..."
	xdg-open coverage.html 2>/dev/null || open coverage.html 2>/dev/null || echo "Open coverage.html in your browser"

# ==============================================================================
# DOCKER
# ==============================================================================

# Build Docker image
docker-build:
	@echo "✓ Building Docker image..."
	docker-compose -f docker-compose/docker-compose.yml build api
	@echo "✓ Docker image built"

# Start full stack
docker-up:
	@echo "✓ Starting full Docker stack..."
	docker-compose -f docker-compose/docker-compose.yml up -d
	@echo "✓ Services running:"
	@echo "  - API: http://localhost:8080"
	@echo "  - Nginx: http://localhost"
	@echo "  - PostgreSQL: localhost:5432"
	@echo "  - PgAdmin: http://localhost:5050"
	@echo "  - Redis: localhost:6379"

# Stop full stack
docker-down:
	@echo "✓ Stopping Docker stack..."
	docker-compose -f docker-compose/docker-compose.yml down

# ==============================================================================
# DATABASE
# ==============================================================================

# Database shell
db-shell:
	@echo "✓ Connecting to database..."
	docker-compose -f docker-compose.dev/docker-compose.yml exec postgres psql -U booking -d bookings

# Backup database
db-backup:
	@echo "✓ Backing up database..."
	docker-compose -f docker-compose.dev/docker-compose.yml exec postgres pg_dump -U booking bookings > backup.sql
	@echo "✓ Backup saved: backup.sql"

# Restore database
db-restore:
	@echo "✓ Restoring database..."
	docker-compose -f docker-compose.dev/docker-compose.yml exec -T postgres psql -U booking bookings < backup.sql
	@echo "✓ Database restored"

# ==============================================================================
# UTILS
# ==============================================================================

# Fix formatting
fix:
	@echo "✓ Fixing formatting..."
	go fmt ./...
	go mod tidy

# Lint
lint:
	@echo "✓ Running linter..."
	golangci-lint run ./...

# Full cycle (test → fix → build)
cycle: fix test build
	@echo "✓ Cycle complete!"

# Clean build artifacts
clean:
	@echo "✓ Cleaning build artifacts..."
	rm -rf bin/
	rm -f coverage.out coverage.html
	@echo "✓ Clean complete!"

# Download dependencies
download:
	@echo "✓ Downloading dependencies..."
	go mod download
	go mod tidy
	@echo "✓ Dependencies downloaded!"
