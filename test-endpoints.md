# Quote Service API Testing Guide

This document provides comprehensive curl commands for testing both REST API and GraphQL endpoints of the Quote Service.

## Prerequisites

Ensure the Quote Service is running:
```bash
docker-compose up -d
```

## REST API Endpoints

### Health Check
```bash
# Basic health check
curl http://localhost:3000/health

# Database health check
curl http://localhost:3000/health/database

# Redis health check
curl http://localhost:3000/health/redis

# External APIs health check
curl http://localhost:3000/health/external-apis

# Metrics endpoint
curl http://localhost:3000/metrics
```

### Quotes API

#### Get Random Quote
```bash
# Get a random quote
curl http://localhost:3000/api/quotes/random

# Get random quote with pretty formatting
curl -s http://localhost:3000/api/quotes/random | jq .
```

#### Like a Quote
```bash
# Like a quote (replace QUOTE_ID with actual quote ID)
curl -X POST http://localhost:3000/api/quotes/QUOTE_ID/like

# Example with actual quote ID
curl -X POST http://localhost:3000/api/quotes/88332aa2-1313-4220-89c5-f95c9cd7edee/like
```

#### Get Similar Quotes
```bash
# Get similar quotes (replace QUOTE_ID with actual quote ID)
curl http://localhost:3000/api/quotes/QUOTE_ID/similar

# Get similar quotes with limit
curl http://localhost:3000/api/quotes/QUOTE_ID/similar?limit=5

# Example with actual quote ID
curl http://localhost:3000/api/quotes/88332aa2-1313-4220-89c5-f95c9cd7edee/similar?limit=3
```

## GraphQL API Endpoints

### Basic GraphQL Query
```bash
# Get random quote via GraphQL
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ randomQuote { id text author tags likes source createdAt } }"}' \
  http://localhost:3000/graphql
```

### GraphQL Queries with Variables

#### Get Random Quote (Minimal Fields)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ randomQuote { id text author } }"}' \
  http://localhost:3000/graphql
```

#### Get Random Quote (All Fields)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ randomQuote { id text author tags likes source createdAt updatedAt } }"}' \
  http://localhost:3000/graphql
```

#### Get Multiple Random Quotes
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ randomQuotes(count: 3) { id text author tags likes source } }"}' \
  http://localhost:3000/graphql
```

#### Get Quote by ID
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ quote(id: \"88332aa2-1313-4220-89c5-f95c9cd7edee\") { id text author tags likes source } }"}' \
  http://localhost:3000/graphql
```

#### Get Similar Quotes
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ similarQuotes(id: \"88332aa2-1313-4220-89c5-f95c9cd7edee\", limit: 5) { id text author tags likes source } }"}' \
  http://localhost:3000/graphql
```

### GraphQL Mutations

#### Like a Quote
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { likeQuote(id: \"88332aa2-1313-4220-89c5-f95c9cd7edee\") { id likes success message } }"}' \
  http://localhost:3000/graphql
```

## PowerShell Commands (Windows)

For Windows PowerShell users, here are the equivalent commands:

### REST API (PowerShell)
```powershell
# Health check
Invoke-WebRequest -Uri "http://localhost:3000/health"

# Get random quote
Invoke-WebRequest -Uri "http://localhost:3000/api/quotes/random"

# Like a quote
Invoke-WebRequest -Uri "http://localhost:3000/api/quotes/88332aa2-1313-4220-89c5-f95c9cd7edee/like" -Method POST
```

### GraphQL (PowerShell)
```powershell
# Get random quote via GraphQL
$headers = @{"Content-Type"="application/json"}
$body = '{"query":"{ randomQuote { id text author } }"}'
Invoke-WebRequest -Uri "http://localhost:3000/graphql" -Method POST -Headers $headers -Body $body

# Get multiple random quotes
$body = '{"query":"{ randomQuotes(count: 3) { id text author } }"}'
Invoke-WebRequest -Uri "http://localhost:3000/graphql" -Method POST -Headers $headers -Body $body

# Like a quote
$body = '{"query":"mutation { likeQuote(id: \"88332aa2-1313-4220-89c5-f95c9cd7edee\") { id likes success message } }"}'
Invoke-WebRequest -Uri "http://localhost:3000/graphql" -Method POST -Headers $headers -Body $body
```

## Testing Scripts

### Quick Test Script (Bash)
```bash
#!/bin/bash

echo "Testing Quote Service API..."
echo "=============================="

echo "1. Health Check:"
curl -s http://localhost:3000/health | jq .

echo -e "\n2. Random Quote (REST):"
curl -s http://localhost:3000/api/quotes/random | jq .

echo -e "\n3. Random Quote (GraphQL):"
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ randomQuote { id text author } }"}' \
  http://localhost:3000/graphql | jq .

echo -e "\n4. Multiple Random Quotes (GraphQL):"
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ randomQuotes(count: 3) { id text author } }"}' \
  http://localhost:3000/graphql | jq .

echo -e "\nTesting completed!"
```

### Quick Test Script (PowerShell)
```powershell
Write-Host "Testing Quote Service API..." -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Green

Write-Host "`n1. Health Check:" -ForegroundColor Yellow
$response = Invoke-WebRequest -Uri "http://localhost:3000/health"
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

Write-Host "`n2. Random Quote (REST):" -ForegroundColor Yellow
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/quotes/random"
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

Write-Host "`n3. Random Quote (GraphQL):" -ForegroundColor Yellow
$headers = @{"Content-Type"="application/json"}
$body = '{"query":"{ randomQuote { id text author } }"}'
$response = Invoke-WebRequest -Uri "http://localhost:3000/graphql" -Method POST -Headers $headers -Body $body
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

Write-Host "`n4. Multiple Random Quotes (GraphQL):" -ForegroundColor Yellow
$body = '{"query":"{ randomQuotes(count: 3) { id text author } }"}'
$response = Invoke-WebRequest -Uri "http://localhost:3000/graphql" -Method POST -Headers $headers -Body $body
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

Write-Host "`nTesting completed!" -ForegroundColor Green
```

## Expected Responses

### REST API Response Format
```json
{
  "quote": {
    "id": "88332aa2-1313-4220-89c5-f95c9cd7edee",
    "text": "Who's gonna dare to be great?",
    "author": "Muhammad Ali",
    "tags": [],
    "likes": 0,
    "source": "dummyjson",
    "createdAt": "2025-08-04T20:09:18.732Z",
    "updatedAt": "2025-08-04T20:09:18.732Z"
  },
  "requestId": "req-12345678-1234-1234-1234-123456789012"
}
```

### GraphQL Response Format
```json
{
  "data": {
    "randomQuote": {
      "id": "88332aa2-1313-4220-89c5-f95c9cd7edee",
      "text": "Who's gonna dare to be great?",
      "author": "Muhammad Ali"
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **Service not running**: Ensure `docker-compose up -d` is executed
2. **Port conflicts**: Check if port 3000 is available
3. **Database issues**: Check logs with `docker-compose logs quote-service`
4. **CORS issues**: The service allows all origins in development mode

### Useful Commands

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs quote-service

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Rebuild and start
docker-compose up --build -d
```