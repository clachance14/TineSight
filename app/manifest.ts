import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TineSight',
    short_name: 'TineSight',
    description:
      'Build a catalog of trophy bucks using AI-powered re-identification for your hunting lease.',
    start_url: '/',
    scope: '/',
    id: '/',
    display: 'standalone',
    background_color: '#1C2321',
    theme_color: '#1C2321',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
