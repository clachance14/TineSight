/**
 * Suppress known React warnings from third-party libraries
 *
 * This file suppresses the "flushSync was called from inside a lifecycle method" warning
 * that comes from @tanstack/react-virtual. This is a known issue with React 19 compatibility:
 * - https://github.com/TanStack/virtual/issues/628
 * - https://github.com/TanStack/virtual/issues/1094
 *
 * The virtualization still works correctly, this is just a warning about internal library behavior.
 */

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    const msg = args[0]
    if (
      typeof msg === 'string' &&
      msg.includes('flushSync was called from inside a lifecycle method')
    ) {
      return // Suppress TanStack Virtual's known React 19 warning
    }
    originalError.apply(console, args)
  }
}
