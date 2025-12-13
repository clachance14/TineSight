"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import Image from "next/image"
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"

interface PhotoLightboxProps {
  imageUrl: string
  isOpen: boolean
  onClose: () => void
}

export function PhotoLightbox({ imageUrl, isOpen, onClose }: PhotoLightboxProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset zoom when opening, prevent body scroll, and scroll to top on close
  useEffect(() => {
    if (isOpen) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
      // Prevent body scroll while lightbox is open
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }

    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // Scroll to top when closing
  const handleClose = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "instant" })
    onClose()
  }, [onClose])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, handleClose])

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(s + 0.5, 5))
  }, [])

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(s - 0.5, 0.5))
  }, [])

  const handleReset = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.2 : 0.2
    setScale((s) => Math.max(0.5, Math.min(s + delta, 5)))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }, [scale, position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={handleClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); handleZoomOut() }}
          className="p-2 bg-slate-deep/90 hover:bg-slate-deep text-cream rounded-md border border-cream/20 transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <span className="px-3 py-2 bg-slate-deep/90 text-cream rounded-md border border-cream/20 text-sm font-medium min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); handleZoomIn() }}
          className="p-2 bg-slate-deep/90 hover:bg-slate-deep text-cream rounded-md border border-cream/20 transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleReset() }}
          className="p-2 bg-slate-deep/90 hover:bg-slate-deep text-cream rounded-md border border-cream/20 transition-colors"
          title="Reset zoom"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          onClick={handleClose}
          className="p-2 bg-copper hover:bg-copper-light text-white rounded-md transition-colors"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Zoom hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-cream/60 text-sm">
        Scroll to zoom • Drag to pan • Click outside or press Esc to close
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? "none" : "transform 0.1s ease-out",
          }}
        >
          <Image
            src={imageUrl}
            alt="Photo detail"
            width={1920}
            height={1080}
            className="max-h-[90vh] w-auto object-contain select-none"
            draggable={false}
            priority
          />
        </div>
      </div>
    </div>
  )
}
