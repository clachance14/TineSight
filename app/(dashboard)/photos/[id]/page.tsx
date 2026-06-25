import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { loadPhotoView } from '@/lib/services/photo-view'
import { parseDetailFilters } from '@/lib/photos/detail-filters'
import { Button } from '@/components/ui/button'
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

export default async function PhotoDetailPage({ params, searchParams }: PhotoDetailPageProps) {
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
    <div className="flex h-full flex-col space-y-4 overflow-y-auto md:space-y-6">
      <div className="flex items-center gap-2 md:gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href={filterQueryString ? `/photos?${filterQueryString}` : '/photos'}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-cream md:text-3xl">Photo Details</h1>
          <p className="mt-1 hidden text-sm text-cream-dark md:block">ID: {id}</p>
        </div>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PhotoDetailViewer
            initial={dto}
            navQueryString={filterQueryString}
            returnUrl={filterQueryString ? `/photos?${filterQueryString}` : '/photos'}
          />
        </div>
      </div>
    </div>
  )
}
