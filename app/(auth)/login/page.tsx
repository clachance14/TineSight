import { LoginForm } from '@/components/auth/login-form'

function ErrorMessage({ error }: { error: string | undefined }) {
  if (!error) return null

  return (
    <div className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
      {error === 'access_denied' && 'Access denied. Please try again.'}
      {error === 'server_error' && 'Server error. Please try again later.'}
      {error !== 'access_denied' && error !== 'server_error' && 'Authentication error. Please try again.'}
    </div>
  )
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">TineSight</h1>
          <p className="mt-2 text-muted-foreground">
            Track and identify trophy bucks with AI
          </p>
        </div>

        <ErrorMessage error={params.error} />

        <LoginForm />
      </div>
    </div>
  )
}
