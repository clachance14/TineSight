import './env.mjs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Generate a detailed report for a batch processing run
 *
 * Usage:
 *   node scripts/batch-report.mjs <batch-id>
 *   node scripts/batch-report.mjs --latest
 */
async function generateBatchReport(batchId) {
  console.log('\nFetching batch data...\n')

  // 1. Get batch summary
  const { data: batch, error: batchError } = await supabase
    .from('processing_batches')
    .select('*')
    .eq('id', batchId)
    .single()

  if (batchError || !batch) {
    console.error('Error fetching batch:', batchError?.message || 'Batch not found')
    return
  }

  // 2. Calculate total duration
  const startTime = new Date(batch.created_at)
  const endTime = batch.completed_at ? new Date(batch.completed_at) : new Date()
  const durationMs = endTime - startTime
  const durationSeconds = Math.round(durationMs / 1000)
  const durationMinutes = (durationMs / 1000 / 60).toFixed(2)

  // 3. Get error summary
  const { data: failedImages, error: failedError } = await supabase
    .from('images')
    .select('id, error_message, file_path')
    .eq('batch_id', batchId)
    .eq('detection_status', 'failed')

  if (failedError) {
    console.warn('Warning: Could not fetch failed images:', failedError.message)
  }

  // 4. Aggregate token metrics
  const { data: metrics, error: metricsError } = await supabase
    .from('batch_metrics')
    .select('*')
    .eq('batch_id', batchId)

  if (metricsError) {
    console.warn('Warning: Could not fetch metrics:', metricsError.message)
    console.warn('(This is expected if batch was processed before metrics tracking was enabled)')
  }

  // Initialize token summary
  const tokenSummary = {
    detection: { prompt: 0, response: 0, total: 0, calls: 0, durationMs: 0 },
    classification: { prompt: 0, response: 0, total: 0, calls: 0, durationMs: 0 },
    comparison: { prompt: 0, response: 0, total: 0, calls: 0, durationMs: 0 },
  }

  let rateLimitEvents = 0
  let totalRetries = 0
  const modelsUsed = new Set()

  if (metrics && metrics.length > 0) {
    for (const m of metrics) {
      const type = m.gemini_call_type
      if (tokenSummary[type]) {
        tokenSummary[type].prompt += m.prompt_tokens || 0
        tokenSummary[type].response += m.response_tokens || 0
        tokenSummary[type].total += m.total_tokens || 0
        tokenSummary[type].calls++
        tokenSummary[type].durationMs += m.duration_ms || 0
      }
      if (m.is_rate_limited) rateLimitEvents++
      totalRetries += m.retry_count || 0
      if (m.model_used) modelsUsed.add(m.model_used)
    }
  }

  // Calculate totals
  const totalPromptTokens = tokenSummary.detection.prompt + tokenSummary.classification.prompt + tokenSummary.comparison.prompt
  const totalResponseTokens = tokenSummary.detection.response + tokenSummary.classification.response + tokenSummary.comparison.response
  const totalTokens = tokenSummary.detection.total + tokenSummary.classification.total + tokenSummary.comparison.total

  // Calculate processing rate
  const imagesPerMinute = batch.processed_images > 0 && durationMinutes > 0
    ? (batch.processed_images / durationMinutes).toFixed(1)
    : 'N/A'

  // 5. Generate report
  console.log(`
================================================================================
TINESIGHT BATCH PROCESSING REPORT
================================================================================
Batch ID: ${batchId}
Status:   ${batch.status.toUpperCase()}

DURATION
--------
Started:    ${startTime.toISOString()}
Completed:  ${batch.completed_at ? endTime.toISOString() : 'Still processing...'}
Total:      ${durationMinutes} minutes (${durationSeconds} seconds)

PROCESSING SUMMARY
------------------
Total Images:      ${batch.total_images}
Processed:         ${batch.processed_images}
Successful:        ${batch.successful_images}
Failed:            ${batch.failed_images}
Success Rate:      ${batch.total_images > 0 ? ((batch.successful_images / batch.total_images) * 100).toFixed(1) : 0}%
Processing Rate:   ${imagesPerMinute} images/minute

GEMINI TOKEN USAGE
------------------
Detection Calls:
  - Call Count:      ${tokenSummary.detection.calls}
  - Prompt Tokens:   ${tokenSummary.detection.prompt.toLocaleString()}
  - Response Tokens: ${tokenSummary.detection.response.toLocaleString()}
  - Total Tokens:    ${tokenSummary.detection.total.toLocaleString()}
  - Avg Duration:    ${tokenSummary.detection.calls > 0 ? Math.round(tokenSummary.detection.durationMs / tokenSummary.detection.calls) : 0}ms

Classification Calls:
  - Call Count:      ${tokenSummary.classification.calls}
  - Prompt Tokens:   ${tokenSummary.classification.prompt.toLocaleString()}
  - Response Tokens: ${tokenSummary.classification.response.toLocaleString()}
  - Total Tokens:    ${tokenSummary.classification.total.toLocaleString()}
  - Avg Duration:    ${tokenSummary.classification.calls > 0 ? Math.round(tokenSummary.classification.durationMs / tokenSummary.classification.calls) : 0}ms

TOTALS:
  - Total API Calls: ${(tokenSummary.detection.calls + tokenSummary.classification.calls + tokenSummary.comparison.calls).toLocaleString()}
  - Prompt Tokens:   ${totalPromptTokens.toLocaleString()}
  - Response Tokens: ${totalResponseTokens.toLocaleString()}
  - TOTAL TOKENS:    ${totalTokens.toLocaleString()}

Models Used: ${modelsUsed.size > 0 ? Array.from(modelsUsed).join(', ') : 'N/A'}

RATE LIMITING & RETRIES
-----------------------
Rate Limit Events: ${rateLimitEvents}
Total Retries:     ${totalRetries}

ERRORS (${failedImages?.length || 0})
------
${!failedImages || failedImages.length === 0
  ? 'No errors encountered.'
  : failedImages.slice(0, 10).map(img =>
      `- ${img.file_path?.split('/').pop() || img.id}:\n    ${img.error_message || 'Unknown error'}`
    ).join('\n') + (failedImages.length > 10 ? `\n  ... and ${failedImages.length - 10} more errors` : '')
}
================================================================================
`)

  // Return data for programmatic use
  return {
    batchId,
    status: batch.status,
    duration: { ms: durationMs, seconds: durationSeconds, minutes: parseFloat(durationMinutes) },
    processing: {
      total: batch.total_images,
      processed: batch.processed_images,
      successful: batch.successful_images,
      failed: batch.failed_images,
      successRate: batch.total_images > 0 ? (batch.successful_images / batch.total_images) * 100 : 0,
    },
    tokens: {
      detection: tokenSummary.detection,
      classification: tokenSummary.classification,
      total: totalTokens,
    },
    rateLimit: { events: rateLimitEvents, retries: totalRetries },
    errors: failedImages || [],
  }
}

// Main entry point
async function main() {
  const arg = process.argv[2]

  if (!arg) {
    console.log('Usage: node scripts/batch-report.mjs <batch-id>')
    console.log('       node scripts/batch-report.mjs --latest')
    console.log('       node scripts/batch-report.mjs --list')
    process.exit(1)
  }

  if (arg === '--list') {
    // List recent batches
    const { data: batches, error } = await supabase
      .from('processing_batches')
      .select('id, status, total_images, processed_images, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching batches:', error.message)
      process.exit(1)
    }

    console.log('\nRecent Batches:\n')
    console.log('ID                                     | Status     | Images | Created')
    console.log('-'.repeat(80))

    for (const b of batches) {
      const created = new Date(b.created_at).toLocaleString()
      console.log(`${b.id} | ${b.status.padEnd(10)} | ${String(b.total_images).padStart(6)} | ${created}`)
    }
    console.log('')
    return
  }

  let batchId = arg

  if (arg === '--latest') {
    const { data: latestBatch, error } = await supabase
      .from('processing_batches')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !latestBatch) {
      console.error('No batches found')
      process.exit(1)
    }

    batchId = latestBatch.id
  }

  await generateBatchReport(batchId)
}

main().catch(console.error)
