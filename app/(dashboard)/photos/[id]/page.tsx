import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadPhotoView } from '@/lib/services/photo-view'
import { parseDetailFilters } from '@/lib/photos/detail-filters'
import { PhotoDetailViewer } from '@/components/photos/photo-detail-viewer'

interface PhotoDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params }: PhotoDetailPageProps): Promise<Metadata> {
  const { id } = await params
  return {
    title: `Photo ${id.slice(0, 8)} - TineSight`,
  }
}

export default async function PhotoDetailPage({ params, searchParams }: PhotoDetailPageProps): Promise<React.JSX.Element> {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const supabase = await createClient()

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(resolvedSearchParams)) {
    if (typeof v === 'string') sp.set(k, v)
    else if (Array.isArray(v)) for (const item of v) sp.append(k, item)
  }
  const filters = parseDetailFilters(sp)
  const filterQueryString = sp.toString()

  const dto = await loadPhotoView(user.id, id, filters)
  if (!dto) notFound()

  return (
    <PhotoDetailViewer
      initial={dto}
      navQueryString={filterQueryString}
      returnUrl={filterQueryString.length > 0 ? `/photos?${filterQueryString}` : '/photos'}
    />
  )
}
