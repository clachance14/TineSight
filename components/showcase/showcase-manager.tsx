'use client'

import { type JSX, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, Link2, RotateCw, EyeOff, Eye, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Showcase {
  id: string
  token: string
  title: string
  is_active: boolean
  created_at: string
}

interface DeerLite {
  id: string
  name: string
  sighting_count: number
}

function publicUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/showcase/${token}`
}

export function ShowcaseManager(): JSX.Element {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const showcasesQuery = useQuery<{ showcases: Showcase[] }>({
    queryKey: ['showcases'],
    queryFn: async () => {
      const res = await fetch('/api/showcase')
      if (!res.ok) throw new Error('Failed to load showcases')
      return res.json() as Promise<{ showcases: Showcase[] }>
    },
  })

  const deerQuery = useQuery<{ deer: DeerLite[] }>({
    queryKey: ['deer-catalog', ''],
    queryFn: async () => {
      const res = await fetch('/api/deer')
      if (!res.ok) throw new Error('Failed to load deer')
      return res.json() as Promise<{ deer: DeerLite[] }>
    },
  })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['showcases'] })
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() !== '' ? title.trim() : undefined,
          deerIds: Array.from(selected),
        }),
      })
      if (!res.ok) throw new Error('Failed to create showcase')
      await res.json()
    },
    onSuccess: () => {
      toast.success('Showcase created')
      setTitle('')
      setSelected(new Set())
      invalidate()
    },
    onError: () => toast.error('Could not create showcase'),
  })

  const activeMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/showcase/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error('Failed')
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.isActive ? 'Showcase re-activated' : 'Showcase revoked')
      invalidate()
    },
    onError: () => toast.error('Update failed'),
  })

  const regenerateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/showcase/${id}/regenerate`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
    },
    onSuccess: () => {
      toast.success('New link generated; the old one no longer works')
      invalidate()
    },
    onError: () => toast.error('Could not regenerate link'),
  })

  const copyLink = (token: string): void => {
    void navigator.clipboard.writeText(publicUrl(token))
    toast.success('Public link copied')
  }

  const toggleDeer = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const deer = deerQuery.data?.deer ?? []
  const showcases = showcasesQuery.data?.showcases ?? []

  return (
    <div className="space-y-6">
      {/* Create */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-medium text-cream">New showcase</h2>
          <Input
            placeholder="Showcase title (e.g. North Lease Trophies)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div>
            <p className="mb-2 text-sm text-cream-dark">Select bucks to feature</p>
            {deer.length === 0 ? (
              <p className="text-sm text-cream-dark">No bucks in your catalog yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {deer.map((d) => {
                  const isOn = selected.has(d.id)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDeer(d.id)}
                      className={`min-h-[44px] rounded-full border px-4 py-2 text-sm transition-colors ${
                        isOn
                          ? 'border-copper bg-copper text-white'
                          : 'border-cream/20 bg-slate text-cream'
                      }`}
                    >
                      {d.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={selected.size === 0 || createMutation.isPending}
            className="min-h-[44px] gap-2"
          >
            <Plus className="h-4 w-4" />
            Create showcase
          </Button>
        </CardContent>
      </Card>

      {/* Existing */}
      <div className="space-y-3">
        <h2 className="font-medium text-cream">Your showcases</h2>
        {showcases.length === 0 ? (
          <p className="text-sm text-cream-dark">No showcases yet.</p>
        ) : (
          showcases.map((s) => (
            <Card key={s.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-cream">{s.title}</h3>
                  <Badge variant={s.is_active ? 'secondary' : 'outline'} className="text-xs">
                    {s.is_active ? 'Active' : 'Revoked'}
                  </Badge>
                </div>

                {s.is_active && (
                  <div className="flex items-center gap-2 rounded-md bg-slate p-2">
                    <Link2 className="h-4 w-4 shrink-0 text-cream-dark" />
                    <span className="truncate text-xs text-cream-dark">{publicUrl(s.token)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyLink(s.token)}
                      className="ml-auto min-h-[40px] gap-1"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => activeMutation.mutate({ id: s.id, isActive: !s.is_active })}
                    className="min-h-[40px] gap-1"
                  >
                    {s.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {s.is_active ? 'Revoke' : 'Re-activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => regenerateMutation.mutate(s.id)}
                    className="min-h-[40px] gap-1"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    New link
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
