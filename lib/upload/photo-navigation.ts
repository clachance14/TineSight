/** A multi-chunk upload opens its gallery once, without later chunks interrupting browsing. */
export function createUploadPhotoNavigator(push: (href: string) => void) {
  const openedSessions = new Set<string>()
  return (sessionId: string): void => {
    if (openedSessions.has(sessionId)) return
    openedSessions.add(sessionId)
    const params = new URLSearchParams({ uploadSessionId: sessionId, triageView: 'all' })
    push(`/photos?${params.toString()}`)
  }
}
