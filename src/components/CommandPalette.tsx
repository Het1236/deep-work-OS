'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import {
  LayoutDashboard, Trophy, Brain, CheckCircle2, FolderKanban, Target, BookOpen,
  Calendar, ClipboardList, Timer, Wallet, Database, Sparkles, Users, Settings,
  Sun, Moon, Plus, Search, Activity,
} from 'lucide-react'

type Item = { label: string; href?: string; action?: () => void; icon: React.ElementType; keywords?: string }

export default function CommandPalette() {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items: Item[] = useMemo(() => [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Life Insights', href: '/life', icon: Activity, keywords: 'score correlations timeline' },
    { label: 'Scoreboard', href: '/scoreboard', icon: Trophy },
    { label: 'Evolution', href: '/evolution', icon: Brain },
    { label: 'Habits', href: '/habits', icon: CheckCircle2 },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
    { label: 'Goals', href: '/goals', icon: Target },
    { label: 'Journals', href: '/journal', icon: BookOpen },
    { label: 'Calendar', href: '/calendar', icon: Calendar },
    { label: 'Planner', href: '/planner', icon: ClipboardList },
    { label: 'Focus Timer', href: '/timer', icon: Timer, keywords: 'session pomodoro' },
    { label: 'Budget', href: '/budget', icon: Wallet, keywords: 'money expense finance' },
    { label: 'Second Brain', href: '/second-brain', icon: Database, keywords: 'notes' },
    { label: 'AI Reports', href: '/ai-report', icon: Sparkles },
    { label: 'Group', href: '/group', icon: Users },
    { label: 'Settings', href: '/settings', icon: Settings, keywords: 'telegram connect profile' },
    { label: 'New Focus Session', href: '/timer', icon: Plus, keywords: 'start deep work' },
    { label: theme === 'light' ? 'Switch to Dark theme' : 'Switch to Light theme', action: toggleTheme, icon: theme === 'light' ? Moon : Sun, keywords: 'theme appearance dark light claude' },
  ], [theme, toggleTheme])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(i => (i.label + ' ' + (i.keywords || '')).toLowerCase().includes(q))
  }, [query, items])

  const close = useCallback(() => { setOpen(false); setQuery(''); setActive(0) }, [])

  const run = useCallback((item: Item) => {
    close()
    if (item.action) item.action()
    else if (item.href) router.push(item.href)
  }, [router, close])

  // Global open: Cmd/Ctrl+K, or a window event from the topbar search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        close()
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('lifeos:command', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('lifeos:command', onOpen) }
  }, [close])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 20) }, [open])
  useEffect(() => { setActive(0) }, [query])

  if (!open) return null

  return (
    <div className="cmdk-overlay" onClick={close}>
      <div className="cmdk" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cmdk-input-row">
          <Search size={16} className="cmdk-search-icon" />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Jump to… or run a command"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
              else if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); run(filtered[active]) }
            }}
          />
          <kbd className="cmdk-kbd">ESC</kbd>
        </div>
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="cmdk-empty">No matches</div>}
          {filtered.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                className={`cmdk-item${i === active ? ' cmdk-item--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(item)}
              >
                <Icon size={16} className="cmdk-item-icon" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .cmdk-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(4px);
          display: flex; align-items: flex-start; justify-content: center;
          padding-top: 14vh;
          animation: cmdk-fade 0.15s ease;
        }
        .cmdk {
          width: 100%; max-width: 560px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          animation: cmdk-pop 0.18s ease;
        }
        .cmdk-input-row {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border-subtle);
        }
        :global(.cmdk-search-icon) { color: var(--text-tertiary); flex-shrink: 0; }
        .cmdk-input {
          flex: 1; background: transparent; border: none; outline: none;
          color: var(--text-primary); font-size: 0.9375rem; font-family: var(--font-sans);
        }
        .cmdk-input::placeholder { color: var(--text-tertiary); }
        .cmdk-kbd {
          font-size: 0.625rem; color: var(--text-tertiary);
          border: 1px solid var(--border-default); border-radius: 4px;
          padding: 2px 6px; font-family: var(--font-mono);
        }
        .cmdk-list { max-height: 52vh; overflow-y: auto; padding: 6px; }
        .cmdk-empty { padding: 24px; text-align: center; color: var(--text-tertiary); font-size: 0.875rem; }
        .cmdk-item {
          display: flex; align-items: center; gap: 12px; width: 100%;
          padding: 10px 12px; border: none; background: transparent;
          color: var(--text-secondary); font-size: 0.875rem; font-family: var(--font-sans);
          border-radius: var(--radius-sm); cursor: pointer; text-align: left;
        }
        .cmdk-item--active { background: var(--accent-muted); color: var(--accent); }
        :global(.cmdk-item-icon) { flex-shrink: 0; }
        @keyframes cmdk-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cmdk-pop { from { opacity: 0; transform: translateY(-8px) scale(0.98); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  )
}
