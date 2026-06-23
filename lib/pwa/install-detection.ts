/**
 * Pure, DOM-free logic for the iOS "Add to Home Screen" hint.
 * Browser signals are passed in as plain values so this is unit-testable.
 */

export interface InstallHintEnv {
  /** navigator.userAgent */
  userAgent: string
  /** navigator.platform (deprecated but still needed for iPadOS detection) */
  platform: string
  /** navigator.maxTouchPoints */
  maxTouchPoints: number
  /** window.matchMedia('(display-mode: standalone)').matches */
  matchStandalone: boolean
  /** navigator.standalone (iOS Safari only; undefined elsewhere) */
  navigatorStandalone: boolean | undefined
  /** persisted dismissal flag */
  dismissed: boolean
}

/**
 * True only for real iOS Safari (the one browser that can install a PWA on iOS).
 * Excludes Chrome/Firefox/Edge/Opera on iOS, which cannot. Handles the iPadOS
 * desktop user-agent case (reports as MacIntel with touch points).
 */
export function isIosSafari(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  const isIDevice = /iPad|iPhone|iPod/.test(userAgent)
  const isIpadOsDesktop = platform === 'MacIntel' && maxTouchPoints > 1
  if (!isIDevice && !isIpadOsDesktop) return false

  // Other iOS browsers cannot install PWAs — never show them the hint.
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(userAgent)
  return !isOtherIosBrowser
}

/** True if the app is already running as an installed standalone PWA. */
export function isStandaloneDisplay(
  matchStandalone: boolean,
  navigatorStandalone: boolean | undefined,
): boolean {
  return matchStandalone || navigatorStandalone === true
}

/** Final decision: show the hint only for fresh, in-browser iOS Safari. */
export function shouldShowInstallHint(env: InstallHintEnv): boolean {
  if (env.dismissed) return false
  if (isStandaloneDisplay(env.matchStandalone, env.navigatorStandalone)) {
    return false
  }
  return isIosSafari(env.userAgent, env.platform, env.maxTouchPoints)
}
