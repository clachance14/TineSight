import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPhoto, getSignedViewUrl } from '@/lib/services/photos'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DetectionOverlay } from '@/components/photos/detection-overlay'
import type { Detection } from '@/types/database'

interface PhotoDetailPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PhotoDetailPageProps): Promise<Metadata> {
  const { id } = await params
  return {
    title: `Photo ${id.slice(0, 8)} - TineSight`,
  }
}

export default async function PhotoDetailPage({ params }: PhotoDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch photo with detections
  const { data: photo, error } = await getPhoto(user.id, id)

  if (error || !photo) {
    notFound()
  }

  // Get signed URL for the photo
  const { data: imageUrl } = await getSignedViewUrl(photo.file_path)

  if (!imageUrl) {
    notFound()
  }

  // Transform detections for DetectionOverlay component
  const detections = photo.detections.map((d: Detection) => ({
    id: d.id,
    bboxX: d.bbox_x ?? 0,
    bboxY: d.bbox_y ?? 0,
    bboxWidth: d.bbox_width ?? 0,
    bboxHeight: d.bbox_height ?? 0,
    confidence: d.confidence ?? 0,
    class: d.class,
    deerId: d.deer_id,
  }))

  // Calculate image dimensions (assuming standard camera trap dimensions)
  // In production, these would be stored in the database
  const imageWidth = 1920
  const imageHeight = 1080

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown'
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: { label: 'Pending', className: 'bg-slate text-cream-dark' },
      processing: { label: 'Processing', className: 'bg-blue-500/20 text-blue-300' },
      completed: { label: 'Completed', className: 'bg-green-500/20 text-green-300' },
      failed: { label: 'Failed', className: 'bg-red-500/20 text-red-300' },
    }
    const badge = badges[status as keyof typeof badges] || badges.pending
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
        {badge.label}
      </span>
    )
  }

  const getClassificationBadge = (classification: string | null) => {
    if (!classification) {
      return <span className="text-cream-dark text-sm">No classification</span>
    }

    const badges = {
      deer: { label: 'Deer', className: 'bg-copper/20 text-copper-light' },
      empty: { label: 'Empty', className: 'bg-slate text-cream-dark' },
      other: { label: 'Other Animal', className: 'bg-blue-500/20 text-blue-300' },
    }
    const badge = badges[classification as keyof typeof badges] || badges.other
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${badge.className}`}>
        {badge.label}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/photos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-cream">
            Photo Details
          </h1>
          <p className="mt-1 text-sm text-cream-dark">
            ID: {id}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main photo view */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-deep">
                <Image
                  src={imageUrl}
                  alt="Game camera photo"
                  fill
                  className="object-contain"
                  priority
                />
                <DetectionOverlay
                  detections={detections}
                  imageWidth={imageWidth}
                  imageHeight={imageHeight}
                  visible={photo.detection_status === 'completed'}
                />
              </div>
            </CardContent>
          </Card>

          {/* Photo metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Photo Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-cream-dark">Captured</p>
                  <p className="text-cream">{formatDate(photo.captured_at)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-cream-dark">Imported</p>
                  <p className="text-cream">{formatDate(photo.imported_at)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-cream-dark">Detection Status</p>
                  <div className="mt-1">{getStatusBadge(photo.detection_status)}</div>
                </div>
                <div>
                  <p className="text-sm font-medium text-cream-dark">Classification</p>
                  <div className="mt-1">{getClassificationBadge(photo.classification)}</div>
                </div>
                {photo.confidence !== null && (
                  <div>
                    <p className="text-sm font-medium text-cream-dark">Confidence</p>
                    <p className="text-cream">{Math.round(photo.confidence * 100)}%</p>
                  </div>
                )}
                {photo.file_size_bytes !== null && (
                  <div>
                    <p className="text-sm font-medium text-cream-dark">File Size</p>
                    <p className="text-cream">
                      {(photo.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detections panel */}
        <div className="space-y-4">
          {/* Manual correction buttons */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Correction</CardTitle>
              <CardDescription>
                Override AI classification if incorrect
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start" disabled>
                <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                Mark as Deer
              </Button>
              <Button variant="outline" className="w-full justify-start" disabled>
                <XCircle className="mr-2 h-4 w-4 text-red-500" />
                Mark as Empty
              </Button>
              <p className="text-xs text-cream-dark mt-2">
                Manual correction coming in a future update
              </p>
            </CardContent>
          </Card>

          {/* Detections list */}
          <Card>
            <CardHeader>
              <CardTitle>Detections ({detections.length})</CardTitle>
              <CardDescription>
                Animals detected in this photo
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detections.length === 0 ? (
                <p className="text-sm text-cream-dark text-center py-4">
                  No detections found
                </p>
              ) : (
                <div className="space-y-3">
                  {detections.map((detection, index) => (
                    <div
                      key={detection.id}
                      className="rounded-lg border border-slate-700 bg-slate-deep p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-cream">
                          Detection {index + 1}
                        </span>
                        <span className="text-xs text-cream-dark">
                          {Math.round(detection.confidence * 100)}% confidence
                        </span>
                      </div>

                      {detection.class && (
                        <div>
                          <p className="text-xs text-cream-dark">Class</p>
                          <p className="text-sm text-cream capitalize">{detection.class}</p>
                        </div>
                      )}

                      <div className="text-xs text-cream-dark">
                        Bounding Box: {Math.round(detection.bboxX)}, {Math.round(detection.bboxY)}, {Math.round(detection.bboxWidth)}x{Math.round(detection.bboxHeight)}
                      </div>

                      {detection.deerId && (
                        <div className="pt-2 border-t border-slate-700">
                          <Link
                            href={`/deer/${detection.deerId}`}
                            className="text-sm text-copper hover:text-copper-light transition-colors"
                          >
                            View Deer Profile
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
