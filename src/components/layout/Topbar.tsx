'use client'

import { Search, Settings, Sun, Moon, Menu, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useUser } from '@/components/UserContext'
import { useTheme } from '@/components/ThemeProvider'

function openPalette() {
  window.dispatchEvent(new Event('lifeos:command'))
}
function toggleNav() {
  document.documentElement.classList.toggle('nav-open')
}
function openCapture() {
  window.dispatchEvent(new Event('lifeos:capture'))
}
function closeNav() {
  document.documentElement.classList.remove('nav-open')
}

export default function Topbar() {
  const { userId } = useUser()
  const { theme, toggleTheme } = useTheme()
  const [user, setUser] = useState<{ email?: string; display_name?: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser({
          email: authUser.email,
          display_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
        })
      }
    }
    load()
  }, [userId, supabase.auth])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <header className="topbar">
        <button className="topbar-burger" onClick={toggleNav} title="Menu" aria-label="Menu"><Menu size={18} /></button>
        <div className="topbar-brand">Life OS</div>

        <button className="topbar-search" onClick={openPalette} title="Search & commands (Ctrl/⌘ K)">
          <Search size={14} className="topbar-search-icon" />
          <span className="topbar-search-text">Search or jump to…</span>
          <kbd className="topbar-kbd">⌘K</kbd>
        </button>

        <div className="topbar-actions">
          <button className="topbar-icon-btn topbar-capture" title="Quick capture (Ctrl/⌘ J)" onClick={openCapture}><Sparkles size={18} /></button>
          <button className="topbar-icon-btn" title="Toggle theme" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <Link className="topbar-icon-btn" href="/settings" title="Settings"><Settings size={18} /></Link>
          <button className="topbar-avatar" onClick={handleSignOut} title="Sign out">
            {user?.display_name?.charAt(0)?.toUpperCase() || 'U'}
          </button>
        </div>
      </header>

      {/* Mobile drawer scrim */}
      <div className="nav-scrim" onClick={closeNav} aria-hidden="true" />

      <style jsx>{`
        .topbar {
          height: var(--topbar-height);
          min-height: var(--topbar-height);
          background: var(--nav-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--nav-border);
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: 0 var(--space-xl);
          z-index: 10;
        }
        .topbar-burger {
          display: none;
          background: transparent; border: none; color: var(--text-secondary);
          cursor: pointer; padding: 4px;
        }
        .topbar-brand {
          font-family: var(--font-display);
          font-size: 1rem;
          font-weight: 600;
          color: var(--accent);
          letter-spacing: -0.01em;
        }
        .topbar-search {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          padding: 7px var(--space-md);
          width: 280px;
          margin-left: var(--space-md);
          cursor: pointer;
          transition: border-color var(--transition-fast);
          font-family: var(--font-sans);
        }
        .topbar-search:hover { border-color: var(--border-hover); }
        :global(.topbar-search-icon) { color: var(--text-tertiary); flex-shrink: 0; }
        .topbar-search-text { flex: 1; text-align: left; color: var(--text-tertiary); font-size: 0.8125rem; }
        .topbar-kbd {
          font-size: 0.625rem; color: var(--text-tertiary);
          border: 1px solid var(--border-default); border-radius: 4px;
          padding: 1px 5px; font-family: var(--font-mono);
        }
        .topbar-actions {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-left: auto;
        }
        .topbar-icon-btn {
          width: 34px; height: 34px;
          border-radius: var(--radius-sm);
          background: transparent; border: none;
          color: var(--text-tertiary);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s ease;
        }
        .topbar-icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .topbar-capture { color: var(--accent); }
        .topbar-capture:hover { color: var(--accent); background: var(--accent-muted); }
        .topbar-avatar {
          width: 32px; height: 32px;
          border-radius: var(--radius-full);
          background: var(--primary-gradient);
          color: var(--on-accent);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 700;
          border: none; cursor: pointer; transition: all 0.2s ease;
          font-family: var(--font-sans); margin-left: 4px;
        }
        .topbar-avatar:hover { filter: brightness(1.05); box-shadow: var(--shadow-glow); }

        .nav-scrim { display: none; }

        @media (max-width: 860px) {
          .topbar-burger { display: flex; }
          .topbar-search { width: auto; }
          .topbar-search-text, .topbar-kbd { display: none; }
          .topbar-brand { display: none; }
          :global(:root.nav-open) .nav-scrim {
            display: block; position: fixed; inset: 0;
            background: rgba(0, 0, 0, 0.5); z-index: 55;
          }
        }
      `}</style>
    </>
  )
}
