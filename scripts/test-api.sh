#!/bin/bash

echo "🚀 Testing Quote Service API..."
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    local method="${3:-GET}"
    local data="$4"
    
    echo -e "\n${BLUE}Testing: $name${NC}"
    echo -e "${YELLOW}URL: $url${NC}"
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        response=$(curl -s -X POST -H "Content-Type: application/json" -d "$data" "$url")
    else
        response=$(curl -s -X "$method" "$url")
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Success${NC}"
        echo "$response" | jq . 2>/dev/null || echo "$response"
    else
        echo -e "${RED}❌ Failed${NC}"
        echo "$response"
    fi
}

# Test REST API endpoints
test_endpoint "Health Check" "http://localhost:3000/health"
test_endpoint "Random Quote (REST)" "http://localhost:3000/api/quotes/random"

# Test GraphQL endpoints
test_endpoint "Random Quote (GraphQL)" "http://localhost:3000/graphql" "POST" '{"query":"{ randomQuote { id text author } }"}'
test_endpoint "Multiple Random Quotes (GraphQL)" "http://localhost:3000/graphql" "POST" '{"query":"{ randomQuotes(count: 3) { id text author } }"}'

# Test with actual quote ID (get one first)
echo -e "\n${BLUE}Getting a quote ID for testing...${NC}"
quote_response=$(curl -s http://localhost:3000/api/quotes/random)
quote_id=$(echo "$quote_response" | jq -r '.quote.id' 2>/dev/null)

if [ "$quote_id" != "null" ] && [ -n "$quote_id" ]; then
    echo -e "${GREEN}Quote ID: $quote_id${NC}"
    
    test_endpoint "Like Quote (REST)" "http://localhost:3000/api/quotes/$quote_id/like" "POST"
    test_endpoint "Similar Quotes (REST)" "http://localhost:3000/api/quotes/$quote_id/similar?limit=3"
    test_endpoint "Like Quote (GraphQL)" "http://localhost:3000/graphql" "POST" "{\"query\":\"mutation { likeQuote(id: \\\"$quote_id\\\") { id likes success message } }\"}"
    test_endpoint "Similar Quotes (GraphQL)" "http://localhost:3000/graphql" "POST" "{\"query\":\"{ similarQuotes(id: \\\"$quote_id\\\", limit: 3) { id text author } }\"}"
else
    echo -e "${RED}Could not get quote ID for testing${NC}"
fi

echo -e "\n${GREEN}🎉 API Testing completed!${NC}" 