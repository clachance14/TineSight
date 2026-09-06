import type { QueryClient } from '@tanstack/react-query'

// The browser QueryClient survives provider effect remounts.
const identities = new WeakMap<QueryClient, string | null>()

/** Called synchronously from auth notifications; never awaits auth inside its lock. */
export function createAccountBoundary(
  queryClient: QueryClient,
  clearPrivateState: () => void,
  onAccountChange: (accountId: string | null, previousAccountId: string | null) => void = () => {},
): (accountId: string | null) => void {
  return (nextAccountId: string | null) => {
    const known = identities.has(queryClient)
    const previous = identities.get(queryClient)
    if (known && previous === nextAccountId) return
    identities.set(queryClient, nextAccountId)
    if (!known) return
    void queryClient.cancelQueries()
    queryClient.clear()
    clearPrivateState()
    onAccountChange(nextAccountId, previous ?? null)
  }
}

/** Auth forms finish profile setup before navigating, including direct account switches. */
export function authNavigation(accountId: string | null, isAuthForm: boolean, isPublicPage = false): 'form' | 'reload' | 'login' {
  if (accountId === null) return isAuthForm ? 'form' : isPublicPage ? 'reload' : 'login'
  return isAuthForm ? 'form' : 'reload'
}
