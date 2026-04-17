# Production Deployment Guide

## Prerequisites

1. **Cloudflare Account** with Pages enabled
2. **GitHub Account** with repository access
3. **API Tokens**:
   - Cloudflare API Token (with Pages and D1 permissions)
   - GitHub Personal Access Token (for Actions)

## Step 1: Setup Cloudflare API Token

### Option A: Via AI Development Tool (Recommended)
```bash
# This will prompt you to configure your Cloudflare API token via the Deploy tab
# The token will be securely stored and injected as CLOUDFLARE_API_TOKEN
```

### Option B: Manual Setup
1. Go to Cloudflare Dashboard → My Profile → API Tokens
2. Create Token with permissions:
   - Cloudflare Pages: Edit
   - D1: Edit
   - Workers Scripts: Edit
3. Copy the token

## Step 2: Configure GitHub Secrets

1. Go to GitHub Repository → Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token

## Step 3: Create Cloudflare Pages Project

```bash
# Make sure you're logged in
npx wrangler whoami

# Create Pages project
npx wrangler pages project create art-bank-core \
  --production-branch main \
  --compatibility-date 2024-01-01
```

## Step 4: Create Production D1 Database

```bash
# Create database
npx wrangler d1 create art-bank-production

# Copy the database_id from output and update wrangler.jsonc:
# "database_id": "YOUR_DATABASE_ID"

# Apply migrations
npx wrangler d1 migrations apply art-bank-production --remote
```

## Step 5: Configure Environment Variables

```bash
# Set environment variables for production
npx wrangler pages secret put JWT_SECRET --project-name art-bank-core
npx wrangler pages secret put API_KEY --project-name art-bank-core

# List secrets
npx wrangler pages secret list --project-name art-bank-core
```

## Step 6: Deploy to Production

### Manual Deployment
```bash
# Build project
npm run build

# Deploy
npx wrangler pages deploy dist --project-name art-bank-core --branch main
```

### Automatic Deployment (CI/CD)
Push to `main` branch - GitHub Actions will automatically:
1. Run tests and type checking
2. Build the project
3. Apply database migrations
4. Deploy to Cloudflare Pages
5. Create deployment tag

## Step 7: Verify Deployment

```bash
# Check deployment status
curl https://art-bank-core.pages.dev/health

# Test API endpoints
curl https://art-bank-core.pages.dev/api/nlp/health
curl https://art-bank-core.pages.dev/api/ml/health

# Check with authentication
TOKEN=$(curl -X POST https://art-bank-core.pages.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!@#"}' \
  | jq -r '.tokens.access_token')

curl https://art-bank-core.pages.dev/api/sentiment/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Great artwork!"}'
```

## Step 8: Setup Custom Domain (Optional)

```bash
# Add custom domain
npx wrangler pages domain add artbank.example.com --project-name art-bank-core

# Verify DNS settings
# Add CNAME record: artbank.example.com → art-bank-core.pages.dev
```

## Step 9: Monitoring & Alerts

### Cloudflare Analytics
- Dashboard: https://dash.cloudflare.com/
- Pages Analytics: View traffic, requests, errors
- D1 Analytics: Monitor database performance

### Custom Monitoring
```bash
# Access Prometheus metrics
curl https://art-bank-core.pages.dev/api/monitoring/metrics

# Check alerts
curl https://art-bank-core.pages.dev/api/monitoring/alerts \
  -H "Authorization: Bearer $TOKEN"
```

## Step 10: Load Testing

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt install k6  # Ubuntu

# Run load tests
k6 run tests/load/api-load-test.js

# Run with custom parameters
k6 run --vus 100 --duration 5m tests/load/api-load-test.js
```

## Production Checklist

- [ ] Cloudflare API token configured
- [ ] GitHub secrets configured
- [ ] D1 database created and migrated
- [ ] Environment variables set
- [ ] Initial deployment successful
- [ ] Health checks passing
- [ ] Authentication working
- [ ] API endpoints responding
- [ ] Load testing completed
- [ ] Monitoring configured
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active
- [ ] Rate limiting configured
- [ ] Backup strategy in place

## Rollback Procedure

If deployment fails or has issues:

```bash
# List deployments
npx wrangler pages deployments list --project-name art-bank-core

# Rollback to previous deployment
npx wrangler pages deployments rollback <DEPLOYMENT_ID> --project-name art-bank-core
```

## Database Migrations

### Apply New Migration
```bash
# Create migration file in migrations/
# Then apply:
npx wrangler d1 migrations apply art-bank-production --remote
```

### Rollback Migration
```bash
# Not directly supported - manual rollback required
# 1. Create new migration to reverse changes
# 2. Apply the rollback migration
```

## Troubleshooting

### Deployment Fails
```bash
# Check build logs
npm run build

# Check Wrangler logs
npx wrangler pages deployments list --project-name art-bank-core

# Verify API token
npx wrangler whoami
```

### Database Connection Issues
```bash
# Test D1 connection
npx wrangler d1 execute art-bank-production --remote --command="SELECT 1"

# Check migrations status
npx wrangler d1 migrations list art-bank-production --remote
```

### API Errors
```bash
# Check error logs (via Cloudflare Dashboard)
# Or use structured logging API:
curl https://art-bank-core.pages.dev/api/logs/search?level=error \
  -H "Authorization: Bearer $TOKEN"
```

## Scaling Considerations

### Database
- Cloudflare D1: Automatically scales reads globally
- Write performance: ~1000 writes/second (D1 limit)
- Consider external DB (PlanetScale, Neon) for higher write load

### Compute
- Workers: 100k requests/day on free plan
- Paid plan: Unlimited requests, $0.50/million
- CPU time: 10ms free, 30ms paid

### Storage
- Pages: 20k files, 25MB per file
- R2: Unlimited storage (pay for usage)
- D1: 5GB free, additional storage available

## Support & Resources

- **Cloudflare Docs**: https://developers.cloudflare.com/pages/
- **GitHub**: https://github.com/artbanking2025-oss/art-bank-core
- **Issues**: Report bugs via GitHub Issues

---

**Last Updated**: 2026-04-15  
**Version**: v2.13 (Phase 6)
