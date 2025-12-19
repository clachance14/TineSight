/**
 * Photo Browsing Load Test
 *
 * Simulates users browsing the photo grid with infinite scroll.
 *
 * Run: k6 run --env BASE_URL=http://localhost:3000 --env AUTH_TOKEN=xxx scripts/load-test/photo-browsing.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { BASE_URL, getHeaders, defaultThresholds, standardLoadProfile } from './config.js'

export const options = {
  scenarios: {
    photo_browsing: standardLoadProfile,
  },
  thresholds: defaultThresholds,
}

export default function () {
  const headers = getHeaders()

  // 1. Initial page load - GET /api/photos with default filters
  const photosRes = http.get(`${BASE_URL}/api/photos?limit=24`, { headers })
  check(photosRes, {
    'photos list status 200': (r) => r.status === 200,
    'photos list has data': (r) => {
      const body = JSON.parse(r.body)
      return body.photos && Array.isArray(body.photos)
    },
    'photos list under 500ms': (r) => r.timings.duration < 500,
  })

  sleep(1) // User viewing photos

  // 2. Load photo stats
  const statsRes = http.get(`${BASE_URL}/api/photos/stats`, { headers })
  check(statsRes, {
    'stats status 200': (r) => r.status === 200,
    'stats under 300ms': (r) => r.timings.duration < 300,
  })

  sleep(2) // User browsing

  // 3. Scroll down - load next page
  const page2Res = http.get(`${BASE_URL}/api/photos?limit=24&offset=24`, { headers })
  check(page2Res, {
    'page 2 status 200': (r) => r.status === 200,
    'page 2 under 500ms': (r) => r.timings.duration < 500,
  })

  sleep(2) // User browsing

  // 4. Apply filter - show only bucks
  const filteredRes = http.get(`${BASE_URL}/api/photos?limit=24&sex=buck`, { headers })
  check(filteredRes, {
    'filtered status 200': (r) => r.status === 200,
    'filtered under 500ms': (r) => r.timings.duration < 500,
  })

  sleep(1)
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'scripts/load-test/results/photo-browsing.json': JSON.stringify(data, null, 2),
  }
}

function textSummary(data, options) {
  // Simple text summary - k6 will use its built-in if this fails
  return `
Photo Browsing Load Test Summary
================================
Duration: ${data.state.testRunDurationMs}ms
VUs: ${data.metrics.vus?.values?.max || 'N/A'}
Requests: ${data.metrics.http_reqs?.values?.count || 'N/A'}
Failed: ${data.metrics.http_req_failed?.values?.rate || 'N/A'}
p95 Duration: ${data.metrics.http_req_duration?.values?.['p(95)'] || 'N/A'}ms
`
}
