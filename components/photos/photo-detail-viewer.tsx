'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PhotoPager } from '@/components/photos/photo-pager'
import { PhotoDetailClient } from '@/components/photos/photo-detail-client'
import { PhotoInfo } from '@/components/photos/photo-info'
import { PhotoDeleteButton } from '@/components/photos/photo-delete-button'
import { DetectionEditPanel } from '@/components/photos/detection-edit-panel'
import { useDetectionEdit } from '@/lib/stores/detection-edit'
import { useDetectionHover } from '@/lib/stores/detection-hover'
import { createViewLoader, photoRefreshDelay } from '@/lib/photos/view-refresh'
import type { PhotoViewDTO } from '@/lib/services/photo-view'

const IMG_W = 10000
const IMG_H = 10000

interface PhotoDetailViewerProps {
  initial: PhotoViewDTO
  navQueryString: string
  returnUrl: string
}

interface NeighborWindow {
  prev: PhotoViewDTO | null
  current: PhotoViewDTO
  next: PhotoViewDTO | null
}

export function PhotoDetailViewer({ initial, navQueryString, returnUrl }: PhotoDetailViewerProps): React.JSX.Element {
  const [win, setWin] = useState<NeighborWindow>({ prev: null, current: initial, next: null })
  const cacheRef = useRef<Map<string, PhotoViewDTO>>(new Map([[initial.id, initial]]))
  // Photo ids whose signed URLs we've already force-refreshed once after a load
  // error — prevents an unbounded error→refetch→error loop on a genuinely
  // missing storage object (each new signed URL would 404 the same way).
  const refreshedRef = useRef<Set<string>>(new Set())
  const qs = navQueryString !== '' ? `?${navQueryString}` : ''
  const current = win.current
  const { id: currentId, variantStatus, detectionStatus } = current

  const closeEditPanel = useDetectionEdit((s) => s.closePanel)
  const setPinnedDetectionId = useDetectionHover((s) => s.setPinnedDetectionId)
  const setHoveredDetectionId = useDetectionHover((s) => s.setHoveredDetectionId)

  const loader = useMemo(() => createViewLoader(cacheRef.current, qs), [qs])
  const fetchView = loader.load
  const currentIdRef = useRef(current.id)
  currentIdRef.current = current.id
  const navigationRef = useRef(0)
  const aliveRef = useRef(true)
  const [loadError, setLoadError] = useState<{ id: string; direction?: 'prev' | 'next' } | null>(null)

  useEffect(() => {
    aliveRef.current = true
    const abort = (): void => { aliveRef.current = false; loader.abort() }
    window.addEventListener('tinesight:account-changed', abort)
    return () => { abort(); window.removeEventListener('tinesight:account-changed', abort) }
  }, [loader])

  useEffect(() => {
    let stopped = false
    let attempts = 0
    let inFlight = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (): void => { timer = setTimeout(() => { void refresh() }, photoRefreshDelay({ variantStatus, detectionStatus }, attempts)) }
    const refresh = async (): Promise<void> => {
      if (stopped || !aliveRef.current || inFlight || document.visibilityState !== 'visible') return
      inFlight = true
      try {
        const dto = await fetchView(currentId, true)
        if (!stopped && aliveRef.current) {
          setWin(w => w.current.id === dto.id ? { ...w, current: dto } : w)
          setLoadError(error => error?.id === dto.id && error.direction === undefined ? null : error)
        }
      } catch {
        if (!stopped && aliveRef.current) setLoadError({ id: currentId })
      } finally { inFlight = false; attempts++; if (!stopped && aliveRef.current && document.visibilityState === 'visible') schedule() }
    }
    const visibility = (): void => {
      clearTimeout(timer)
      if (document.visibilityState === 'visible') void refresh()
    }
    if (document.visibilityState === 'visible') schedule()
    document.addEventListener('visibilitychange', visibility)
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [currentId, variantStatus, detectionStatus, fetchView])

  // Prefetch neighbors INTO STATE (so slides re-render) + prune cache to current ±1.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [prevDto, nextDto] = await Promise.all([
        current.prevId !== null ? fetchView(current.prevId).catch(() => null) : Promise.resolve(null),
        current.nextId !== null ? fetchView(current.nextId).catch(() => null) : Promise.resolve(null),
      ])
      if (cancelled || !aliveRef.current) return
      if (!aliveRef.current) return
      setWin((w) => (w.current.id === current.id ? { prev: prevDto, current: w.current, next: nextDto } : w))
      const keep = new Set([current.id, current.prevId, current.nextId].filter(Boolean) as string[])
      for (const key of Array.from(cacheRef.current.keys())) {
        if (!keep.has(key)) cacheRef.current.delete(key)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [current.id, current.prevId, current.nextId, fetchView])

  // The shallow swipe keeps this component mounted (no route reload), so global
  // detection state — the open edit panel and the pinned/hovered detection — would
  // otherwise persist across photos and keep targeting a detection that belongs to
  // the photo you swiped AWAY from. A full route push used to reset it; reset on id change.
  useEffect(() => {
    closeEditPanel()
    setPinnedDetectionId(null)
    setHoveredDetectionId(null)
  }, [current.id, closeEditPanel, setPinnedDetectionId, setHoveredDetectionId])

  const settle = useCallback(
    async (direction: 'prev' | 'next') => {
      const targetId = direction === 'next' ? current.nextId : current.prevId
      if (targetId === null) return
      const originId = current.id
      const navigation = ++navigationRef.current
      try {
        let dto = direction === 'next' ? win.next : win.prev
        if (dto?.id !== targetId || dto.expiresAt <= Date.now()) {
          dto = await fetchView(targetId, dto != null && dto.expiresAt <= Date.now())
        }
        if (!aliveRef.current || currentIdRef.current !== originId || navigation !== navigationRef.current) return
        setLoadError(null)
        setWin({ prev: null, current: dto, next: null })
        window.history.replaceState(window.history.state, '', `/photos/${dto.id}${qs}`)
      } catch {
        if (aliveRef.current && currentIdRef.current === originId) setLoadError({ id: originId, direction })
      }
    },
    [current.id, current.nextId, current.prevId, win.next, win.prev, fetchView, qs],
  )

  // Force-refresh the current photo's signed URLs if the image fails (expired
  // link) — but ONCE per photo id, so a genuinely-missing file can't spin an
  // infinite error→refetch→error loop.
  const refreshCurrent = useCallback(async () => {
    if (!aliveRef.current || refreshedRef.current.has(current.id)) return
    refreshedRef.current.add(current.id)
    try {
      const dto = await fetchView(current.id, true)
      if (!aliveRef.current) return
      setWin((w) => (w.current.id === current.id ? { ...w, current: dto } : w))
      setLoadError(null)
    } catch { if (aliveRef.current && currentIdRef.current === current.id) setLoadError({ id: current.id }) }
  }, [current.id, fetchView])

  const renderSlide = useCallback(
    (offset: -1 | 0 | 1) => {
      const dto = offset === -1 ? win.prev : offset === 1 ? win.next : win.current
      if (!dto) return <div className="aspect-video w-full rounded-lg bg-slate-deep" />
      const interactive = offset === 0
      const extra = interactive ? { onImageError: refreshCurrent } : {}
      return (
        <PhotoDetailClient
          key={dto.id}
          photo={dto}
          imageWidth={IMG_W}
          imageHeight={IMG_H}
          interactive={interactive}
          {...extra}
        />
      )
    },
    [win, refreshCurrent],
  )

  return (
    <div className="flex min-h-full flex-col gap-3">
      {loadError?.id === current.id && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded border border-destructive p-3 text-sm">
          <span>Could not load the photo update. Check your connection and retry.</span>
          <Button variant="outline" size="sm" onClick={() => {
            if (loadError.direction !== undefined) void settle(loadError.direction)
            else { refreshedRef.current.delete(current.id); void refreshCurrent() }
          }}>Retry</Button>
        </div>
      )}
      {/* Per-photo actions, driven by CURRENT so they track swipes */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Button variant="ghost" className="min-h-11 px-2" asChild>
          <Link aria-label="Back to filtered photos" href={returnUrl}><ArrowLeft className="h-4 w-4" /> Photos</Link>
        </Button>
        <h1 className="sr-only sm:not-sr-only sm:min-w-0 sm:flex-1 sm:truncate font-display text-xl text-parchment">Photo review</h1>
        <div className="flex items-center gap-2">
          {current.prevId !== null ? (
            <Button variant="outline" size="icon" className="min-h-11 min-w-11" asChild>
              <Link aria-label="Previous photo" href={`/photos/${current.prevId}${qs}`}><ChevronLeft className="h-4 w-4" /></Link>
            </Button>
          ) : (
            <Button aria-label="Previous photo" variant="outline" size="icon" className="min-h-11 min-w-11" disabled><ChevronLeft className="h-4 w-4" /></Button>
          )}
          {current.nextId !== null ? (
            <Button variant="outline" size="icon" className="min-h-11 min-w-11" asChild>
              <Link aria-label="Next photo" href={`/photos/${current.nextId}${qs}`}><ChevronRight className="h-4 w-4" /></Link>
            </Button>
          ) : (
            <Button aria-label="Next photo" variant="outline" size="icon" className="min-h-11 min-w-11" disabled><ChevronRight className="h-4 w-4" /></Button>
          )}
        </div>
        <Dialog key={current.id}>
          <DialogTrigger asChild><Button variant="outline" className="min-h-11 lg:hidden">Details</Button></DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Photo details</DialogTitle>
              <DialogDescription>Select a deer to see its score, antler measurements, and sighting details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4"><PhotoInfo photo={current} /></div>
          </DialogContent>
        </Dialog>
        <PhotoDeleteButton photoId={current.id} returnUrl={returnUrl} />
      </div>

      {/* Photo zone: pager (mobile) / static (desktop) */}
      <div className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
      <div className="md:hidden">
        <PhotoPager
          hasPrev={current.prevId != null}
          hasNext={current.nextId != null}
          renderSlide={renderSlide}
          onSettle={(direction) => { void settle(direction) }}
        />
      </div>
      <div className="hidden md:block">
        <PhotoDetailClient
          key={current.id}
          photo={current}
          imageWidth={IMG_W}
          imageHeight={IMG_H}
          interactive
          onImageError={() => { void refreshCurrent() }}
        />
      </div>

      </div>

      <aside aria-label="Photo detections and details" className="hidden min-w-0 space-y-4 lg:block lg:max-h-[calc(100dvh-180px)] lg:overflow-y-auto">
        <PhotoInfo photo={current} />
      </aside>
      </div>

      {/* Single global edit panel (driven by the detection-edit store) */}
      <DetectionEditPanel />
    </div>
  )
}
