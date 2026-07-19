import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/auth/AuthContext'
import { getErrorMessage } from '@/api/client'
import logo from '@/assets/logo.svg'
import secureMeetingHero from '@/assets/secure-meeting-hero.webp'
import { ArrowRight, CheckCircle2, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'

export function LoginPage() {
  const { login, isAuthenticated, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (searchParams.get('subscription') === 'expired') {
      toast.error('Your subscription has ended. Please contact Administration for reactivating.')
    }
    if (searchParams.get('session') === 'expired') {
      toast.error('Your session expired. Please sign in again.')
    }
    if (searchParams.get('session') === 'superseded') {
      toast.error('Logged in from another device or tab. Please sign in again.')
    }
  }, [searchParams])

  if (isAuthenticated) {
    return <Navigate to={isSuperAdmin ? '/admins' : '/dashboard'} replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const loggedIn = await login(identifier, password)
      if (loggedIn.role !== 'super_admin') {
        void queryClient.invalidateQueries({ queryKey: ['session', 'current'] })
      }
      toast.success('Welcome back')
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname
      const defaultPath = loggedIn.role === 'super_admin' ? '/admins' : '/dashboard'
      navigate(from ?? defaultPath, { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.code === 'SUBSCRIPTION_EXPIRED') {
        toast.error('Your subscription has ended. Please contact Administration for reactivating.')
      } else {
        toast.error(getErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-surface min-h-svh overflow-y-auto p-4 sm:p-6 lg:p-8">
      <main className="relative mx-auto grid min-h-[calc(100svh-2rem)] w-full max-w-[1240px] overflow-hidden rounded-[2rem] border border-white/75 bg-white/50 shadow-[0_30px_90px_-35px_rgba(39,78,140,0.35)] backdrop-blur-2xl sm:min-h-[calc(100svh-3rem)] lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.12fr_0.88fr]">
        <section className="relative flex min-h-[390px] flex-col overflow-hidden p-7 sm:p-10 lg:min-h-0 lg:p-12">
          <div className="absolute -left-24 top-24 h-64 w-64 rounded-full bg-chart-1/15 blur-3xl" />
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-violet-300/25 blur-3xl" />

          <div className="relative z-10 flex items-center gap-3">
            <img src={logo} alt="ZoomMeets" className="h-11 w-11 drop-shadow-sm" />
            <div>
              <p className="text-lg font-bold tracking-[-0.03em] text-foreground">ZoomMeets</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Admin workspace
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-10 max-w-xl lg:mt-16">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-chart-1/15 bg-white/65 px-3 py-1.5 text-xs font-semibold text-chart-1 shadow-sm backdrop-blur-md">
              <ShieldCheck className="h-3.5 w-3.5" />
              Trusted workspace access
            </div>
            <h1 className="max-w-lg text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-foreground sm:text-5xl">
              Secure meetings start with secure access.
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-muted-foreground sm:text-base">
              Manage users, live sessions, recordings, and workspace controls from one protected admin portal.
            </p>
          </div>

          <div className="relative z-10 mt-8 grid max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-3 lg:mt-auto">
            {[
              { icon: LockKeyhole, label: '256-bit', detail: 'Encrypted transport' },
              { icon: ShieldCheck, label: 'End-to-end', detail: 'Security safeguards' },
              { icon: CheckCircle2, label: 'Verified', detail: 'Admin-only access' },
            ].map(({ icon: Icon, label, detail }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/60 p-3 shadow-[0_10px_28px_-20px_rgba(30,64,175,0.45)] backdrop-blur-xl"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-chart-1/10 text-chart-1">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-xs font-bold text-foreground">{label}</span>
                  <span className="block text-[10px] leading-4 text-muted-foreground">{detail}</span>
                </span>
              </div>
            ))}
          </div>

          <img
            src={secureMeetingHero}
            alt="Secure video collaboration protected by encryption"
            className="relative z-[1] mt-8 aspect-[1.67] w-full rounded-[1.5rem] object-cover shadow-[0_28px_55px_-30px_rgba(36,73,132,0.45)] lg:absolute lg:bottom-[7.75rem] lg:right-[-8%] lg:mt-0 lg:w-[64%]"
          />
        </section>

        <section className="flex items-center justify-center border-t border-white/80 bg-white/62 p-6 backdrop-blur-2xl sm:p-10 lg:border-l lg:border-t-0 lg:p-12">
          <Card className="w-full max-w-[430px] border-white/80 bg-white/72 px-1 py-7 shadow-[0_24px_60px_-30px_rgba(30,64,175,0.3)] backdrop-blur-2xl sm:px-3 sm:py-9">
            <CardHeader className="gap-2">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-chart-1/10 text-chart-1 ring-1 ring-chart-1/10">
                <KeyRound className="h-5 w-5" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-[-0.035em]">Welcome back</CardTitle>
              <CardDescription className="leading-6">
                Sign in with your administrator credentials to continue.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-1">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="identifier">Email, phone, or name</Label>
                  <Input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Your login name, email, or phone"
                    required
                    autoComplete="username"
                    autoFocus
                    className="h-11 rounded-xl bg-white/70 px-3.5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="h-11 rounded-xl bg-white/70 px-3.5"
                  />
                </div>
                <Button type="submit" className="h-11 w-full rounded-xl shadow-[0_12px_24px_-12px_rgba(37,99,235,0.8)]" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in securely'}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </Button>
              </form>
              <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                <LockKeyhole className="h-3.5 w-3.5 text-success" />
                Your session is protected and monitored.
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
