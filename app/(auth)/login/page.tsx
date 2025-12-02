import { LoginForm } from '@/components/auth/login-form'
import { Suspense } from 'react'

function LoginContent({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">TineSight</h1>
          <p className="mt-2 text-muted-foreground">
            Track and identify trophy bucks with AI
          </p>
        </div>

        {searchParams.error && (
          <div className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
            {searchParams.error === 'access_denied' && 'Access denied. Please try again.'}
            {searchParams.error === 'server_error' && 'Server error. Please try again later.'}
            {searchParams.error !== 'access_denied' && searchParams.error !== 'server_error' && 'Authentication error. Please try again.'}
          </div>
        )}

        <LoginForm />
      </div>
    </div>
  )
}

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  )
}
