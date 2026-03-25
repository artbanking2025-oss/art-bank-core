# GitHub Actions Workflows

Automated CI/CD pipelines for Art Bank Core platform.

## 📋 Workflows

### 1. `deploy.yml` - Continuous Deployment

**Triggers**:
- Push to `main` branch → Deploy to production
- Pull request → Deploy preview

**Jobs**:
- **build**: Build application, upload artifacts
- **deploy-production**: Deploy to production (https://art-bank.pages.dev)
- **deploy-preview**: Deploy PR preview (https://[branch].art-bank.pages.dev)

**Required Secrets**:
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with Pages permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

### 2. `test.yml` - Continuous Integration

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

**Jobs**:
- **lint**: TypeScript type checking, Prettier formatting
- **build**: Build test, bundle size check
- **test-api**: Local Wrangler server, API endpoint tests, auth flow tests

**Tests**:
- ✅ Public endpoints (health, graph-data, dashboard/stats)
- ✅ Authentication flow (register, login, token validation)
- ✅ Protected endpoints (with JWT token)
- ✅ Bundle size monitoring (warn if > 500 KB)

### 3. `database-migration.yml` - Database Management

**Triggers**:
- Manual workflow dispatch (via GitHub UI)

**Inputs**:
- `environment`: production | staging
- `migration_action`: apply | rollback | info

**Usage**:
1. Go to Actions tab → Database Migration
2. Click "Run workflow"
3. Select environment and action
4. Confirm and run

## 🔐 Setup GitHub Secrets

### Required Secrets

1. **CLOUDFLARE_API_TOKEN**
   - Go to: https://dash.cloudflare.com/profile/api-tokens
   - Create token with "Edit Cloudflare Workers" template
   - Add to: Repository Settings → Secrets → Actions

2. **CLOUDFLARE_ACCOUNT_ID**
   - Go to: https://dash.cloudflare.com
   - Copy Account ID from sidebar
   - Add to: Repository Settings → Secrets → Actions

### How to Add Secrets

```bash
# Via GitHub CLI
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID

# Via GitHub UI
Settings → Secrets and variables → Actions → New repository secret
```

## 🚀 Usage Examples

### Deploy to Production

```bash
# Automatically triggers on push to main
git push origin main

# Or manually trigger via GitHub UI:
# Actions → Deploy to Cloudflare Pages → Run workflow
```

### Deploy Preview for PR

```bash
# Create PR - preview deploys automatically
gh pr create --title "Feature: New feature"

# Preview URL will be commented on PR:
# https://[branch-name].art-bank.pages.dev
```

### Run Database Migration

```bash
# Via GitHub UI:
# Actions → Database Migration → Run workflow
# Select: environment=production, action=apply

# Or via GitHub CLI:
gh workflow run database-migration.yml \
  -f environment=production \
  -f migration_action=apply
```

## 📊 Monitoring Workflows

### Check Workflow Status

```bash
# List recent workflow runs
gh run list

# View specific run
gh run view [run-id]

# Watch live workflow
gh run watch
```

### View Logs

```bash
# View logs for specific job
gh run view [run-id] --log

# Download logs
gh run download [run-id]
```

## 🐛 Troubleshooting

### Issue: "401 Unauthorized" during deployment

**Solution**: Check `CLOUDFLARE_API_TOKEN` secret
- Ensure token has correct permissions
- Token might be expired (recreate if needed)

### Issue: Bundle size warning

**Solution**: Optimize imports and code
```bash
# Check bundle size locally
npm run build
ls -lh dist/_worker.js
```

### Issue: API tests failing

**Solution**: Check local Wrangler server
```bash
# Test locally first
npm run build
npx wrangler pages dev dist --local --port 8788
curl http://localhost:8788/api/health/circuit-breakers
```

### Issue: Database migration failed

**Solution**: Check migration SQL files
```bash
# Test migration locally
npm run db:migrate:local
npm run db:console:local

# Check migration status
wrangler d1 migrations list art-bank-db
```

## 📝 Workflow Customization

### Add Environment Variables

Edit `.github/workflows/deploy.yml`:

```yaml
- name: Deploy to Cloudflare Pages
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    command: pages deploy dist --project-name art-bank
  env:
    JWT_SECRET: ${{ secrets.JWT_SECRET }}  # Add custom secrets
```

### Add Notification (Slack/Discord)

```yaml
- name: Notify deployment
  if: success()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
      -H 'Content-Type: application/json' \
      -d '{"text":"🚀 Deployed to production: https://art-bank.pages.dev"}'
```

### Add Performance Testing

```yaml
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v10
  with:
    urls: |
      https://art-bank.pages.dev
    uploadArtifacts: true
```

## 🎯 Best Practices

1. **Always test locally before pushing**
   ```bash
   npm run build
   npm run preview
   ```

2. **Use feature branches for PRs**
   ```bash
   git checkout -b feature/new-feature
   # Make changes
   git push origin feature/new-feature
   gh pr create
   ```

3. **Review preview deployments before merging**
   - Check preview URL in PR comment
   - Test all features
   - Approve and merge

4. **Monitor production deployments**
   - Check Cloudflare Analytics
   - Review error logs
   - Test critical endpoints

5. **Database migrations**
   - Always test locally first
   - Run migration before deployment
   - Have rollback plan ready

## 📚 Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cloudflare Wrangler Action](https://github.com/cloudflare/wrangler-action)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [D1 Database Docs](https://developers.cloudflare.com/d1/)

---

**Status**: ✅ CI/CD Configured  
**Workflows**: 3 (Deploy, Test, Database Migration)  
**Version**: v2.7
