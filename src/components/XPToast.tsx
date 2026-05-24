'use client'

import { Zap, Award } from 'lucide-react'
import { useState, useEffect, useCallback, createContext, useContext } from 'react'

type XPNotification = {
  id: string
  xp: number
  label: string
  leveledUp?: boolean
  newLevel?: number
  badge?: string
}

type XPToastContextType = {
  showXP: (xp: number, label: string, leveledUp?: boolean, newLevel?: number) => void
  showBadge: (badgeKey: string, badgeTitle: string) => void
}

const XPToastContext = createContext<XPToastContextType>({
  showXP: () => {},
  showBadge: () => {},
})

export const useXPToast = () => useContext(XPToastContext)

export function XPToastProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<XPNotification[]>([])

  const showXP = useCallback((xp: number, label: string, leveledUp?: boolean, newLevel?: number) => {
    const id = `xp-${Date.now()}-${Math.random()}`
    setNotifications(prev => [...prev, { id, xp, label, leveledUp, newLevel }])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 3500)
  }, [])

  const showBadge = useCallback((badgeKey: string, badgeTitle: string) => {
    const id = `badge-${Date.now()}`
    setNotifications(prev => [...prev, { id, xp: 0, label: badgeTitle, badge: badgeKey }])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 4500)
  }, [])

  return (
    <XPToastContext.Provider value={{ showXP, showBadge }}>
      {children}

      {/* Toast container */}
      <div className="xp-toast-container">
        {notifications.map((n, i) => (
          <div
            key={n.id}
            className={`xp-toast ${n.badge ? 'xp-toast-badge' : ''} ${n.leveledUp ? 'xp-toast-level' : ''}`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            {n.badge ? (
              <>
                <Award size={18} style={{ color: 'var(--status-warning)' }} />
                <span>🏆 Badge Unlocked: <strong>{n.label}</strong></span>
              </>
            ) : (
              <>
                <Zap size={16} style={{ color: 'var(--accent)' }} />
                <span className="xp-toast-amount text-mono">+{n.xp} XP</span>
                <span className="xp-toast-label">{n.label}</span>
                {n.leveledUp && (
                  <span className="xp-toast-levelup text-mono">⬆ Level {n.newLevel}!</span>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <style jsx>{`
        .xp-toast-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          display: flex;
          flex-direction: column-reverse;
          gap: 8px;
          pointer-events: none;
        }
        .xp-toast {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--bg-elevated);
          border: 1px solid var(--accent);
          border-radius: var(--radius-md);
          padding: 12px 20px;
          font-size: 0.875rem;
          color: var(--text-primary);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          animation: toast-in 0.4s ease forwards;
          backdrop-filter: blur(12px);
        }
        .xp-toast-badge {
          border-color: var(--status-warning);
          background: linear-gradient(135deg, rgba(255,183,77,0.12), var(--bg-elevated));
        }
        .xp-toast-level {
          border-color: var(--accent);
          background: linear-gradient(135deg, rgba(76,175,125,0.15), var(--bg-elevated));
        }
        .xp-toast-amount {
          font-weight: 700;
          color: var(--accent);
          font-size: 0.9375rem;
        }
        .xp-toast-label {
          color: var(--text-secondary);
          font-size: 0.8125rem;
        }
        .xp-toast-levelup {
          color: var(--accent);
          font-weight: 700;
          font-size: 0.8125rem;
          padding: 2px 8px;
          background: var(--accent-subtle);
          border-radius: var(--radius-full);
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(40px) scale(0.95); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
    </XPToastContext.Provider>
  )
}
