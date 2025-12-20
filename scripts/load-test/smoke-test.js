/**
 * Smoke Test
 *
 * Quick health check for all major API endpoints.
 * Designed for CI/CD pipelines - runs fast with minimal load.
 *
 * Run: k6 run --env BASE_URL=http://localhost:3000 --env AUTH_TOKEN=xxx scripts/load-test/smoke-test.js
 */

import http from 'k6/http'
import { check } from 'k6'
import { BASE_URL, getHeaders, smokeTestProfile } from './config.js'

export const options = {
  scenarios: {
    smoke: smokeTestProfile,
  },
  thresholds: {
    http_req_failed: ['rate<0.1'], // Allow 10% failure for smoke test
    http_req_duration: ['p(95)<2000'], // 2s threshold for smoke test
  },
}

export default function () {
  const headers = getHeaders()

  // Test each major endpoint
  const endpoints = [
    { name: 'photos', url: `${BASE_URL}/api/photos?limit=5` },
    { name: 'photos_stats', url: `${BASE_URL}/api/photos/stats` },
    { name: 'deer', url: `${BASE_URL}/api/deer?limit=5` },
  ]

  for (const endpoint of endpoints) {
    const res = http.get(endpoint.url, {
      headers,
      tags: { name: endpoint.name },
    })

    check(res, {
      [`${endpoint.name} responds`]: (r) => r.status === 200 || r.status === 401,
      [`${endpoint.name} under 2s`]: (r) => r.timings.duration < 2000,
    })
  }
}
