/** Observers (UI callbacks, debug hooks) report; they never decide an upload's outcome. */
export function observe<A extends unknown[]>(callback: ((...args: A) => void) | undefined, ...args: A): void {
  try { callback?.(...args) } catch (error) { console.error('[Upload] observer failed:', error) }
}
