'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { Sparkles, RefreshCw, TrendingUp, TrendingDown, Flame, AlertTriangle, Brain } from 'lucide-react'

type Signals = {
  month: { expense: number; income: number; lastExpense: number; pctChange: number }
  forecastExpense: number
  categoryAlerts: { name: string; thisMonth: number; lastMonth: number; pct: number }[]
  habitsAtRisk: { name: string; streak: number }[]
  deepWork: { thisWeekHours: number; lastWeekHours: number; pctChange: number }
}
type Insights = { signals: Signals; summary: string; tips: string[]; generatedAt: string } | null

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`

export default function AICoachCard() {
  const { userId, lastUpdate } = useUser()
  const [data, setData] = useState<Insights>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (refresh = false) => {
    if (!userId) return
    refresh ? setRefreshing(true) : setLoading(true)
    try {
      const res = await fetch('/api/insights', { method: refresh ? 'POST' : 'GET' })
      const json = await res.json()
      if (res.ok) setData(json)
    } catch { /* ignore */ }
    setLoading(false); setRefreshing(false)
  }, [userId])

  useEffect(() => { load() }, [load, lastUpdate])

  const s = data?.signals

  return (
    <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--accent-muted)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Brain size={17} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>AI Coach</div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Daily intelligence digest</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          title="Regenerate"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <Sparkles size={14} className="ai-pulse" /> Reading your week…
        </div>
      ) : !s ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>No insights yet — log a few things and refresh.</div>
      ) : (
        <>
          {/* Coach summary */}
          <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{data?.summary}</p>

          {/* Anomaly badges */}
          {(s.categoryAlerts.length > 0 || s.habitsAtRisk.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {s.categoryAlerts.map(a => (
                <span key={a.name} className="coach-badge coach-badge--warn">
                  <AlertTriangle size={11} /> {a.name} +{a.pct}%
                </span>
              ))}
              {s.habitsAtRisk.map(h => (
                <span key={h.name} className="coach-badge coach-badge--flame">
                  <Flame size={11} /> {h.name} streak {h.streak}d — due today
                </span>
              ))}
            </div>
          )}

          {/* Stat strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div className="coach-stat">
              <div className="coach-stat-label">Spent</div>
              <div className="coach-stat-val">{inr(s.month.expense)}</div>
              <div className="coach-stat-sub" style={{ color: s.month.pctChange <= 0 ? 'var(--status-success)' : 'var(--status-danger)' }}>
                {s.month.pctChange <= 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />} {Math.abs(s.month.pctChange)}% vs last mo
              </div>
            </div>
            <div className="coach-stat">
              <div className="coach-stat-label">Forecast</div>
              <div className="coach-stat-val">{inr(s.forecastExpense)}</div>
              <div className="coach-stat-sub" style={{ color: 'var(--text-tertiary)' }}>by month-end</div>
            </div>
            <div className="coach-stat">
              <div className="coach-stat-label">Deep work</div>
              <div className="coach-stat-val">{s.deepWork.thisWeekHours}h</div>
              <div className="coach-stat-sub" style={{ color: s.deepWork.pctChange >= 0 ? 'var(--status-success)' : 'var(--status-danger)' }}>
                {s.deepWork.pctChange >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {Math.abs(s.deepWork.pctChange)}% vs last wk
              </div>
            </div>
          </div>

          {/* Tips */}
          {data?.tips && data.tips.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.tips.map((t, i) => (
                <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--accent)' }}>→</span> {t}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <style jsx>{`
        .coach-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 0.6875rem; font-weight: 600; padding: 4px 9px; border-radius: var(--radius-full); border: 1px solid transparent; }
        .coach-badge--warn { background: color-mix(in srgb, var(--status-danger) 12%, transparent); color: var(--status-danger); border-color: color-mix(in srgb, var(--status-danger) 25%, transparent); }
        .coach-badge--flame { background: color-mix(in srgb, var(--status-warning) 14%, transparent); color: var(--status-warning); border-color: color-mix(in srgb, var(--status-warning) 26%, transparent); }
        .coach-stat { background: var(--bg-hover); border-radius: var(--radius-md); padding: 10px 12px; }
        .coach-stat-label { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary); font-weight: 600; }
        .coach-stat-val { font-size: 1.1rem; font-weight: 700; font-family: var(--font-mono); color: var(--text-primary); margin: 2px 0; }
        .coach-stat-sub { font-size: 0.625rem; display: flex; align-items: center; gap: 3px; }
        :global(.ai-pulse) { color: var(--accent); animation: aiPulse 1.4s ease-in-out infinite; }
        @keyframes aiPulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
