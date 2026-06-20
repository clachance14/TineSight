import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getDeerById } from '@/lib/services/deer'
import { redirect, notFound } from 'next/navigation'
import { DeerDetailClient } from './deer-detail-client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface DeerDetailPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: DeerDetailPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { title: 'Deer Profile - TineSight' }
  }

  const { data: deer } = await getDeerById(user.id, id)

  return {
    title: deer ? `${deer.name} - TineSight` : 'Deer Profile - TineSight',
  }
}

export default async function DeerDetailPage({ params }: DeerDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch deer basic info for SSR
  const { data: deer, error } = await getDeerById(user.id, id)

  if (error || !deer) {
    notFound()
  }

  // Get reference detection image URL, bbox, and fingerprint if available
  let referenceImageUrl: string | null = null
  let referenceBbox: { x: number | null; y: number | null; width: number | null; height: number | null } | null = null
  let antlerFingerprint: unknown = null
  if (deer.reference_detection_id) {
    // Fetch reference detection with image info, bbox, and fingerprint
    const { data: refDetection } = await supabase
      .from('detections')
      .select('image_id, bbox_x, bbox_y, bbox_width, bbox_height, antler_fingerprint, images!inner(file_path, medium_path)')
      .eq('id', deer.reference_detection_id)
      .single()

    if (refDetection) {
      const imageData = refDetection as unknown as {
        images: { file_path: string; medium_path: string | null }
        bbox_x: number | null
        bbox_y: number | null
        bbox_width: number | null
        bbox_height: number | null
        antler_fingerprint: unknown
      }
      // Medium variant for the bbox-zoomed reference, never the full-res original.
      const { data: urlData } = await supabase
        .storage
        .from('photos')
        .createSignedUrl(imageData.images.medium_path ?? imageData.images.file_path, 3600)

      referenceImageUrl = urlData?.signedUrl ?? null
      referenceBbox = {
        x: imageData.bbox_x,
        y: imageData.bbox_y,
        width: imageData.bbox_width,
        height: imageData.bbox_height,
      }
      antlerFingerprint = imageData.antler_fingerprint
    }
  }

  const initialDeer = {
    ...deer,
    reference_image_url: referenceImageUrl,
    reference_bbox: referenceBbox,
    antler_fingerprint: antlerFingerprint,
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/deer">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-cream">
            {deer.name}
          </h1>
          <p className="mt-1 text-sm text-cream-dark">
            Deer profile and sighting history
          </p>
        </div>
      </div>

      {/* Client component with interactivity */}
      <DeerDetailClient deerId={id} initialDeer={initialDeer} />
    </div>
  )
}
