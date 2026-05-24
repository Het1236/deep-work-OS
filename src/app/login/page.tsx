'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Zap, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) setError(error.message)
  }

  return (
    <div className="auth-page">
      <div className="auth-container animate-fade-in">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Zap size={24} />
          </div>
          <h1 className="auth-logo-title">Deep Work OS</h1>
          <p className="auth-logo-subtitle">The Architecture of Silence</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="auth-form">
          <h2 className="auth-heading">Welcome back</h2>
          <p className="auth-desc">Sign in to continue your deep work journey</p>

          {error && <div className="auth-error">{error}</div>}

          <div className="auth-field">
            <label className="auth-label">Email</label>
            <div className="auth-input-wrap">
              <Mail size={16} className="auth-input-icon" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input auth-input"
                required
              />
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-input-wrap">
              <Lock size={16} className="auth-input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="input auth-input"
                required
              />
              <button
                type="button"
                className="auth-toggle-pw"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
            <ArrowRight size={16} />
          </button>

          <div className="auth-divider">
            <span>or continue with</span>
          </div>

          <button type="button" className="btn btn-secondary btn-lg auth-google" onClick={handleGoogleLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>

          <p className="auth-footer">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="auth-link">Sign up</Link>
          </p>
        </form>
      </div>

      <style jsx>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-base);
          padding: var(--space-xl);
        }

        .auth-container {
          width: 100%;
          max-width: 400px;
        }

        .auth-logo {
          text-align: center;
          margin-bottom: var(--space-3xl);
        }

        .auth-logo-icon {
          width: 56px;
          height: 56px;
          border-radius: var(--radius-md);
          background: var(--accent);
          color: #0F0F0F;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: var(--space-lg);
        }

        .auth-logo-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .auth-logo-subtitle {
          font-size: 0.8125rem;
          color: var(--text-tertiary);
          margin-top: var(--space-xs);
        }

        .auth-form {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-2xl);
        }

        .auth-heading {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: var(--space-xs);
        }

        .auth-desc {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: var(--space-xl);
        }

        .auth-error {
          background: rgba(232, 93, 93, 0.1);
          border: 1px solid rgba(232, 93, 93, 0.2);
          border-radius: var(--radius-sm);
          padding: var(--space-sm) var(--space-md);
          color: var(--status-danger);
          font-size: 0.8125rem;
          margin-bottom: var(--space-lg);
        }

        .auth-field {
          margin-bottom: var(--space-lg);
        }

        .auth-label {
          display: block;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: var(--space-xs);
        }

        .auth-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .auth-input-icon {
          position: absolute;
          left: 12px;
          color: var(--text-tertiary);
          pointer-events: none;
        }

        .auth-input {
          padding-left: 36px !important;
          height: 42px;
        }

        .auth-toggle-pw {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          padding: 4px;
        }

        .auth-toggle-pw:hover {
          color: var(--text-secondary);
        }

        .auth-submit {
          width: 100%;
          margin-top: var(--space-sm);
          height: 44px;
        }

        .auth-divider {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          margin: var(--space-xl) 0;
          color: var(--text-tertiary);
          font-size: 0.75rem;
        }

        .auth-divider::before,
        .auth-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border-subtle);
        }

        .auth-google {
          width: 100%;
          height: 44px;
        }

        .auth-footer {
          text-align: center;
          margin-top: var(--space-xl);
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .auth-link {
          color: var(--accent);
          text-decoration: none;
          font-weight: 500;
        }

        .auth-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}
