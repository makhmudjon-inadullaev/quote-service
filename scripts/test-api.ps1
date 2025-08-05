# PowerShell script for testing Quote Service API

Write-Host "🚀 Testing Quote Service API..." -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green

# Function to test endpoint
function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [string]$Body = $null
    )
    
    Write-Host "`nTesting: $Name" -ForegroundColor Blue
    Write-Host "URL: $Url" -ForegroundColor Yellow
    
    try {
        if ($Method -eq "POST" -and $Body) {
            $headers = @{"Content-Type"="application/json"}
            $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $headers -Body $Body
        } else {
            $response = Invoke-WebRequest -Uri $Url -Method $Method
        }
        
        Write-Host "✅ Success" -ForegroundColor Green
        $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
    }
    catch {
        Write-Host "❌ Failed" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}

# Test REST API endpoints
Test-Endpoint -Name "Health Check" -Url "http://localhost:3000/health"
Test-Endpoint -Name "Random Quote (REST)" -Url "http://localhost:3000/api/quotes/random"

# Test GraphQL endpoints
Test-Endpoint -Name "Random Quote (GraphQL)" -Url "http://localhost:3000/graphql" -Method "POST" -Body '{"query":"{ randomQuote { id text author } }"}'
Test-Endpoint -Name "Multiple Random Quotes (GraphQL)" -Url "http://localhost:3000/graphql" -Method "POST" -Body '{"query":"{ randomQuotes(count: 3) { id text author } }"}'

# Test with actual quote ID (get one first)
Write-Host "`nGetting a quote ID for testing..." -ForegroundColor Blue
try {
    $quoteResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/quotes/random"
    $quoteData = $quoteResponse.Content | ConvertFrom-Json
    $quoteId = $quoteData.quote.id
    
    if ($quoteId) {
        Write-Host "Quote ID: $quoteId" -ForegroundColor Green
        
        Test-Endpoint -Name "Like Quote (REST)" -Url "http://localhost:3000/api/quotes/$quoteId/like" -Method "POST"
        Test-Endpoint -Name "Similar Quotes (REST)" -Url "http://localhost:3000/api/quotes/$quoteId/similar?limit=3"
        
        # Fix JSON escaping for GraphQL queries
        $likeQuery = '{"query":"mutation { likeQuote(id: \"' + $quoteId + '\") { id likes success message } }"}'
        $similarQuery = '{"query":"{ similarQuotes(id: \"' + $quoteId + '\", limit: 3) { id text author } }"}'
        
        Test-Endpoint -Name "Like Quote (GraphQL)" -Url "http://localhost:3000/graphql" -Method "POST" -Body $likeQuery
        Test-Endpoint -Name "Similar Quotes (GraphQL)" -Url "http://localhost:3000/graphql" -Method "POST" -Body $similarQuery
    } else {
        Write-Host "Could not get quote ID for testing" -ForegroundColor Red
    }
}
catch {
    Write-Host "Could not get quote ID for testing" -ForegroundColor Red
}

Write-Host "`n🎉 API Testing completed!" -ForegroundColor Green 