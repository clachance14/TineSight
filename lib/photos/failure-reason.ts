/** Translate stored worker errors into operator-facing reasons without exposing logs. */
export function photoFailureReason(stage: 'preview' | 'analysis', status: string, storedError: string | null | undefined): string | null {
  if (status !== 'failed') return null
  const label = stage === 'preview' ? 'Preview generation' : 'Photo analysis'
  const error = storedError?.toLowerCase() ?? ''
  if (/stopped after \d+ interrupted attempts/.test(error)) {
    return `${label} stopped after repeated interruptions. Automatic retries have stopped.`
  }
  if (/timeout|timed out|deadline exceeded/.test(error)) return `${label} took too long and could not finish.`
  if (/unsupported|corrupt|invalid image|decode/.test(error)) return `The image could not be read for ${stage === 'preview' ? 'preview generation' : 'analysis'}.`
  if (/not found|notfound|no such key|404/.test(error)) return `${label} could not read the original upload.`
  if (/429|rate limit|quota|capacity|503|unavailable/.test(error)) return `${label} could not finish because the processing service was unavailable or busy.`
  return `${label} could not finish. The failure details have been recorded.`
}
