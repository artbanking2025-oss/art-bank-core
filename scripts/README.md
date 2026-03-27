# 🛠️ Deployment & Testing Scripts

## 📜 Available Scripts

### 1. `deploy.sh` - Production Deployment
Автоматический деплой Art Bank на Cloudflare Pages.

**Prerequisites:**
- Cloudflare API Token с правами `Cloudflare Pages > Edit` и `D1 > Edit`
- Node.js и npm установлены

**Usage:**
```bash
# Set API token
export CLOUDFLARE_API_TOKEN="your-token-here"

# Run deployment
./scripts/deploy.sh
```

**What it does:**
1. ✅ Verifies Cloudflare authentication
2. ✅ Creates Production D1 Database (if not exists)
3. ✅ Applies database migrations
4. ✅ Creates KV Namespace for Rate Limiting
5. ✅ Builds project (npm run build)
6. ✅ Creates Cloudflare Pages project (if not exists)
7. ✅ Deploys to production
8. ✅ Provides deployment URLs
9. ✅ Tests API endpoint

**Output:**
- Production URL: `https://art-bank.pages.dev`
- Preview URL: `https://main.art-bank.pages.dev`
- Database ID and KV namespace IDs

---

### 2. `test-production.sh` - API Testing
Комплексное тестирование production API.

**Usage:**
```bash
# Test default URL (art-bank.pages.dev)
./scripts/test-production.sh

# Test custom URL
./scripts/test-production.sh https://custom-domain.com
```

**Test Suite:**
1. ✅ **Public Graph Data API** - проверка публичного эндпоинта
2. ✅ **Authentication** - тест логина (test@artbank.io)
3. ✅ **Authorization** - проверка JWT protection
4. ✅ **Protected Endpoint** - создание ноды с токеном
5. ✅ **Rate Limiting Headers** - проверка X-RateLimit-* headers
6. ✅ **Dashboard Stats** - тест статистики
7. ✅ **Landing Page** - проверка главной страницы

**Sample Output:**
```
🧪 Testing Art Bank API: https://art-bank.pages.dev
========================================

Test 1: Public Graph Data API
✅ Success (HTTP 200)
   Nodes: 6, Edges: 8

Test 2: Authentication API
✅ Login successful (HTTP 200)
   Token: eyJhbGciOiJIUzI1NiIsInR5cCI6...

Test 3: Protected Endpoint (No Token)
✅ Correctly rejected (HTTP 401)
   Authentication working as expected

Test 4: Protected Endpoint (With Token)
✅ Success (HTTP 201)
   Created node: artist-abc123

Test 5: Rate Limiting Headers
✅ Rate limiting active
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1711483200

🎉 Testing Complete!
```

---

## 🚀 Quick Start

### First Time Deployment
```bash
# 1. Setup Cloudflare token
export CLOUDFLARE_API_TOKEN="cfat_..."

# 2. Deploy
cd /home/user/webapp
./scripts/deploy.sh

# 3. Test
./scripts/test-production.sh
```

### Subsequent Deployments
```bash
# Quick deploy (assumes DB and KV already exist)
npm run deploy

# Or use full script
./scripts/deploy.sh
```

---

## 📊 Deployment Checklist

### Before Deployment
- [ ] Cloudflare API Token configured
- [ ] Code changes committed to git
- [ ] Tests passing locally
- [ ] Bundle size acceptable (<200 KB)
- [ ] Environment variables documented in .env.example

### After Deployment
- [ ] API endpoints responding (run test-production.sh)
- [ ] Authentication working
- [ ] Rate limiting active (if KV configured)
- [ ] Landing page accessible
- [ ] GitHub Secrets configured (for CI/CD)
- [ ] Monitoring enabled

---

## 🔧 Troubleshooting

### Authentication Error
```
Error: Authentication error [code: 10000]
```
**Solution:** API Token lacks `Cloudflare Pages > Edit` permission
- Go to https://dash.cloudflare.com/profile/api-tokens
- Create new token with "Edit Cloudflare Workers" template
- Verify `Cloudflare Pages > Edit` is included

### Database Migration Failed
```
Error applying migrations
```
**Solution:** Check migrations syntax and database ID
```bash
# List migrations
npx wrangler d1 migrations list art-bank-db --remote

# Check database
npx wrangler d1 list
```

### KV Creation Issues
```
Error: Failed to create KV namespace
```
**Solution:** Manually create via dashboard or wrangler
```bash
# Manual KV creation
npx wrangler kv:namespace create RATE_LIMIT
npx wrangler kv:namespace create RATE_LIMIT --preview

# Update wrangler.jsonc with IDs
```

### Deploy Script Permission Denied
```
bash: ./scripts/deploy.sh: Permission denied
```
**Solution:** Make script executable
```bash
chmod +x scripts/*.sh
```

---

## 📝 Environment Variables

Required for deployment:
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with Pages/D1 permissions

Optional (set via Cloudflare dashboard):
- `JWT_SECRET` - Production JWT secret (recommended)
- `ANALYTICS_SERVICE_URL` - External analytics service URL

---

## 🎯 Next Steps

After successful deployment:

1. **Setup GitHub CI/CD**
   ```bash
   # Set GitHub Secrets:
   # - CLOUDFLARE_API_TOKEN
   # - CLOUDFLARE_ACCOUNT_ID
   
   git push origin main
   # GitHub Actions will auto-deploy
   ```

2. **Configure Custom Domain** (optional)
   ```bash
   npx wrangler pages domain add your-domain.com --project-name art-bank
   ```

3. **Monitor Deployment**
   ```bash
   npx wrangler pages deployment list --project-name art-bank
   npx wrangler tail --project-name art-bank
   ```

4. **Setup Alerts** (Cloudflare Dashboard)
   - Navigate to Workers & Pages → art-bank → Metrics
   - Configure alerts for errors, high latency, etc.

---

**Version**: v2.7  
**Last Updated**: 2026-03-26  
**Status**: ✅ Ready for Production
