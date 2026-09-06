/**
 * Redirects stay on this application. Browsers normalize backslashes to slashes
 * and strip tab, LF and CR before parsing, so `/\t/evil.example` would resolve
 * off-site; any ASCII control character is rejected before the path checks.
 */
export function authNextPath(value: string | null): string {
  if (value === null || /[\u0000-\u001F\u007F]/.test(value) || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/photos'
  return value
}

export function loginSuccessMessage(code: string | null): string | null {
  return code === 'password-updated' ? 'Password updated successfully. Sign in with your new password.' : null
}

export function loginErrorMessage(code: string | null): string | null {
  if (code === 'callback-failed') return 'This email link could not be opened. Try signing in, or request a fresh link and open it in the browser where you requested it.'
  if (code === 'account-setup') return 'Your account setup needs another try. Sign in again to finish setting up your profile.'
  return null
}
