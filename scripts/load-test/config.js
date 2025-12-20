/**
 * k6 Load Test Configuration
 *
 * Shared configuration for all load test scenarios.
 * Customize BASE_URL and AUTH_TOKEN before running tests.
 */

// Base URL for API requests - change to your deployment URL
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

// Authentication token - set via K6_AUTH_TOKEN environment variable
// Get this from browser dev tools > Application > Cookies > sb-xxx-auth-token
export const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

// Default request headers
export function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (AUTH_TOKEN) {
    // Supabase auth uses cookie-based session, but API routes accept Bearer token too
    headers['Cookie'] = `sb-auth-token=${AUTH_TOKEN}`
  }

  return headers
}

// Thresholds for test success/failure
export const defaultThresholds = {
  http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
  http_req_failed: ['rate<0.01'], // Less than 1% failed requests
  http_reqs: ['rate>10'], // At least 10 requests per second
}

// Standard load profile for API routes
export const standardLoadProfile = {
  executor: 'ramping-vus',
  startVUs: 1,
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 25 },   // Ramp to 25 users
    { duration: '30s', target: 50 },  // Spike to 50 users
    { duration: '1m', target: 25 },   // Back down to 25
    { duration: '30s', target: 0 },   // Ramp down
  ],
}

// Light load profile for quick smoke tests
export const smokeTestProfile = {
  executor: 'constant-vus',
  vus: 1,
  duration: '30s',
}
