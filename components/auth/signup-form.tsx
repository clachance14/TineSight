'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Eye, EyeOff, Loader2, Mail } from 'lucide-react'
import { signUp } from '@/lib/services/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

const signupSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters for your password'),
  full_name: z.string().trim().optional(),
})
type SignupFormValues = z.infer<typeof signupSchema>
const inputClass = 'h-12 md:h-12 border-forest-light bg-forest/40 px-4 text-base md:text-base text-parchment placeholder:text-weathered/70 focus-visible:border-brass focus-visible:ring-brass/30'

export function SignupForm(): React.JSX.Element {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null)
  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', full_name: '' },
  })

  async function onSubmit(values: SignupFormValues): Promise<void> {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: signupError } = await signUp(values.email, values.password, values.full_name)
      if (signupError !== null) {
        setError(signupError.message)
        return
      }
      if (data?.user === null || data === null) {
        setError('We could not create your account. Please try again.')
        return
      }
      if (data.session === null) {
        setConfirmationEmail(values.email)
        return
      }
      router.replace('/photos')
      router.refresh()
    } catch {
      setError('Unable to connect. Check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (confirmationEmail !== null) {
    return (
      <div role="status" className="space-y-5 rounded-lg border border-brass/30 bg-forest/30 p-6">
        <Mail className="size-6 text-brass-light" aria-hidden="true" />
        <h2 className="font-display text-2xl">Check your email.</h2>
        <p className="break-words text-sm leading-7 text-weathered">Open the confirmation link sent to <span className="text-parchment">{confirmationEmail}</span> to finish creating your account. Check your spam folder if it hasn&apos;t arrived.</p>
        <Link href="/login" className="inline-flex min-h-12 items-center gap-3 text-sm text-brass-light">Go to sign in <ArrowRight className="size-4" aria-hidden="true" /></Link>
      </div>
    )
  }

  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={(event) => { void form.handleSubmit(onSubmit)(event) }} noValidate className="space-y-5" aria-busy={isLoading}>
          <FormField control={form.control} name="full_name" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs text-parchment">Your name <span className="font-normal text-weathered">(optional)</span></FormLabel>
              <FormControl><Input className={inputClass} autoComplete="name" placeholder="Full name" disabled={isLoading} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs text-parchment">Email address</FormLabel>
              <FormControl><Input className={inputClass} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" disabled={isLoading} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="password" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs text-parchment">Create a password</FormLabel>
              <div className="relative">
                <FormControl><Input className={`${inputClass} pr-12`} type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" disabled={isLoading} {...field} /></FormControl>
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={isLoading} onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-weathered hover:text-parchment focus-visible:outline-2 focus-visible:outline-brass disabled:opacity-50">
                  {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </div>
              <FormMessage />
            </FormItem>
          )} />
          {error !== null && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <Button type="submit" disabled={isLoading} className="h-12 md:h-12 w-full border border-brass/70 bg-transparent text-brass-light hover:border-brass-light hover:bg-brass/10">
            {isLoading ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Creating your account…</> : <>Create account <ArrowRight className="size-4" aria-hidden="true" /></>}
          </Button>
        </form>
      </Form>
      <p className="mt-7 border-t border-forest-light pt-5 text-sm text-weathered">Already have an account?{' '}<Link href="/login" className="inline-flex min-h-11 items-center text-parchment underline decoration-brass/50 underline-offset-4 hover:text-brass-light">Sign in</Link></p>
    </div>
  )
}
