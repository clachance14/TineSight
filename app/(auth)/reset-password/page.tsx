'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updatePassword } from '@/lib/services/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

export default function ResetPasswordPage(): React.JSX.Element {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  const onSubmit = async (data: ResetPasswordFormData): Promise<void> => {
    setError(null)
    setIsLoading(true)

    const { error: updateError } = await updatePassword(data.password)

    setIsLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    // Redirect to login with success message
    router.push('/login?message=password-updated')
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-12">
      <Link href="/" className="font-display text-3xl tracking-[0.14em] text-brass">TINESIGHT</Link>
      <Card className="w-full max-w-md border-forest-light bg-forest/20 py-4 shadow-none">
        <CardHeader>
          <h1 className="font-display text-3xl font-normal">Create new password</h1>
          <CardDescription className="pt-2 text-sm leading-7 text-weathered">
            Enter your new password below
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
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password" className="h-12 text-base md:text-base"
                placeholder="At least 8 characters"
                aria-invalid={!!errors.password}
                disabled={isLoading}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password" className="h-12 text-base md:text-base"
                placeholder="Re-enter your password"
                aria-invalid={!!errors.confirmPassword}
                disabled={isLoading}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" className="min-h-12 w-full" disabled={isLoading}>
              {isLoading ? 'Updating password...' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
