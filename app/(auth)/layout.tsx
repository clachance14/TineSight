export default function AuthLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="min-h-screen bg-background">{children}</div>
}
