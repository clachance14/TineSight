import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPhoto, getSignedViewUrl, getAdjacentPhotos, type PhotoFilters } from '@/lib/services/photos'
import { countReferenceROIs } from '@/lib/services/roi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PhotoDetailClient } from '@/components/photos/photo-detail-client'
import { DetectionCardWithFeedback } from '@/components/photos/detection-card-with-feedback'
import type { Detection } from '@/types/database'

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

  // Parse filters from URL params
  const filters: Omit<PhotoFilters, 'limit' | 'offset' | 'cursor'> = {}

  const getParam = (key: string): string | undefined => {
    const value = resolvedSearchParams[key]
    return typeof value === 'string' ? value : undefined
  }

  const statusParam = getParam('status')
  const hasDeerParam = getParam('hasDeer')
  const qualityStatusParam = getParam('qualityStatus')
  const minConfidenceParam = getParam('minConfidence')
  const sexParam = getParam('sex')
  const minPointsParam = getParam('minPoints')
  const maxPointsParam = getParam('maxPoints')
  const dateFromParam = getParam('dateFrom')
  const dateToParam = getParam('dateTo')
  const sizeClassParam = getParam('sizeClass')
  const cameraIdParam = getParam('cameraId')

  if (statusParam) filters.status = statusParam
  if (hasDeerParam) filters.hasDeer = hasDeerParam === 'true'
  if (qualityStatusParam) filters.qualityStatus = qualityStatusParam
  if (minConfidenceParam) filters.minConfidence = parseInt(minConfidenceParam, 10)
  if (sexParam) filters.sex = sexParam
  if (minPointsParam) filters.minPoints = parseInt(minPointsParam, 10)
  if (maxPointsParam) filters.maxPoints = parseInt(maxPointsParam, 10)
  if (dateFromParam) filters.dateFrom = dateFromParam
  if (dateToParam) filters.dateTo = dateToParam
  if (sizeClassParam) filters.sizeClass = sizeClassParam
  if (cameraIdParam) filters.cameraId = cameraIdParam

  // Build query string for navigation links
  const filterQueryString = new URLSearchParams(
    Object.entries(resolvedSearchParams)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, v as string])
  ).toString()

  // Fetch photo with detections, reference count, and adjacent photos in parallel
  const hasFilters = Object.keys(filters).length > 0
  const [photoResult, referenceCountResult, adjacentPhotos] = await Promise.all([
    getPhoto(user.id, id),
    countReferenceROIs(),
    getAdjacentPhotos(user.id, id, hasFilters ? filters : undefined),
  ])

  const { data: photo, error } = photoResult
  const { data: referenceCount } = referenceCountResult
  const { prevId, nextId } = adjacentPhotos

  if (error || !photo) {
    notFound()
  }

  // Get signed URL for the photo
  const { data: imageUrl } = await getSignedViewUrl(photo.file_path)

  if (!imageUrl) {
    notFound()
  }

  // Transform detections for PhotoDetailClient component
  // Include Gemini analysis data (species, sex, buck size class, age class) and quality info
  // Sort by confidence (highest first)
  const detections = photo.detections.map((d: Detection & {
    quality_status?: string | null;
    quality_score?: number | null;
    species?: string | null;
    sex?: string | null;
    size_class?: string | null;
    estimated_point_range?: string | null;
    age_class?: string | null;
    deer?: { id: string; name: string | null } | null;
  }) => ({
    id: d.id,
    bboxX: d.bbox_x ?? 0,
    bboxY: d.bbox_y ?? 0,
    bboxWidth: d.bbox_width ?? 0,
    bboxHeight: d.bbox_height ?? 0,
    confidence: d.confidence ?? 0,
    class: d.class,
    deerId: d.deer_id,
    deerName: d.deer?.name ?? null,
    qualityStatus: d.quality_status ?? null,
    qualityScore: d.quality_score ?? null,
    species: d.species ?? null,
    sex: d.sex ?? null,
    sizeClass: d.size_class ?? null,
    estimatedPointRange: d.estimated_point_range ?? null,
    ageClass: d.age_class ?? null,
  })).sort((a, b) => b.confidence - a.confidence)

  // Detection bounding boxes use 0-10000 normalized coordinates
  // This matches the MegaDetector output format
  const imageWidth = 10000
  const imageHeight = 10000

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
      {/* Header with back button and navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href={filterQueryString ? `/photos?${filterQueryString}` : '/photos'}>
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

        {/* Prev/Next navigation */}
        <div className="flex items-center gap-2">
          {prevId ? (
            <Button variant="outline" size="icon" asChild>
              <Link href={filterQueryString ? `/photos/${prevId}?${filterQueryString}` : `/photos/${prevId}`}>
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" disabled>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {nextId ? (
            <Button variant="outline" size="icon" asChild>
              <Link href={filterQueryString ? `/photos/${nextId}?${filterQueryString}` : `/photos/${nextId}`}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" disabled>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main photo view with ROI selection */}
        <div className="lg:col-span-2 space-y-4">
          <PhotoDetailClient
            imageUrl={imageUrl}
            detections={detections}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            showDetections={photo.detection_status === 'completed'}
            referenceCount={referenceCount}
          />

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
          {/* Detections list */}
          <Card>
            <CardHeader>
              <CardTitle>Detections ({detections.length})</CardTitle>
              <CardDescription>
                Animals detected in this photo - click to select for ROI
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
                    <DetectionCardWithFeedback
                      key={detection.id}
                      detection={detection}
                      index={index}
                    />
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
