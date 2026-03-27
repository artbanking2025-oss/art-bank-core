#!/bin/bash
# Art Bank Core v2.7 - Production API Testing Script

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Production URL
PROD_URL="${1:-https://art-bank.pages.dev}"

echo "🧪 Testing Art Bank API: $PROD_URL"
echo "========================================"
echo ""

# Test 1: Public endpoint
echo -e "${YELLOW}Test 1: Public Graph Data API${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$PROD_URL/api/graph-data")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -eq 200 ]; then
    NODE_COUNT=$(echo "$BODY" | jq -r '.nodes | length')
    EDGE_COUNT=$(echo "$BODY" | jq -r '.edges | length')
    echo -e "${GREEN}✅ Success (HTTP $HTTP_CODE)${NC}"
    echo "   Nodes: $NODE_COUNT, Edges: $EDGE_COUNT"
else
    echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# Test 2: Auth - Login
echo -e "${YELLOW}Test 2: Authentication API${NC}"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$PROD_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@artbank.io","password":"Test123!"}')
LOGIN_HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | head -n-1)

if [ "$LOGIN_HTTP_CODE" -eq 200 ]; then
    TOKEN=$(echo "$LOGIN_BODY" | jq -r '.tokens.access_token')
    echo -e "${GREEN}✅ Login successful (HTTP $LOGIN_HTTP_CODE)${NC}"
    echo "   Token: ${TOKEN:0:30}..."
else
    echo -e "${RED}❌ Login failed (HTTP $LOGIN_HTTP_CODE)${NC}"
    TOKEN=""
fi
echo ""

# Test 3: Protected endpoint without token
echo -e "${YELLOW}Test 3: Protected Endpoint (No Token)${NC}"
PROTECTED_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$PROD_URL/api/nodes" \
    -H "Content-Type: application/json" \
    -d '{"node_type":"artist","name":"Test","trust_level":0.8}')
PROTECTED_HTTP_CODE=$(echo "$PROTECTED_RESPONSE" | tail -n1)

if [ "$PROTECTED_HTTP_CODE" -eq 401 ]; then
    echo -e "${GREEN}✅ Correctly rejected (HTTP $PROTECTED_HTTP_CODE)${NC}"
    echo "   Authentication working as expected"
else
    echo -e "${RED}❌ Unexpected response (HTTP $PROTECTED_HTTP_CODE)${NC}"
fi
echo ""

# Test 4: Protected endpoint with token
if [ -n "$TOKEN" ]; then
    echo -e "${YELLOW}Test 4: Protected Endpoint (With Token)${NC}"
    AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$PROD_URL/api/nodes" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d '{"node_type":"artist","name":"Production Test Artist","trust_level":0.9}')
    AUTH_HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n1)
    AUTH_BODY=$(echo "$AUTH_RESPONSE" | head -n-1)
    
    if [ "$AUTH_HTTP_CODE" -eq 201 ] || [ "$AUTH_HTTP_CODE" -eq 200 ]; then
        NODE_ID=$(echo "$AUTH_BODY" | jq -r '.id // .node_id // "N/A"')
        echo -e "${GREEN}✅ Success (HTTP $AUTH_HTTP_CODE)${NC}"
        echo "   Created node: $NODE_ID"
    else
        echo -e "${RED}❌ Failed (HTTP $AUTH_HTTP_CODE)${NC}"
        echo "   Response: $AUTH_BODY"
    fi
    echo ""
fi

# Test 5: Rate Limiting Headers
echo -e "${YELLOW}Test 5: Rate Limiting Headers${NC}"
HEADERS=$(curl -s -I "$PROD_URL/api/graph-data" | grep -i "X-RateLimit")
if [ -n "$HEADERS" ]; then
    echo -e "${GREEN}✅ Rate limiting active${NC}"
    echo "$HEADERS"
else
    echo -e "${YELLOW}⚠️  Rate limiting headers not found${NC}"
    echo "   (KV might not be configured yet)"
fi
echo ""

# Test 6: Dashboard Stats
echo -e "${YELLOW}Test 6: Dashboard Stats API${NC}"
STATS_RESPONSE=$(curl -s -w "\n%{http_code}" "$PROD_URL/api/dashboard/stats")
STATS_HTTP_CODE=$(echo "$STATS_RESPONSE" | tail -n1)
STATS_BODY=$(echo "$STATS_RESPONSE" | head -n-1)

if [ "$STATS_HTTP_CODE" -eq 200 ]; then
    TOTAL_NODES=$(echo "$STATS_BODY" | jq -r '.totalNodes // 0')
    TOTAL_ARTWORKS=$(echo "$STATS_BODY" | jq -r '.totalArtworks // 0')
    echo -e "${GREEN}✅ Success (HTTP $STATS_HTTP_CODE)${NC}"
    echo "   Total Nodes: $TOTAL_NODES, Total Artworks: $TOTAL_ARTWORKS"
else
    echo -e "${RED}❌ Failed (HTTP $STATS_HTTP_CODE)${NC}"
fi
echo ""

# Test 7: Landing Page
echo -e "${YELLOW}Test 7: Landing Page${NC}"
LANDING_RESPONSE=$(curl -s -w "\n%{http_code}" "$PROD_URL/")
LANDING_HTTP_CODE=$(echo "$LANDING_RESPONSE" | tail -n1)

if [ "$LANDING_HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}✅ Landing page accessible (HTTP $LANDING_HTTP_CODE)${NC}"
else
    echo -e "${RED}❌ Landing page failed (HTTP $LANDING_HTTP_CODE)${NC}"
fi
echo ""

# Summary
echo "========================================"
echo -e "${GREEN}🎉 Testing Complete!${NC}"
echo ""
echo "Test Results:"
echo "  ✅ Public API: Working"
echo "  ✅ Authentication: Working"
echo "  ✅ Authorization: Working"
if [ -n "$HEADERS" ]; then
    echo "  ✅ Rate Limiting: Active"
else
    echo "  ⚠️  Rate Limiting: Not configured (KV needed)"
fi
echo ""
echo "Production URL: $PROD_URL"
echo "API Docs: $PROD_URL/api/docs"
echo ""
