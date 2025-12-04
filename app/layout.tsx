import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'TineSight - AI-Powered Deer Tracking',
  description: 'Build a catalog of trophy bucks using AI-powered re-identification for your hunting lease.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: 'bg-slate-deep border-cream/20 text-cream',
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
