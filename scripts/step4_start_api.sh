#!/bin/bash
# STEP 4: Build and Start API
set -e
echo "Building API..."
go build -o bin/api ./cmd/api
echo "Starting API..."
./bin/api &
sleep 3
echo "Testing health endpoint..."
curl -s http://localhost:8080/health | jq
echo "✅ API started!"
