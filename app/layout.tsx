import type { Metadata, Viewport } from 'next'
import { DM_Sans, Fraunces, JetBrains_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import { Providers } from '@/components/providers'
import { InstallHint } from '@/components/pwa/install-hint'
import './globals.css'

const dmSans = DM_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'TineSight - AI-Powered Deer Tracking',
  description:
    'Build a catalog of trophy bucks using AI-powered re-identification for your hunting lease.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TineSight',
  },
  // Next 16 emits only the modern `mobile-web-app-capable`; iOS Safari still
  // needs the apple-prefixed tag to launch in standalone mode.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#1C2321',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${dmSans.variable} ${fraunces.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: 'bg-forest border-brass/20 text-parchment',
            }}
          />
          <InstallHint />
        </Providers>
      </body>
    </html>
  )
}
