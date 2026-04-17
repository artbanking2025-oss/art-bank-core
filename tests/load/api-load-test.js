/**
 * K6 Load Testing Script for Art Bank Core API
 * 
 * Test scenarios:
 * - Smoke test: Verify basic functionality
 * - Load test: Normal traffic simulation
 * - Stress test: Find breaking point
 * - Spike test: Sudden traffic increase
 * 
 * Run:
 * - k6 run tests/load/api-load-test.js
 * - k6 run --vus 100 --duration 5m tests/load/api-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test scenarios
export const options = {
  scenarios: {
    // Smoke test: 1 user for 1 minute
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { scenario: 'smoke' },
      exec: 'smokeTest',
    },
    
    // Load test: Ramp up to 50 users over 5 minutes
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },  // Ramp up
        { duration: '5m', target: 50 },  // Stay at 50
        { duration: '2m', target: 0 },   // Ramp down
      ],
      tags: { scenario: 'load' },
      exec: 'loadTest',
      startTime: '2m',  // Start after smoke test
    },
    
    // Stress test: Push to breaking point
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '3m', target: 100 },
        { duration: '2m', target: 150 },
        { duration: '2m', target: 0 },
      ],
      tags: { scenario: 'stress' },
      exec: 'stressTest',
      startTime: '10m',  // Start after load test
    },
    
    // Spike test: Sudden traffic increase
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },  // Sudden spike
        { duration: '1m', target: 100 },   // Stay
        { duration: '10s', target: 0 },    // Drop
      ],
      tags: { scenario: 'spike' },
      exec: 'spikeTest',
      startTime: '20m',  // Start after stress test
    }
  },
  
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],  // 95% < 500ms, 99% < 1s
    'http_req_failed': ['rate<0.05'],  // Error rate < 5%
    'errors': ['rate<0.05'],
  },
};

// Test data
let authToken = null;

function getAuthToken() {
  if (authToken) return authToken;
  
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: 'test@example.com',
    password: 'Test123!@#'
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    authToken = body.tokens?.access_token;
  }
  
  return authToken;
}

// Smoke test: Basic health checks
export function smokeTest() {
  group('Health Checks', () => {
    const res = http.get(`${BASE_URL}/health`);
    
    check(res, {
      'health check status is 200': (r) => r.status === 200,
      'response time < 200ms': (r) => r.timings.duration < 200,
    });
    
    errorRate.add(res.status !== 200);
    apiDuration.add(res.timings.duration);
  });
  
  sleep(1);
}

// Load test: Simulate normal traffic
export function loadTest() {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  
  group('API Endpoints', () => {
    // Test NLP health (public)
    let res = http.get(`${BASE_URL}/api/nlp/health`);
    check(res, { 'NLP health OK': (r) => r.status === 200 });
    
    // Test ML health (public)
    res = http.get(`${BASE_URL}/api/ml/health`);
    check(res, { 'ML health OK': (r) => r.status === 200 });
    
    // Test sentiment analysis (protected)
    if (token) {
      res = http.post(
        `${BASE_URL}/api/sentiment/analyze`,
        JSON.stringify({ text: 'This is a great artwork!' }),
        { headers }
      );
      check(res, { 'Sentiment analysis OK': (r) => r.status === 200 });
      errorRate.add(res.status !== 200);
      apiDuration.add(res.timings.duration);
    }
  });
  
  sleep(Math.random() * 3 + 1);  // 1-4s random delay
}

// Stress test: Push system limits
export function stressTest() {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  
  group('Heavy Operations', () => {
    if (token) {
      // NLP analysis (CPU intensive)
      let res = http.post(
        `${BASE_URL}/api/nlp/analyze`,
        JSON.stringify({
          text: 'This beautiful masterpiece by Picasso sold for $50 million at auction in New York. The painting showcases incredible impressionist style.'
        }),
        { headers }
      );
      
      check(res, {
        'NLP analysis completed': (r) => r.status === 200,
        'Response time acceptable': (r) => r.timings.duration < 2000,
      });
      
      errorRate.add(res.status !== 200);
      apiDuration.add(res.timings.duration);
    }
  });
  
  sleep(0.5);  // Shorter delay for stress
}

// Spike test: Sudden load increase
export function spikeTest() {
  group('Quick Requests', () => {
    const res = http.get(`${BASE_URL}/health`);
    
    check(res, {
      'health check survived spike': (r) => r.status === 200,
    });
    
    errorRate.add(res.status !== 200);
  });
  
  sleep(0.1);  // Very short delay
}

// Setup function (runs once)
export function setup() {
  console.log('🚀 Starting load tests...');
  console.log(`📍 Target: ${BASE_URL}`);
  
  // Verify server is up
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error('Server not responding');
  }
  
  return { timestamp: new Date().toISOString() };
}

// Teardown function (runs once)
export function teardown(data) {
  console.log('✅ Load tests completed');
  console.log(`📊 Started at: ${data.timestamp}`);
}
