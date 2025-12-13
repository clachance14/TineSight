'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DeerCatalog } from '@/components/deer/deer-catalog'
import { CreateDeerModal } from '@/components/deer/create-deer-modal'

interface DeerProfile {
  id: string
  name: string
  notes: string | null
  sighting_count: number
}

export function DeerCatalogClient() {
  const router = useRouter()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null)

  const handleDeerClick = (deer: DeerProfile) => {
    // Navigate to deer detail page (or open modal)
    router.push(`/deer/${deer.id}`)
  }

  const handleCreateClick = () => {
    // This would normally be triggered from a detection view
    // For now, show a message or redirect to photos
    router.push('/photos')
  }

  return (
    <>
      <DeerCatalog
        onDeerClick={handleDeerClick}
        onCreateClick={handleCreateClick}
      />

      {selectedDetectionId && (
        <CreateDeerModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          detectionId={selectedDetectionId}
          onSuccess={(deer) => {
            setSelectedDetectionId(null)
            router.push(`/deer/${deer.id}`)
          }}
        />
      )}
    </>
  )
}
