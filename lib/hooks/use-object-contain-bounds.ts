"use client"

import { useState, useEffect, useCallback, RefObject } from "react"

export interface ObjectContainBounds {
  /** Pixels from container left edge to image left edge */
  offsetX: number
  /** Pixels from container top edge to image top edge */
  offsetY: number
  /** Actual rendered image width in pixels */
  width: number
  /** Actual rendered image height in pixels */
  height: number
  /** Whether bounds have been calculated */
  ready: boolean
}

interface UseObjectContainBoundsParams {
  /** Ref to the container element */
  containerRef: RefObject<HTMLDivElement | null>
  /** Natural (intrinsic) width of the image */
  naturalWidth: number
  /** Natural (intrinsic) height of the image */
  naturalHeight: number
}

/**
 * Hook to calculate the actual visible bounds of an image rendered with object-contain
 * within a container. Accounts for letterboxing/pillarboxing.
 */
export function useObjectContainBounds({
  containerRef,
  naturalWidth,
  naturalHeight,
}: UseObjectContainBoundsParams): ObjectContainBounds {
  const [bounds, setBounds] = useState<ObjectContainBounds>({
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    ready: false,
  })

  const calculateBounds = useCallback(() => {
    const container = containerRef.current
    if (!container || naturalWidth === 0 || naturalHeight === 0) {
      return
    }

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    if (containerWidth === 0 || containerHeight === 0) {
      return
    }

    const containerAspect = containerWidth / containerHeight
    const imageAspect = naturalWidth / naturalHeight

    let renderedWidth: number
    let renderedHeight: number
    let offsetX: number
    let offsetY: number

    if (imageAspect > containerAspect) {
      // Image is wider than container → letterboxing (bars top/bottom)
      renderedWidth = containerWidth
      renderedHeight = containerWidth / imageAspect
      offsetX = 0
      offsetY = (containerHeight - renderedHeight) / 2
    } else {
      // Image is taller than container → pillarboxing (bars left/right)
      renderedHeight = containerHeight
      renderedWidth = containerHeight * imageAspect
      offsetX = (containerWidth - renderedWidth) / 2
      offsetY = 0
    }

    setBounds({
      offsetX,
      offsetY,
      width: renderedWidth,
      height: renderedHeight,
      ready: true,
    })
  }, [containerRef, naturalWidth, naturalHeight])

  // Calculate on mount and when dependencies change
  useEffect(() => {
    calculateBounds()
  }, [calculateBounds])

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => {
      calculateBounds()
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [calculateBounds])

  return bounds
}
