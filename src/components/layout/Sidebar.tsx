'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Trophy, Brain, CheckCircle2,
  FolderKanban, Target, BookOpen, Calendar,
  Sparkles, Users, Zap, Timer, Database, Plus, ClipboardList, Wallet, Settings
} from 'lucide-react'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: Trophy, label: 'Scoreboard', href: '/scoreboard' },
  { icon: Brain, label: 'Evolution', href: '/evolution' },
  { icon: CheckCircle2, label: 'Habits', href: '/habits' },
  { icon: FolderKanban, label: 'Projects', href: '/projects' },
  { icon: Target, label: 'Goals', href: '/goals' },
  { icon: BookOpen, label: 'Journals', href: '/journal' },
  { icon: Calendar, label: 'Calendar', href: '/calendar' },
  { icon: ClipboardList, label: 'Planner', href: '/planner' },
  { icon: Timer, label: 'Focus Timer', href: '/timer' },
  { icon: Wallet, label: 'Budget', href: '/budget' },
  { icon: Database, label: 'Second Brain', href: '/second-brain' },
  { icon: Sparkles, label: 'AI Reports', href: '/ai-report' },
  { icon: Users, label: 'Group', href: '/group' },
  { icon: Settings, label: 'Settings', href: '/settings' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="sb">
      {/* Branding */}
      <div className="sb-logo">
        <div className="sb-logo-icon"><Zap size={18} /></div>
        <div className="sb-logo-text">
          <div className="sb-logo-title">Obsidian Kinetic</div>
          <div className="sb-logo-sub">PEAK PERFORMANCE</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sb-nav">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sb-link${isActive ? ' sb-link--active' : ''}`}
              onClick={() => document.documentElement.classList.remove('nav-open')}
            >
              <Icon size={16} strokeWidth={isActive ? 2.5 : 1.8} className="sb-link-icon" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom CTA */}
      <div className="sb-bottom">
        <Link href="/timer" className="sb-cta">
          <Plus size={14} strokeWidth={2.5} className="sb-cta-icon" /> NEW FOCUS SESSION
        </Link>
      </div>

      <style jsx global>{`
        /* ================================================
           SIDEBAR — Glassmorphism + Active Highlight
           ================================================ */
        .sb {
          width: var(--sidebar-width);
          min-width: var(--sidebar-width);
          height: 100vh;
          background: var(--nav-bg);
          backdrop-filter: blur(36px) saturate(1.3);
          -webkit-backdrop-filter: blur(36px) saturate(1.3);
          border-right: 1px solid var(--nav-border);
          display: flex;
          flex-direction: column;
          z-index: 20;
          position: relative;
        }

        /* ---- Branding ---- */
        .sb-logo {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 12px;
          padding: 16px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          flex-shrink: 0;
        }

        .sb-logo-icon {
          width: 36px;
          height: 36px;
          min-width: 36px;
          border-radius: 10px;
          background: var(--primary-gradient);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--on-accent);
          box-shadow: var(--shadow-glow), var(--shadow-sm);
        }

        .sb-logo-text {
          min-width: 0;
        }

        .sb-logo-title {
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.01em;
          white-space: nowrap;
        }

        .sb-logo-sub {
          font-size: 0.5625rem;
          color: var(--text-tertiary);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 600;
          margin-top: 1px;
        }

        /* ---- Nav ---- */
        .sb-nav {
          flex: 1;
          padding: 12px 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow-y: auto;
        }

        .sb-nav::-webkit-scrollbar { width: 3px; }
        .sb-nav::-webkit-scrollbar-track { background: transparent; }
        .sb-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }

        /* ---- Nav Link (DEFAULT) ---- */
        .sb-link {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 12px !important;
          padding: 10px 14px;
          border-radius: 10px;
          color: var(--text-tertiary);
          text-decoration: none;
          font-size: 0.8125rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: all 0.2s ease;
          position: relative;
          white-space: nowrap;
          border: 1px solid transparent;
        }

        .sb-link:hover {
          color: var(--text-secondary);
          background: rgba(255, 255, 255, 0.04);
        }

        /* Force icon inline */
        .sb-link-icon {
          flex-shrink: 0;
          width: 16px;
          height: 16px;
        }

        /* ---- ACTIVE STATE — Glass Highlight ---- */
        .sb-link--active {
          background: color-mix(in srgb, var(--accent) 12%, transparent) !important;
          border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent) !important;
          color: var(--accent) !important;
          font-weight: 600;
          box-shadow: inset 0 0 12px color-mix(in srgb, var(--accent) 8%, transparent);
        }

        .sb-link--active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 55%;
          border-radius: 0 3px 3px 0;
          background: var(--primary-gradient);
          box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 40%, transparent);
        }

        .sb-link--active .sb-link-icon {
          color: var(--accent);
          filter: drop-shadow(0 0 5px color-mix(in srgb, var(--accent) 40%, transparent));
        }

        .sb-link--active:hover {
          background: color-mix(in srgb, var(--accent) 16%, transparent) !important;
          border-color: color-mix(in srgb, var(--accent) 30%, transparent) !important;
        }

        /* ---- Bottom CTA ---- */
        .sb-bottom {
          padding: 12px 12px 16px;
          flex-shrink: 0;
        }

        .sb-cta {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          width: 100%;
          padding: 11px 16px;
          background: var(--primary-gradient);
          color: var(--on-accent);
          border: none;
          border-radius: 10px;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: var(--shadow-glow);
        }

        .sb-cta-icon {
          flex-shrink: 0;
          width: 14px;
          height: 14px;
        }

        .sb-cta:hover {
          filter: brightness(1.05);
          box-shadow: var(--shadow-glow);
          transform: translateY(-1px);
        }

        /* ---- Mobile: off-canvas drawer ---- */
        @media (max-width: 860px) {
          .sb {
            position: fixed;
            top: 0;
            left: 0;
            z-index: 60;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
          }
          :root.nav-open .sb {
            transform: none;
            box-shadow: var(--shadow-lg);
          }
        }
      `}</style>
    </aside>
  )
}
