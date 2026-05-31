'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import {
  Loader2, Activity, Brain, CheckCircle2, BookOpen, TrendingUp, TrendingDown,
  Sparkles, Target, Wallet, Flame,
} from 'lucide-react'

type Breakdown = { focus: number; habits: number; money: number; goals: number }
type Corr = { text: string; tone: 'insight' | 'positive' | 'warning' }
type Ev = { date: string; ts: string; kind: string; text: string }
type Life = {
  lifeScore: number
  breakdown: Breakdown
  correlations: Corr[]
  timeline: Ev[]
  stats: { weekHours: number; monthExpense: number; activeGoals: number }
} | null

function Ring({ pct }: { pct: number }) {
  const r = 52, c = 2 * Math.PI * r
  const color = pct >= 70 ? 'var(--status-success)' : pct >= 40 ? 'var(--accent)' : 'var(--status-warning)'
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={r} fill="none" stroke="var(--bg-hover)" strokeWidth="10" />
      <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, pct)) / 100}
        transform="rotate(-90 65 65)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
    </svg>
  )
}

const KIND_ICON: Record<string, React.ElementType> = {
  session: Brain, expense: TrendingDown, income: TrendingUp, habit: CheckCircle2, journal: BookOpen,
}
const KIND_COLOR: Record<string, string> = {
  session: 'var(--accent)', expense: 'var(--status-danger)', income: 'var(--status-success)',
  habit: 'var(--status-info)', journal: 'var(--text-secondary)',
}

const BREAKDOWN_META: { key: keyof Breakdown; label: string; icon: React.ElementType }[] = [
  { key: 'focus', label: 'Focus', icon: Brain },
  { key: 'habits', label: 'Habits', icon: Flame },
  { key: 'money', label: 'Money', icon: Wallet },
  { key: 'goals', label: 'Goals', icon: Target },
]

export default function LifePage() {
  const { userId, lastUpdate } = useUser()
  const [data, setData] = useState<Life>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res = await fetch('/api/life')
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load, lastUpdate])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const score = data?.lifeScore ?? 0
  const verdict = score >= 75 ? 'Thriving' : score >= 55 ? 'On track' : score >= 35 ? 'Finding rhythm' : 'Rebuilding'

  return (
    <div className="life-page">
      <div className="animate-fade-in" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="text-subheading">UNIFIED INTELLIGENCE</div>
        <h1 className="text-display" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={26} style={{ color: 'var(--accent)' }} /> Life Insights
        </h1>
      </div>

      {/* Score + breakdown */}
      <div className="life-grid">
        <div className="card life-score-card animate-fade-in">
          <div className="life-ring-wrap">
            <Ring pct={score} />
            <div className="life-ring-center">
              <div className="life-score-num">{score}</div>
              <div className="life-score-of">/ 100</div>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600 }}>{verdict}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
              {data?.stats.weekHours}h deep work · {data?.stats.activeGoals} active goals this week
            </div>
          </div>
        </div>

        <div className="card animate-fade-in" style={{ animationDelay: '0.05s' }}>
          <div className="bg-card-title" style={{ fontWeight: 600, marginBottom: 'var(--space-md)' }}>Score breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {BREAKDOWN_META.map(({ key, label, icon: Icon }) => {
              const v = data?.breakdown[key] ?? 0
              return (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, fontSize: '0.8125rem' }}>
                    <Icon size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{label}</span>
                    <span className="text-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{v}</span>
                  </div>
                  <div className="life-bar-track"><div className="life-bar-fill" style={{ width: `${v}%` }} /></div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Correlations */}
      <div className="card animate-fade-in" style={{ animationDelay: '0.1s', marginTop: 'var(--space-lg)' }}>
        <div className="bg-card-title" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} style={{ color: 'var(--accent)' }} /> Patterns we noticed
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'var(--space-md)' }}>
          {data?.correlations.map((c, i) => (
            <div key={i} className={`life-corr life-corr--${c.tone}`}>{c.text}</div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="card animate-fade-in" style={{ animationDelay: '0.15s', marginTop: 'var(--space-lg)' }}>
        <div className="bg-card-title" style={{ fontWeight: 600, marginBottom: 'var(--space-md)' }}>Unified timeline</div>
        {!data?.timeline.length ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>Nothing logged recently.</div>
        ) : (
          <div className="life-timeline">
            {data.timeline.map((e, i) => {
              const Icon = KIND_ICON[e.kind] || Activity
              return (
                <div className="life-tl-row" key={i}>
                  <div className="life-tl-icon" style={{ color: KIND_COLOR[e.kind] || 'var(--text-tertiary)' }}><Icon size={14} /></div>
                  <span className="life-tl-text">{e.text}</span>
                  <span className="life-tl-date">{e.date.slice(5)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .life-page { max-width: 1000px; margin: 0 auto; padding-bottom: var(--space-2xl); }
        .life-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg); }
        @media (max-width: 820px) { .life-grid { grid-template-columns: 1fr; } }
        .life-score-card { display: flex; align-items: center; gap: var(--space-xl); }
        .life-ring-wrap { position: relative; width: 130px; height: 130px; flex-shrink: 0; }
        .life-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .life-score-num { font-size: 2.25rem; font-weight: 800; font-family: var(--font-mono); color: var(--text-primary); line-height: 1; }
        .life-score-of { font-size: 0.6875rem; color: var(--text-tertiary); }
        .life-bar-track { height: 6px; border-radius: var(--radius-full); background: var(--bg-hover); overflow: hidden; }
        .life-bar-fill { height: 100%; border-radius: var(--radius-full); background: var(--primary-gradient); transition: width 0.7s ease; }
        .life-corr { font-size: 0.875rem; line-height: 1.5; padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); }
        .life-corr--positive { background: color-mix(in srgb, var(--status-success) 10%, transparent); border-color: color-mix(in srgb, var(--status-success) 24%, transparent); color: var(--text-secondary); }
        .life-corr--warning { background: color-mix(in srgb, var(--status-warning) 12%, transparent); border-color: color-mix(in srgb, var(--status-warning) 26%, transparent); color: var(--text-secondary); }
        .life-corr--insight { background: var(--bg-hover); color: var(--text-secondary); }
        .life-timeline { display: flex; flex-direction: column; }
        .life-tl-row { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border-subtle); }
        .life-tl-row:last-child { border-bottom: none; }
        .life-tl-icon { width: 28px; height: 28px; border-radius: 8px; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .life-tl-text { flex: 1; font-size: 0.8125rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .life-tl-date { font-size: 0.6875rem; color: var(--text-tertiary); font-family: var(--font-mono); flex-shrink: 0; }
      `}</style>
    </div>
  )
}
