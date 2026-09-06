import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runs } from '@trigger.dev/sdk/v3'

interface RouteContext {
  params: Promise<{ jobId: string }>
}

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface JobStatusResponse {
  status: JobStatus
  current: number
  total: number
  progress?: {
    current: number
    total: number
  }
  downloadUrl?: string
  error?: string
}

/**
 * GET /api/photos/export/[jobId]/status
 *
 * Returns the status of a background export job.
 *
 * Maps Trigger.dev run statuses to simplified export job statuses:
 * - PENDING, QUEUED, DELAYED → pending
 * - EXECUTING, REATTEMPTING, FROZEN → processing
 * - COMPLETED → completed
 * - FAILED, CRASHED, CANCELED, INTERRUPTED, SYSTEM_FAILURE → failed
 *
 * @returns JobStatusResponse with current status, progress (if available), downloadUrl (if completed), or error (if failed)
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse<JobStatusResponse | { error: string }>> {
  try {
    const { jobId } = await context.params

    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate jobId format (should be a Trigger.dev run ID)
    // Trigger.dev run IDs typically follow pattern: run_[alphanumeric]
    if (!jobId || typeof jobId !== 'string' || jobId.trim() === '') {
      return NextResponse.json(
        { error: 'Invalid job ID format' },
        { status: 400 }
      )
    }

    // Fetch run status from Trigger.dev
    let run
    try {
      run = await runs.retrieve(jobId)
    } catch (triggerError) {
      console.error('Failed to retrieve run from Trigger.dev:', triggerError)

      // Check if it's a 404 error (job not found)
      if (triggerError instanceof Error && triggerError.message.includes('404')) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        )
      }

      // Generic Trigger.dev error
      return NextResponse.json(
        { error: 'Failed to retrieve job status' },
        { status: 500 }
      )
    }

    // Verify user owns this export job
    // Payload should contain userId from when job was triggered
    const payload = run.payload as Record<string, unknown> | undefined
    const jobUserId = typeof payload?.['userId'] === 'string' ? payload['userId'] : null

    if (!jobUserId || jobUserId !== user.id) {
      // Return 404 to avoid leaking job existence
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Map Trigger.dev status to our simplified status
    const status: JobStatus = mapTriggerStatus(run.status)

    // Build response
    const response: JobStatusResponse = { status, current: 0, total: Array.isArray(payload?.['photoIds']) ? payload['photoIds'].length : 0 }

    // Extract progress from metadata if available
    if (run.metadata && typeof run.metadata === 'object') {
      const raw = run.metadata as Record<string, unknown>
      const metadata = (raw['progress'] !== null && typeof raw['progress'] === 'object' ? raw['progress'] : raw) as Record<string, unknown>
      if (
        typeof metadata['current'] === 'number' &&
        typeof metadata['total'] === 'number'
      ) {
        response.current = metadata['current']
        response.total = metadata['total']
        response.progress = {
          current: metadata['current'],
          total: metadata['total'],
        }
      }
    }

    // For completed runs, get downloadUrl from output
    if (status === 'completed' && run.output) {
      const output = run.output as Record<string, unknown>
      if (output['success'] === false) {
        response.status = 'failed'
        response.error = typeof output['error'] === 'string' ? output['error'] : 'Export job failed'
      } else if (typeof output['downloadUrl'] === 'string') {
        response.downloadUrl = output['downloadUrl']
      }
    }

    // For failed runs, extract error message
    if (status === 'failed') {
      // Try to get error from the run's error property
      if (run.error) {
        response.error = run.error.message || 'Export job failed'
      } else {
        response.error = 'Export job failed'
      }
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/photos/export/[jobId]/status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Maps Trigger.dev run status to simplified export job status
 */
function mapTriggerStatus(triggerStatus: string): JobStatus {
  switch (triggerStatus) {
    case 'PENDING_VERSION':
    case 'DELAYED':
    case 'QUEUED':
      return 'pending'

    case 'EXECUTING':
    case 'REATTEMPTING':
    case 'FROZEN':
      return 'processing'

    case 'COMPLETED':
      return 'completed'

    case 'FAILED':
    case 'CRASHED':
    case 'CANCELED':
    case 'INTERRUPTED':
    case 'SYSTEM_FAILURE':
      return 'failed'

    default:
      // Default to processing for unknown statuses
      console.warn('Unknown Trigger.dev status encountered:', triggerStatus)
      return 'processing'
  }
}
