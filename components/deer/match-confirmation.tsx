'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CheckCircle2, XCircle, PlusCircle } from 'lucide-react'

interface MatchConfirmationProps {
  detectionId: string
  candidateId: string
  candidateDeer: {
    id: string
    name: string | null
    first_seen: string | null
    last_seen: string | null
    representative_image_url: string | null
  }
  similarityScore: number
  detectionImageUrl: string
  onConfirm: (deerId: string) => void
  onReject: (deerId: string) => void
  onCreateNew: () => void
  isLoading?: boolean
}

export function MatchConfirmation({
  detectionId: _detectionId,
  candidateId,
  candidateDeer,
  similarityScore,
  detectionImageUrl,
  onConfirm,
  onReject,
  onCreateNew,
  isLoading = false,
}: MatchConfirmationProps) {
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (isLoading) return

      // Only trigger if not typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      if (event.key === 'y' || event.key === 'Y') {
        event.preventDefault()
        onConfirm(candidateId)
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        onReject(candidateId)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [candidateId, isLoading, onConfirm, onReject])

  // Format dates
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Determine similarity score color and label
  const getSimilarityInfo = (score: number) => {
    if (score >= 0.9) {
      return { color: 'text-green-400', label: 'Very High' }
    } else if (score >= 0.8) {
      return { color: 'text-copper', label: 'High' }
    } else if (score >= 0.7) {
      return { color: 'text-yellow-400', label: 'Medium' }
    } else {
      return { color: 'text-red-400', label: 'Low' }
    }
  }

  const similarityInfo = getSimilarityInfo(similarityScore)

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header with similarity score */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-cream">
          Potential Match Found
        </h2>
        <div className="flex items-center justify-center gap-3">
          <span className="text-cream-dark">Similarity Score:</span>
          <span className={`text-3xl font-bold ${similarityInfo.color}`}>
            {(similarityScore * 100).toFixed(1)}%
          </span>
          <span className={`text-sm font-medium ${similarityInfo.color}`}>
            ({similarityInfo.label})
          </span>
        </div>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* New Detection */}
        <Card className="bg-slate border-copper/20 overflow-hidden">
          <div className="p-4 border-b border-copper/20">
            <h3 className="text-lg font-semibold text-cream">New Detection</h3>
            <p className="text-sm text-cream-dark">Just uploaded</p>
          </div>
          <div className="relative aspect-square bg-slate-deep">
            {detectionImageUrl ? (
              <Image
                src={detectionImageUrl}
                alt="New detection"
                fill
                className="object-contain"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-cream-dark">
                No image available
              </div>
            )}
          </div>
        </Card>

        {/* Candidate Deer */}
        <Card className="bg-slate border-copper/20 overflow-hidden">
          <div className="p-4 border-b border-copper/20">
            <h3 className="text-lg font-semibold text-cream">
              {candidateDeer.name || 'Unnamed Deer'}
            </h3>
            <div className="space-y-1 text-sm text-cream-dark">
              <p>First seen: {formatDate(candidateDeer.first_seen)}</p>
              <p>Last seen: {formatDate(candidateDeer.last_seen)}</p>
            </div>
          </div>
          <div className="relative aspect-square bg-slate-deep">
            {candidateDeer.representative_image_url ? (
              <Image
                src={candidateDeer.representative_image_url}
                alt={candidateDeer.name || 'Candidate deer'}
                fill
                className="object-contain"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-cream-dark">
                No image available
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Button
          onClick={() => onConfirm(candidateId)}
          disabled={isLoading}
          size="lg"
          className="w-full sm:w-auto bg-copper hover:bg-copper-light text-slate-deep font-semibold"
        >
          <CheckCircle2 className="mr-2 h-5 w-5" />
          Confirm Match
          <span className="ml-2 text-xs opacity-75">(Y)</span>
        </Button>

        <Button
          onClick={() => onReject(candidateId)}
          disabled={isLoading}
          size="lg"
          variant="outline"
          className="w-full sm:w-auto border-cream-dark text-cream hover:bg-slate-deep"
        >
          <XCircle className="mr-2 h-5 w-5" />
          Not a Match
          <span className="ml-2 text-xs opacity-75">(N)</span>
        </Button>

        <Button
          onClick={onCreateNew}
          disabled={isLoading}
          size="lg"
          variant="outline"
          className="w-full sm:w-auto border-copper text-copper hover:bg-copper/10"
        >
          <PlusCircle className="mr-2 h-5 w-5" />
          Create New Deer
        </Button>
      </div>

      {/* Keyboard shortcuts hint */}
      <p className="text-center text-sm text-cream-dark">
        Tip: Use keyboard shortcuts <kbd className="px-2 py-1 bg-slate-deep rounded text-copper">Y</kbd> to confirm or{' '}
        <kbd className="px-2 py-1 bg-slate-deep rounded text-copper">N</kbd> to reject
      </p>
    </div>
  )
}
