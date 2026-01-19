'use client'

import React, { Suspense, useState, useEffect } from 'react'

// MINIMAL TEST VERSION - investigating iOS Safari crash
// If this minimal page crashes, the issue is in the page infrastructure
// If it works, we'll add components back one by one

function PhotosContent(): React.JSX.Element {
  const [count, setCount] = useState(0)

  // Simple effect to prove React is working
  useEffect(() => {
    const timer = setInterval(() => {
      setCount(c => c + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-cream mb-4">Photos Test Page</h1>
      <p className="text-cream-dark mb-2">If you can see this, the page infrastructure works.</p>
      <p className="text-cream-dark mb-4">Counter: {count}</p>
      <div className="grid grid-cols-5 gap-2">
        {/* Render 15 simple colored divs instead of images */}
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-slate rounded-lg flex items-center justify-center text-cream-dark"
          >
            {i + 1}
          </div>
        ))}
      </div>
      <p className="text-cream-dark mt-4 text-sm">
        No images, no virtualization, no data fetching.
      </p>
    </div>
  )
}

export default function PhotosPage() {
  return (
    <Suspense fallback={<div className="text-cream-dark p-4">Loading...</div>}>
      <PhotosContent />
    </Suspense>
  )
}
