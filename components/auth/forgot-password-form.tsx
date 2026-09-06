'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { resetPassword } from '@/lib/services/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordForm(): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordFormData): Promise<void> => {
    setError(null)
    setSuccess(false)
    setIsLoading(true)

    const { error: resetError } = await resetPassword(data.email)

    setIsLoading(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <Card className="w-full max-w-md border-forest-light bg-forest/20 py-4 shadow-none">
        <CardHeader>
          <h1 className="font-display text-3xl font-normal">Check your email</h1>
          <CardDescription className="pt-2 text-sm leading-7 text-weathered">
            We&apos;ve sent you a password reset link. Click the link in the email to create a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              If you don&apos;t see the email, check your spam folder.
            </p>
            <Button asChild variant="outline" className="min-h-12 w-full">
              <Link href="/login">Back to login</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md border-forest-light bg-forest/20 py-4 shadow-none">
      <CardHeader>
        <h1 className="font-display text-3xl font-normal">Reset your password</h1>
        <CardDescription className="pt-2 text-sm leading-7 text-weathered">
          Enter your email and we&apos;ll send you a reset link
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => { void handleSubmit(onSubmit)(event) }} className="space-y-6">
          {error !== null && (
            <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email" inputMode="email" className="h-12 text-base md:text-base"
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              disabled={isLoading}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <Button type="submit" className="min-h-12 w-full" disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send reset link'}
          </Button>

          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center text-sm text-weathered hover:text-parchment"
            >
              Back to login
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
