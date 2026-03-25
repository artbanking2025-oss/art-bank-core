# 🚀 Art Bank Core - Production Deployment Guide

**Version**: v2.7  
**Last Updated**: 2026-03-25  
**Platform**: Cloudflare Pages + D1 Database

---

## 📋 Prerequisites

### 1. Cloudflare Account Setup
- ✅ Active Cloudflare account
- ✅ Cloudflare API Token with permissions:
  - Account > Cloudflare Pages > Edit
  - Account > D1 > Edit
  
### 2. Local Development Environment
- ✅ Node.js 18+ installed
- ✅ npm or yarn package manager
- ✅ Git repository initialized
- ✅ GitHub repository (for CI/CD integration)

### 3. Required Configuration Files
- ✅ `wrangler.jsonc` - Cloudflare configuration
- ✅ `package.json` - deployment scripts
- ✅ `migrations/` - database schema migrations
- ✅ `seed.sql` - initial production data (optional)
- ✅ `.env.example` - environment variables template

---

## 🔧 Step-by-Step Deployment

### Step 1: Configure Cloudflare API Key

#### Option A: Using GenSpark Deploy Tab (Recommended)
1. Click on **Deploy** tab in the sidebar
2. Click **Add API Key** → **Cloudflare**
3. Enter your Cloudflare API Token
4. Click **Save**

#### Option B: Manual Configuration
1. Go to Cloudflare Dashboard → My Profile → API Tokens
2. Create Token with template "Edit Cloudflare Workers"
3. Copy the token
4. Set environment variable:
   ```bash
   export CLOUDFLARE_API_TOKEN="your-token-here"
   ```

### Step 2: Verify Authentication

```bash
cd /home/user/webapp
npm run whoami
# Expected output: your@email.com (Account ID: xxx)
```

### Step 3: Create Production D1 Database

```bash
# Create production database
npm run db:create

# Output will show:
# ✅ Successfully created DB 'art-bank-db'
# 📋 Database ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**IMPORTANT**: Copy the `database_id` from output!

### Step 4: Update wrangler.jsonc

Edit `wrangler.jsonc` and replace `database_id`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "art-bank",
  "compatibility_date": "2026-03-10",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "art-bank-db",
      "database_id": "PASTE-YOUR-DATABASE-ID-HERE"  // ← Replace this!
    }
  ]
}
```

### Step 5: Apply Database Migrations

```bash
# Apply all migrations to production database
npm run db:migrate:prod

# Output:
# 🌀 Executing on remote database art-bank-db:
# ✅ Applied migration 0001_initial_schema.sql
# ✅ Applied migration 0002_junction_tables.sql
# ✅ Applied migration 0003_users_and_sessions.sql
```

### Step 6: (Optional) Seed Production Data

```bash
# Load initial seed data
wrangler d1 execute art-bank-db --file=./seed.sql

# ⚠️ WARNING: Only for initial deployment!
# Do NOT run this on production with real user data!
```

### Step 7: Configure Environment Variables (Secrets)

**CRITICAL**: Set production JWT secret:

```bash
# Generate strong secret
openssl rand -base64 32
# Output: e.g., "xK9mP2nQ5rT8wV1yZ3aB6cD7eF0gH4iJ5kL8mN1oP3qR"

# Set as Cloudflare secret
wrangler secret put JWT_SECRET --env production
# Paste the generated secret when prompted
```

**Optional secrets** (if using external services):

```bash
wrangler secret put ANALYTICS_SERVICE_URL --env production
wrangler secret put OPENAI_API_KEY --env production  # if using AI features
wrangler secret put STRIPE_SECRET_KEY --env production  # if using payments
```

### Step 8: Create Cloudflare Pages Project

```bash
# Create Pages project with main branch as production
npm run pages:create

# Or manually:
wrangler pages project create art-bank --production-branch main
```

### Step 9: Build and Deploy

```bash
# Build the application
npm run build

# Output:
# ✓ 56 modules transformed.
# dist/_worker.js  187.55 kB

# Deploy to Cloudflare Pages
npm run deploy

# Or with explicit branch:
npm run deploy:prod
```

**Expected deployment output:**
```
✨ Compiled Worker successfully
✨ Uploading...
✨ Deployment complete! 🎉
📄 Deployment ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
🔗 Production:  https://art-bank.pages.dev
🔗 Preview:     https://main.art-bank.pages.dev
```

### Step 10: Verify Deployment

```bash
# Test production endpoint
curl https://art-bank.pages.dev/api/health/circuit-breakers

# Expected response:
# {
#   "circuit_breaker": { "state": "CLOSED", ... },
#   "health": "healthy"
# }
```

**Test authentication flow:**
```bash
# 1. Register test user
curl -X POST https://art-bank.pages.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@production.com",
    "password": "SecurePass123!",
    "full_name": "Production Test",
    "role": "collector"
  }'

# 2. Login
curl -X POST https://art-bank.pages.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@production.com",
    "password": "SecurePass123!"
  }'

# 3. Test protected endpoint with token
curl -X POST https://art-bank.pages.dev/api/nodes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"node_type":"artist","name":"Production Artist","trust_level":0.9}'
```

---

## 🔐 Security Configuration

### 1. JWT Secret Management

**NEVER use default JWT_SECRET in production!**

```bash
# Generate new secret
openssl rand -base64 32

# Set in Cloudflare
wrangler secret put JWT_SECRET --env production
```

### 2. CORS Configuration

Update `src/index.tsx` for production domains:

```typescript
// For production, restrict CORS to your domain
app.use('/api/*', cors({
  origin: ['https://art-bank.pages.dev', 'https://yourdomain.com'],
  credentials: true
}));
```

### 3. Rate Limiting (Recommended)

Add rate limiting middleware:

```bash
npm install @hono/rate-limiter
```

### 4. Database Access Control

- Use Cloudflare D1 built-in access control
- Enable audit logging
- Regular backups via wrangler CLI

---

## 🌐 Custom Domain Setup (Optional)

### Step 1: Add Custom Domain

```bash
wrangler pages domain add yourdomain.com --project-name art-bank
```

### Step 2: Configure DNS

1. Go to Cloudflare Dashboard → DNS
2. Add CNAME record:
   - Name: `@` (or subdomain)
   - Target: `art-bank.pages.dev`
   - Proxy status: Proxied (orange cloud)

### Step 3: SSL/TLS Configuration

- Cloudflare automatically provisions SSL certificate
- Enable "Always Use HTTPS" in SSL/TLS settings
- Set minimum TLS version to 1.2

---

## 📊 Monitoring & Logging

### 1. Cloudflare Analytics

Access via Cloudflare Dashboard:
- Pages → art-bank → Analytics
- Monitor requests, errors, latency

### 2. Real-time Logs

```bash
# Tail production logs
wrangler pages deployment tail --project-name art-bank

# Filter by status code
wrangler pages deployment tail --project-name art-bank --status 500
```

### 3. D1 Database Monitoring

```bash
# Check database size
wrangler d1 info art-bank-db

# Query production database
wrangler d1 execute art-bank-db --command="SELECT COUNT(*) FROM users"
```

---

## 🔄 CI/CD Integration (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy dist --project-name art-bank
```

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN` - your Cloudflare API token

---

## 🐛 Troubleshooting

### Issue: "401 Unauthorized" during deployment

**Solution**: Check API token permissions
```bash
wrangler whoami
# If fails, reconfigure API token in Deploy tab
```

### Issue: "Database not found"

**Solution**: Verify database_id in wrangler.jsonc
```bash
wrangler d1 list
# Find your database ID and update wrangler.jsonc
```

### Issue: "Module not found" errors

**Solution**: Ensure all dependencies are installed
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: JWT verification fails in production

**Solution**: Ensure JWT_SECRET is set correctly
```bash
# List secrets
wrangler secret list --project-name art-bank

# Re-set JWT_SECRET if needed
wrangler secret put JWT_SECRET --env production
```

### Issue: CORS errors in production

**Solution**: Update CORS configuration in src/index.tsx
```typescript
app.use('/api/*', cors({
  origin: 'https://art-bank.pages.dev',  // Add your production domain
  credentials: true
}));
```

---

## 📦 Database Backup & Restore

### Backup Production Database

```bash
# Export all tables
wrangler d1 execute art-bank-db --command="SELECT * FROM nodes" --json > backup_nodes.json
wrangler d1 execute art-bank-db --command="SELECT * FROM users" --json > backup_users.json

# Or use custom backup script
wrangler d1 execute art-bank-db --file=./scripts/backup.sql > full_backup.sql
```

### Restore from Backup

```bash
# Restore specific table
wrangler d1 execute art-bank-db --file=./backup_users.sql
```

---

## ✅ Post-Deployment Checklist

- [ ] ✅ Production database created and migrated
- [ ] ✅ JWT_SECRET configured in Cloudflare secrets
- [ ] ✅ Application deployed successfully
- [ ] ✅ Production URL accessible (https://art-bank.pages.dev)
- [ ] ✅ API endpoints responding correctly
- [ ] ✅ Authentication flow working (register, login, protected routes)
- [ ] ✅ Database queries executing properly
- [ ] ✅ CORS configured for production domains
- [ ] ✅ Custom domain configured (if applicable)
- [ ] ✅ SSL/TLS enabled
- [ ] ✅ Monitoring enabled (Cloudflare Analytics)
- [ ] ✅ Backup strategy implemented
- [ ] ✅ CI/CD pipeline set up (GitHub Actions)
- [ ] ✅ Error tracking configured
- [ ] ✅ Documentation updated

---

## 🚀 Next Steps After Deployment

1. **Performance Optimization**
   - Enable Cloudflare cache for static assets
   - Implement service worker for offline support
   - Add edge caching for API responses

2. **Security Hardening**
   - Enable rate limiting
   - Set up WAF rules
   - Configure DDoS protection

3. **Feature Enhancements**
   - Add monitoring dashboards
   - Implement analytics tracking
   - Set up alert notifications

4. **Scaling Considerations**
   - Monitor D1 database size limits
   - Consider read replicas for heavy traffic
   - Implement CDN for global users

---

## 📞 Support & Resources

- **Cloudflare Pages Docs**: https://developers.cloudflare.com/pages/
- **D1 Database Docs**: https://developers.cloudflare.com/d1/
- **Wrangler CLI Docs**: https://developers.cloudflare.com/workers/wrangler/
- **Hono Framework**: https://hono.dev/

---

**Deployment Status**: 🟢 Ready for Production  
**Platform**: Cloudflare Pages + D1  
**Version**: v2.7  
**Bundle Size**: 187.5 KB
