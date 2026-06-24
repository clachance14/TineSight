export interface SwipeInput {
  /** slide width in px */
  width: number
  /** horizontal drag distance in px (+ = dragged right = toward prev) */
  dx: number
  /** release velocity in px/ms (+ = moving right) */
  vx: number
  hasPrev: boolean
  hasNext: boolean
}

export type SwipeResult = 'prev' | 'current' | 'next'

const DISTANCE_RATIO = 0.5 // must cross half the slide to commit on distance alone
const FLICK_VELOCITY = 0.4 // px/ms; a fast flick commits regardless of distance

/** Decide where a finger-follow drag should settle. Pure: no DOM. */
export function resolveSwipe({ width, dx, vx, hasPrev, hasNext }: SwipeInput): SwipeResult {
  const farEnough = Math.abs(dx) > width * DISTANCE_RATIO
  const fastEnough = Math.abs(vx) > FLICK_VELOCITY
  if (!farEnough && !fastEnough) return 'current'
  // Negative dx / vx = moving left = next photo.
  const goingNext = (dx + vx * 100) < 0
  if (goingNext) return hasNext ? 'next' : 'current'
  return hasPrev ? 'prev' : 'current'
}
