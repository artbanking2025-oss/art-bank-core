#!/bin/bash
# Art Bank Core v2.7 - Production Deployment Script
# Автоматический деплой на Cloudflare Pages

set -e  # Exit on error

echo "🚀 Art Bank Core v2.7 - Production Deployment"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if CLOUDFLARE_API_TOKEN is set
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo -e "${RED}❌ Error: CLOUDFLARE_API_TOKEN not set${NC}"
    echo "Please export CLOUDFLARE_API_TOKEN first:"
    echo "  export CLOUDFLARE_API_TOKEN='your-token-here'"
    exit 1
fi

# Step 1: Verify authentication
echo -e "${YELLOW}Step 1: Verifying Cloudflare authentication...${NC}"
if npx wrangler whoami; then
    echo -e "${GREEN}✅ Authentication successful${NC}"
else
    echo -e "${RED}❌ Authentication failed${NC}"
    echo "Please check your CLOUDFLARE_API_TOKEN"
    exit 1
fi
echo ""

# Step 2: Create Production D1 Database (if not exists)
echo -e "${YELLOW}Step 2: Setting up Production D1 Database...${NC}"
DB_NAME="art-bank-db"

# Check if database exists
if npx wrangler d1 list | grep -q "$DB_NAME"; then
    echo -e "${GREEN}✅ Database '$DB_NAME' already exists${NC}"
    DB_ID=$(npx wrangler d1 list | grep "$DB_NAME" | awk '{print $2}')
    echo "Database ID: $DB_ID"
else
    echo "Creating database '$DB_NAME'..."
    CREATE_OUTPUT=$(npx wrangler d1 create "$DB_NAME")
    echo "$CREATE_OUTPUT"
    DB_ID=$(echo "$CREATE_OUTPUT" | grep "database_id" | sed 's/.*= "\(.*\)".*/\1/')
    echo -e "${GREEN}✅ Database created with ID: $DB_ID${NC}"
    
    # Update wrangler.jsonc with new database_id
    echo "Updating wrangler.jsonc..."
    sed -i "s/\"database_id\": \".*\"/\"database_id\": \"$DB_ID\"/" wrangler.jsonc
    echo -e "${GREEN}✅ wrangler.jsonc updated${NC}"
fi
echo ""

# Step 3: Apply migrations
echo -e "${YELLOW}Step 3: Applying database migrations...${NC}"
if npx wrangler d1 migrations apply "$DB_NAME" --remote; then
    echo -e "${GREEN}✅ Migrations applied successfully${NC}"
else
    echo -e "${RED}❌ Migration failed${NC}"
    exit 1
fi
echo ""

# Step 4: Create KV Namespace for Rate Limiting (if not exists)
echo -e "${YELLOW}Step 4: Setting up KV Namespace for Rate Limiting...${NC}"
KV_NAME="RATE_LIMIT"

# Check if KV namespace exists
if npx wrangler kv:namespace list | grep -q "$KV_NAME"; then
    echo -e "${GREEN}✅ KV namespace '$KV_NAME' already exists${NC}"
    KV_ID=$(npx wrangler kv:namespace list | grep "$KV_NAME" | grep -v preview | jq -r '.id')
    KV_PREVIEW_ID=$(npx wrangler kv:namespace list | grep "$KV_NAME" | grep preview | jq -r '.id')
else
    echo "Creating KV namespace '$KV_NAME'..."
    KV_CREATE=$(npx wrangler kv:namespace create "$KV_NAME")
    KV_ID=$(echo "$KV_CREATE" | grep '"id"' | sed 's/.*"id": "\(.*\)".*/\1/')
    echo -e "${GREEN}✅ KV namespace created: $KV_ID${NC}"
    
    echo "Creating KV preview namespace..."
    KV_PREVIEW_CREATE=$(npx wrangler kv:namespace create "$KV_NAME" --preview)
    KV_PREVIEW_ID=$(echo "$KV_PREVIEW_CREATE" | grep '"preview_id"' | sed 's/.*"preview_id": "\(.*\)".*/\1/')
    echo -e "${GREEN}✅ KV preview namespace created: $KV_PREVIEW_ID${NC}"
    
    # Update wrangler.jsonc with KV IDs
    echo "Updating wrangler.jsonc with KV configuration..."
    # This requires manual editing due to comments in jsonc
    echo -e "${YELLOW}⚠️  Please update wrangler.jsonc manually:${NC}"
    echo "  \"kv_namespaces\": ["
    echo "    {"
    echo "      \"binding\": \"RATE_LIMIT\","
    echo "      \"id\": \"$KV_ID\","
    echo "      \"preview_id\": \"$KV_PREVIEW_ID\""
    echo "    }"
    echo "  ]"
fi
echo ""

# Step 5: Build project
echo -e "${YELLOW}Step 5: Building project...${NC}"
if npm run build; then
    echo -e "${GREEN}✅ Build successful${NC}"
    BUNDLE_SIZE=$(ls -lh dist/_worker.js | awk '{print $5}')
    echo "Bundle size: $BUNDLE_SIZE"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi
echo ""

# Step 6: Create Pages project (if not exists)
echo -e "${YELLOW}Step 6: Setting up Cloudflare Pages project...${NC}"
PROJECT_NAME="art-bank"

if npx wrangler pages project list | grep -q "$PROJECT_NAME"; then
    echo -e "${GREEN}✅ Pages project '$PROJECT_NAME' already exists${NC}"
else
    echo "Creating Pages project '$PROJECT_NAME'..."
    if npx wrangler pages project create "$PROJECT_NAME" --production-branch main; then
        echo -e "${GREEN}✅ Pages project created${NC}"
    else
        echo -e "${RED}❌ Failed to create Pages project${NC}"
        exit 1
    fi
fi
echo ""

# Step 7: Deploy to Cloudflare Pages
echo -e "${YELLOW}Step 7: Deploying to Cloudflare Pages...${NC}"
if npx wrangler pages deploy dist --project-name "$PROJECT_NAME"; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi
echo ""

# Step 8: Get deployment URL
echo -e "${YELLOW}Step 8: Deployment URLs${NC}"
echo "Production: https://$PROJECT_NAME.pages.dev"
echo "Preview: https://main.$PROJECT_NAME.pages.dev"
echo ""

# Step 9: Test deployment
echo -e "${YELLOW}Step 9: Testing deployment...${NC}"
PROD_URL="https://$PROJECT_NAME.pages.dev"
if curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/api/graph-data" | grep -q "200"; then
    echo -e "${GREEN}✅ API is responding${NC}"
else
    echo -e "${YELLOW}⚠️  API might still be warming up...${NC}"
fi
echo ""

# Summary
echo "=============================================="
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo ""
echo "📊 Summary:"
echo "  - Database: $DB_NAME (ID: ${DB_ID:0:8}...)"
echo "  - KV Namespace: $KV_NAME (ID: ${KV_ID:0:8}...)"
echo "  - Bundle Size: $BUNDLE_SIZE"
echo "  - Production URL: $PROD_URL"
echo ""
echo "📝 Next Steps:"
echo "  1. Test API endpoints: curl $PROD_URL/api/graph-data"
echo "  2. Setup GitHub Secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)"
echo "  3. Push to GitHub: git push origin main"
echo "  4. Monitor deployment: npx wrangler pages deployment list"
echo ""
echo -e "${GREEN}🚀 Art Bank Core v2.7 is now LIVE!${NC}"
