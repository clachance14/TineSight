import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export default function ForgotPasswordPage(): React.JSX.Element {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-12">
    <Link href="/" className="font-display text-3xl tracking-[0.14em] text-brass">TINESIGHT</Link>
    <ForgotPasswordForm />
  </div>
}
