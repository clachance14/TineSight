import { SignupForm } from '@/components/auth/signup-form'

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">TineSight</h1>
          <p className="mt-2 text-muted-foreground">
            Track and identify trophy bucks with AI
          </p>
        </div>

        <SignupForm />
      </div>
    </div>
  )
}
