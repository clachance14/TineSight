'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { loginSuccessMessage, loginErrorMessage } from '@/lib/auth/navigation'
import { signIn } from '@/lib/services/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import Link from 'next/link'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginForm(): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()
  const successMessage = loginSuccessMessage(searchParams.get('message'))
  const callbackError = loginErrorMessage(searchParams.get('error'))
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: LoginFormData): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await signIn(data.email, data.password)
      if (error) {
        setError(error.message)
        return
      }
      router.push('/photos')
      router.refresh()
    } catch {
      setError('Unable to sign in. Check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={(event) => { void form.handleSubmit(onSubmit)(event) }} className="space-y-6" aria-busy={isLoading}>
          {callbackError !== null && <p role="alert" className="text-sm text-destructive">{callbackError}</p>}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-parchment">Email address</FormLabel>
                <FormControl>
                  <Input
                    className="h-12 md:h-12 text-base md:text-base border-forest-light bg-forest/40 px-4 text-parchment placeholder:text-weathered/70 focus-visible:border-brass focus-visible:ring-brass/30"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-4">
                  <FormLabel className="text-xs font-medium text-parchment">Password</FormLabel>
                  <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-xs text-weathered underline-offset-4 hover:text-brass-light hover:underline">Forgot password?</Link>
                </div>
                <div className="relative">
                  <FormControl>
                    <Input
                      className="h-12 md:h-12 text-base md:text-base border-forest-light bg-forest/40 pl-4 pr-12 text-parchment placeholder:text-weathered/70 focus-visible:border-brass focus-visible:ring-brass/30"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={isLoading} onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-weathered hover:text-parchment focus-visible:outline-2 focus-visible:outline-brass disabled:opacity-50">
                    {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {successMessage !== null && (
            <div role="status" className="rounded-md bg-green-500/10 border border-green-500/30 p-3 text-sm text-green-600 dark:text-green-400">
              {successMessage}
            </div>
          )}

          {error !== null && (
            <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="h-12 md:h-12 w-full border border-brass/70 bg-transparent text-brass-light hover:border-brass-light hover:bg-brass/10" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>Sign in <ArrowRight className="ml-2 size-4" aria-hidden="true" /></>
            )}
          </Button>
        </form>
      </Form>
      <div className="mt-8 border-t border-forest-light pt-6 text-sm text-weathered">
        New to TineSight?{' '}
        <Link href="/signup" className="inline-flex min-h-11 items-center text-parchment underline decoration-brass/50 underline-offset-4 hover:text-brass-light">Create an account</Link>
      </div>
    </div>
  )
}
