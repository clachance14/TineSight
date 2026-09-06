import type { PhotoViewDTO } from '@/lib/services/photo-view'

/** Visible pending work polls quickly for a minute, then backs off; settled scores refresh once a minute. */
export function photoRefreshDelay(photo: Pick<PhotoViewDTO, 'variantStatus' | 'detectionStatus'>, attempts: number): number {
  const pending = ['pending', 'processing'].includes(photo.variantStatus) || ['pending', 'processing'].includes(photo.detectionStatus)
  return pending ? (attempts < 12 ? 5_000 : 30_000) : 60_000
}

export interface ViewLoader {
  load(id: string, force?: boolean): Promise<PhotoViewDTO>
  abort(): void
}

export function createViewLoader(cache: Map<string, PhotoViewDTO>, query: string, request: typeof fetch = fetch): ViewLoader {
  const active = new Map<string, { controller: AbortController; promise: Promise<PhotoViewDTO> }>()
  return {
    load(id, force = false): Promise<PhotoViewDTO> {
      const existing = active.get(id)
      if (existing && !force) return existing.promise
      const cached = cache.get(id)
      if (cached && !force && cached.expiresAt > Date.now()) return Promise.resolve(cached)
      existing?.controller.abort()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15_000)
      const promise = (async (): Promise<PhotoViewDTO> => {
        try {
          const response = await request(`/api/photos/${id}/pager${query}`, { credentials: 'same-origin', signal: controller.signal })
          if (!response.ok) throw new Error('Could not load this photo. Please retry.')
          const dto = await response.json() as PhotoViewDTO
          controller.signal.throwIfAborted()
          if (dto.id !== id) throw new Error('The photo response did not match. Please retry.')
          cache.set(id, dto)
          return dto
        } finally {
          clearTimeout(timer)
          if (active.get(id)?.controller === controller) active.delete(id)
        }
      })()
      active.set(id, { controller, promise })
      return promise
    },
    abort(): void {
      for (const entry of active.values()) entry.controller.abort()
      active.clear()
    },
  }
}
