'use client'

import { Bell, Search, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useUser } from '@/components/UserContext'

export default function Topbar() {
  const { userId } = useUser()
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
    <header className="topbar">
      <div className="topbar-brand">DeepWork OS</div>

      <div className="topbar-search">
        <Search size={14} className="topbar-search-icon" />
        <input type="text" placeholder="Search insights..." className="topbar-search-input" />
      </div>

      <div className="topbar-actions">
        <button className="topbar-icon-btn" title="Notifications"><Bell size={18} /></button>
        <button className="topbar-icon-btn" title="Settings"><Settings size={18} /></button>
        <button className="topbar-avatar" onClick={handleSignOut} title="Sign out">
          {user?.display_name?.charAt(0)?.toUpperCase() || 'U'}
        </button>
      </div>

      <style jsx>{`
        .topbar {
          height: var(--topbar-height);
          min-height: var(--topbar-height);
          background: rgba(14, 14, 14, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border-default);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-xl);
          z-index: 10;
        }

        .topbar-brand {
          font-size: 1rem;
          font-weight: 700;
          color: var(--accent);
          letter-spacing: -0.01em;
        }

        .topbar-search {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          padding: 7px var(--space-md);
          width: 260px;
        }

        :global(.topbar-search-icon) {
          color: var(--text-tertiary);
          flex-shrink: 0;
        }

        .topbar-search-input {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: 0.8125rem;
          font-family: var(--font-sans);
          width: 100%;
        }

        .topbar-search-input::placeholder {
          color: var(--text-tertiary);
        }

        .topbar-actions {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }

        .topbar-icon-btn {
          width: 34px;
          height: 34px;
          border-radius: var(--radius-sm);
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .topbar-icon-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-primary);
        }

        .topbar-avatar {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-full);
          background: var(--primary-gradient);
          color: #0e0e0e;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: var(--font-sans);
          margin-left: 4px;
        }

        .topbar-avatar:hover {
          filter: brightness(1.1);
          box-shadow: 0 0 16px rgba(76, 175, 125, 0.3);
        }
      `}</style>
    </header>
  )
}
