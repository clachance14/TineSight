/**
 * Deer Catalog Load Test
 *
 * Simulates users browsing the deer catalog with pagination.
 *
 * Run: k6 run --env BASE_URL=http://localhost:3000 --env AUTH_TOKEN=xxx scripts/load-test/deer-catalog.js
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { BASE_URL, getHeaders, defaultThresholds, standardLoadProfile } from './config.js'

export const options = {
  scenarios: {
    deer_catalog: standardLoadProfile,
  },
  thresholds: {
    ...defaultThresholds,
    'http_req_duration{name:deer_list}': ['p(95)<400'], // Deer list should be fast
    'http_req_duration{name:deer_detail}': ['p(95)<600'], // Deer detail slightly slower
  },
}

export default function () {
  const headers = getHeaders()

  // 1. Initial catalog load
  const catalogRes = http.get(`${BASE_URL}/api/deer?limit=24`, {
    headers,
    tags: { name: 'deer_list' },
  })

  const catalogCheck = check(catalogRes, {
    'catalog status 200': (r) => r.status === 200,
    'catalog has deer': (r) => {
      const body = JSON.parse(r.body)
      return body.deer && Array.isArray(body.deer)
    },
    'catalog under 400ms': (r) => r.timings.duration < 400,
  })

  sleep(1)

  // 2. If we got deer, view one of them
  if (catalogCheck) {
    try {
      const catalog = JSON.parse(catalogRes.body)
      if (catalog.deer && catalog.deer.length > 0) {
        // Pick a random deer
        const deer = catalog.deer[Math.floor(Math.random() * catalog.deer.length)]

        const detailRes = http.get(`${BASE_URL}/api/deer/${deer.id}`, {
          headers,
          tags: { name: 'deer_detail' },
        })

        check(detailRes, {
          'detail status 200': (r) => r.status === 200,
          'detail has sightings': (r) => {
            const body = JSON.parse(r.body)
            return body.sightings && Array.isArray(body.sightings)
          },
          'detail under 600ms': (r) => r.timings.duration < 600,
        })

        sleep(2) // User viewing deer profile
      }
    } catch (e) {
      console.error('Error parsing catalog:', e)
    }
  }

  // 3. Search for deer by name
  const searchRes = http.get(`${BASE_URL}/api/deer?search=buck&limit=24`, {
    headers,
    tags: { name: 'deer_search' },
  })

  check(searchRes, {
    'search status 200': (r) => r.status === 200,
    'search under 400ms': (r) => r.timings.duration < 400,
  })

  sleep(1)

  // 4. Load next page with cursor (if available)
  try {
    const catalog = JSON.parse(catalogRes.body)
    if (catalog.nextCursor) {
      const page2Res = http.get(
        `${BASE_URL}/api/deer?limit=24&cursor=${encodeURIComponent(catalog.nextCursor)}`,
        { headers, tags: { name: 'deer_list' } }
      )

      check(page2Res, {
        'page 2 status 200': (r) => r.status === 200,
        'page 2 under 400ms': (r) => r.timings.duration < 400,
      })
    }
  } catch (e) {
    // No cursor available
  }

  sleep(1)
}
