import { NextRequest, NextResponse } from 'next/server'

/**
 * Debug logging endpoint - receives client-side logs and prints to server console.
 * Useful for debugging iOS Safari crashes where client console isn't accessible.
 *
 * DELETE THIS FILE after debugging is complete.
 */
export async function POST(request: NextRequest) {
  try {
    const { step, data, timestamp, userAgent } = await request.json()

    // Log to Vercel function logs with clear formatting
    console.log(`\n📱 [DEBUG-LOG] ========================`)
    console.log(`📱 [DEBUG-LOG] Step: ${step}`)
    console.log(`📱 [DEBUG-LOG] Time: ${timestamp}`)
    console.log(`📱 [DEBUG-LOG] UA: ${userAgent?.substring(0, 100)}`)
    if (data) {
      console.log(`📱 [DEBUG-LOG] Data:`, JSON.stringify(data, null, 2))
    }
    console.log(`📱 [DEBUG-LOG] ========================\n`)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[DEBUG-LOG] Error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
