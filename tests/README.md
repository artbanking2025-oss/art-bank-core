# Art Bank Core - Integration Tests

## Overview

Comprehensive integration test suite for Art Bank Core API covering authentication, authorization, core endpoints, admin features, and system behavior.

## Test Files

### 1. `smoke.test.ts` (Fast Smoke Tests)
Quick validation tests for CI/CD pipelines:
- Health checks
- OpenAPI availability  
- Authentication
- Protected endpoints
- API versioning

**Run time**: ~5 seconds  
**Coverage**: Critical paths only

### 2. `api.test.ts` (Full Integration Tests)
Complete API test suite covering:
- **Health & Public Endpoints** (4 tests)
  - Health checks (/health, /healthz, /readyz)
  - OpenAPI documentation
  - API versioning (V1/V2)
  
- **Authentication** (12 tests)
  - User registration
  - Login/logout
  - Token validation
  - Invalid credentials handling
  - Role-based access
  
- **Core API Endpoints** (15 tests)
  - Nodes CRUD (create, read, update, delete)
  - Edges/Relationships management
  - Artworks management
  - Transactions recording
  - Graph data retrieval
  
- **Admin Features** (5 tests)
  - Admin dashboard access
  - Metrics API
  - Time series data
  - Role-based restrictions
  
- **System Behavior** (5 tests)
  - Rate limiting enforcement
  - HTTP caching headers
  - Error handling
  - 404 responses

**Run time**: ~30-60 seconds  
**Coverage**: 67+ API endpoints  
**Total Tests**: 41

## Running Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Ensure server is running
pm2 start ecosystem.config.cjs

# Or run manually
npm run dev:sandbox
```

### Run All Tests
```bash
npm test
```

### Run Smoke Tests Only
```bash
npm test -- smoke.test.ts
```

### Run Full Integration Tests
```bash
npm test -- api.test.ts
```

### Run with Coverage
```bash
npm run test:coverage
```

### Watch Mode (Development)
```bash
npm run test:watch
```

### Verbose Output
```bash
npm run test:verbose
```

### Test Production Deployment
```bash
npm run test:prod
# Sets TEST_URL=https://art-bank.pages.dev
```

## Test Configuration

### Environment Variables
- `TEST_URL`: Base URL for API (default: `http://localhost:3000`)
  - Local: `http://localhost:3000`
  - Sandbox: `https://3000-ir9tb52hhw0a86hr4kq8c-2e77fc33.sandbox.novita.ai`
  - Production: `https://art-bank.pages.dev`

### Jest Config (`jest.config.cjs`)
```javascript
{
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 10000,
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  coverageDirectory: 'coverage'
}
```

## Test Coverage Targets

| Metric | Target | Current |
|--------|--------|---------|
| **Statements** | > 80% | TBD |
| **Branches** | > 75% | TBD |
| **Functions** | > 80% | TBD |
| **Lines** | > 80% | TBD |

## Test Data

### Admin User (Pre-created)
- Email: `admin@artbank.io`
- Password: `AdminPass123!`
- Role: `admin`

### Test Accounts (Created during tests)
- Auto-generated collector accounts
- Unique email addresses (`test-collector-{timestamp}@test.com`)
- Cleaned up after tests

### Test Artifacts
- Test nodes, edges, artworks, transactions
- Created during test execution
- Deleted in cleanup phase

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - run: npm run db:migrate:local
      - run: pm2 start ecosystem.config.cjs
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Pre-deployment Checks
```bash
# Run before deploying to production
npm run build
npm test
npm run test:coverage

# If all pass, deploy
npm run deploy:prod
```

## Test Development Guidelines

### Writing New Tests
1. **Group related tests**: Use `describe` blocks for logical grouping
2. **Clear test names**: Use descriptive names that explain what's being tested
3. **Arrange-Act-Assert**: Structure tests clearly (setup, execute, verify)
4. **Independent tests**: Each test should be independent and not rely on others
5. **Cleanup**: Always clean up test data to avoid pollution

### Example Test Structure
```typescript
describe('Feature Name', () => {
  test('should do something specific', async () => {
    // Arrange: Setup test data
    const testData = { ... };
    
    // Act: Execute the operation
    const response = await fetch(url, options);
    
    // Assert: Verify expectations
    expect(response.status).toBe(200);
    expect(data).toHaveProperty('expected');
  });
});
```

### Best Practices
- ✅ Test happy paths and error cases
- ✅ Validate response status codes
- ✅ Check response data structure
- ✅ Test authentication and authorization
- ✅ Verify rate limiting behavior
- ✅ Check cache headers
- ✅ Test edge cases (empty data, invalid input)
- ❌ Don't test implementation details
- ❌ Avoid brittle tests (over-specific assertions)
- ❌ Don't rely on execution order

## Debugging Failed Tests

### View Detailed Output
```bash
npm run test:verbose
```

### Run Single Test
```bash
npm test -- -t "test name pattern"
```

### Check Server Logs
```bash
pm2 logs art-bank --nostream
```

### Inspect Test Database
```bash
npm run db:console:local
# Then run SQL queries
```

### Common Issues

#### Tests Timeout
- Increase timeout in jest.config.cjs
- Check if server is running
- Verify network connectivity

#### Authentication Failures
- Verify admin user exists in database
- Check password hash implementation
- Ensure JWT secret is consistent

#### Rate Limit Errors
- Rate limits may persist from previous runs
- Wait 60 seconds or restart server
- Adjust rate limit thresholds for testing

#### Database Errors
- Run migrations: `npm run db:migrate:local`
- Reset database: `npm run db:reset`
- Check database connection

## Performance Benchmarks

### Expected Test Duration
- Smoke tests: 3-5 seconds
- Full integration tests: 30-60 seconds
- Coverage report: +10-15 seconds

### API Response Times
- Health checks: < 50ms
- Authentication: < 100ms
- CRUD operations: < 200ms
- Graph queries: < 300ms

## Future Enhancements

- [ ] Load testing (k6 or Artillery)
- [ ] Security testing (OWASP ZAP)
- [ ] Contract testing (Pact)
- [ ] Performance regression tests
- [ ] Visual regression tests (Percy/Chromatic)
- [ ] End-to-end tests (Playwright)
- [ ] Mutation testing (Stryker)

## Resources

- **Jest Documentation**: https://jestjs.io/
- **Supertest**: https://github.com/visionmedia/supertest
- **Testing Best Practices**: https://testingjavascript.com/

## Support

For issues or questions about tests:
1. Check this README
2. Review test output and logs
3. Inspect API documentation (`/api/docs`)
4. Contact development team

---

**Last Updated**: 2026-04-02  
**Test Coverage**: 67+ endpoints  
**Total Tests**: 41 (smoke: 5, integration: 36)
