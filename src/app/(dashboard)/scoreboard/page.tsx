'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { getScoreboardData } from '@/lib/data'
import { generateReport } from '@/lib/reportGenerator'
import type { ScoreboardData } from '@/lib/types'
import {
  Loader2, Zap, TrendingUp, Activity, Clock,
  Monitor, FileText, Download, ChevronRight, ChevronDown
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Area, AreaChart, Legend
} from 'recharts'
import './scoreboard.css'

export default function ScoreboardPage() {
  const { userId, lastUpdate } = useUser()
  const [data, setData] = useState<ScoreboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAllSessions, setShowAllSessions] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const d = await getScoreboardData(userId, weekOffset)
    setData(d)
    setLoading(false)
  }, [userId, lastUpdate, weekOffset])

  useEffect(() => { loadData() }, [loadData])

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Prepare chart data
  const barData = data.weeklyChart.map(d => ({
    day: d.day,
    'Deep Work': Math.round(d.deepMin / 60 * 10) / 10,
    'Shallow': Math.round(d.shallowMin / 60 * 10) / 10,
  }))

  const trendData = data.trendLine.map(d => ({
    date: d.date.slice(5), // MM-DD
    hours: d.hours,
  }))

  // Deep Work Ratio ring
  const ratioCircumference = 2 * Math.PI * 52
  const ratioOffset = ratioCircumference * (1 - data.deepWorkRatio / 100)

  // Session display
  const visibleSessions = showAllSessions ? data.sessions : data.sessions.slice(0, 8)

  function getSessionType(pct: number): { label: string; cls: string } {
    if (pct >= 70) return { label: 'Deep Work', cls: 'deep' }
    if (pct >= 30) return { label: 'Mixed', cls: 'mixed' }
    return { label: 'Shallow Work', cls: 'shallow' }
  }

  function formatDuration(min: number) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const customTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: 'rgba(15,15,15,0.95)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        padding: '10px 14px',
        fontSize: '0.75rem',
        backdropFilter: 'blur(12px)',
      }}>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
            <span style={{ color: '#aaa' }}>{p.name}:</span>
            <span style={{ color: '#eee', fontWeight: 700 }}>{p.value}h</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="sb-page">
      {/* ── Header ── */}
      <div className="sb-header animate-fade-in">
        <div className="sb-header-left">
          <div className="sb-protocol">PERFORMANCE PROTOCOL</div>
          <h1>The Scoreboard</h1>
        </div>
        <div className="sb-header-actions">
          <select
            className="sb-week-select"
            value={weekOffset}
            onChange={e => setWeekOffset(Number(e.target.value))}
          >
            <option value={0}>This Week</option>
            <option value={1}>Last Week</option>
            <option value={2}>2 Weeks Ago</option>
            <option value={3}>3 Weeks Ago</option>
          </select>
          <div className="sb-live-badge">
            <span className="sb-live-dot" /> LIVE TRACKING
          </div>
          <button
            className="sb-export-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => generateReport(data, 'Het Patel')}
          >
            <Download size={13} /> DOWNLOAD REPORT
          </button>
        </div>
      </div>

      {/* ── Charts Grid: Focus Distribution + Deep Work Ratio ── */}
      <div className="sb-charts-grid animate-fade-in" style={{ animationDelay: '0.05s' }}>
        {/* Focus Distribution Bar Chart */}
        <div className="sb-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div className="sb-card-title">Focus Distribution</div>
              <div className="sb-card-subtitle">This Week</div>
            </div>
            <div className="sb-legend">
              <span><span className="sb-legend-dot" style={{ background: '#4CAF7D' }} /> Deep Work</span>
              <span><span className="sb-legend-dot" style={{ background: 'rgba(76,175,125,0.25)' }} /> Shallow</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} unit="h" />
              <Tooltip content={customTooltip} />
              <Bar dataKey="Deep Work" fill="#4CAF7D" radius={[4, 4, 0, 0]} stackId="a" />
              <Bar dataKey="Shallow" fill="rgba(76,175,125,0.25)" radius={[4, 4, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Deep Work Ratio Ring */}
        <div className="sb-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="sb-card-title" style={{ textAlign: 'center' }}>Deep Work Ratio</div>
          <div className="sb-card-subtitle" style={{ textAlign: 'center' }}>30 Day Average</div>
          <div className="sb-ratio-ring">
            <svg className="sb-ratio-svg" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
              <circle
                cx="60" cy="60" r="52" fill="none"
                stroke="#4CAF7D" strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={ratioCircumference}
                strokeDashoffset={ratioOffset}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dashoffset 1s ease' }}
              />
            </svg>
            <div className="sb-ratio-text">
              <div className="sb-ratio-value">{data.deepWorkRatio}%</div>
              <div className="sb-ratio-label">Deep Work</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 30-Day Trend Line ── */}
      <div className="sb-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div className="sb-card-title">30-Day Progress</div>
            <div className="sb-card-subtitle">Daily Focus Hours</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4CAF7D" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4CAF7D" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
            <YAxis tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} unit="h" />
            <Tooltip content={customTooltip} />
            <Area type="monotone" dataKey="hours" stroke="#4CAF7D" strokeWidth={2} fill="url(#trendGrad)" name="Hours" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Stat Cards ── */}
      <div className="sb-stats-row animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <div className="sb-stat-card">
          <div className="sb-stat-icon" style={{ background: 'rgba(76,175,125,0.1)' }}>
            <Zap size={18} style={{ color: '#4CAF7D' }} />
          </div>
          <div className="sb-stat-value" style={{ color: '#4CAF7D' }}>{data.peakVelocity}</div>
          <div className="sb-stat-label">Peak Velocity (h/day)</div>
        </div>
        <div className="sb-stat-card">
          <div className="sb-stat-icon" style={{ background: 'rgba(251,191,36,0.1)' }}>
            <TrendingUp size={18} style={{ color: '#FBBF24' }} />
          </div>
          <div className="sb-stat-value" style={{ color: '#FBBF24' }}>{data.totalHoursWeek}h</div>
          <div className="sb-stat-label">Total This Week</div>
        </div>
        <div className="sb-stat-card">
          <div className="sb-stat-icon" style={{ background: 'rgba(249,115,22,0.1)' }}>
            <Activity size={18} style={{ color: '#F97316' }} />
          </div>
          <div className="sb-stat-value" style={{ color: '#F97316' }}>{data.avgIntensity}</div>
          <div className="sb-stat-label">Avg Intensity</div>
        </div>
        <div className="sb-stat-card">
          <div className="sb-stat-icon" style={{ background: 'rgba(139,92,246,0.1)' }}>
            <Clock size={18} style={{ color: '#8B5CF6' }} />
          </div>
          <div className="sb-stat-value" style={{ color: '#8B5CF6' }}>{data.totalHoursMonth}h</div>
          <div className="sb-stat-label">Total (30 Days)</div>
        </div>
      </div>

      {/* ── Session History ── */}
      <div className="sb-history animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <div className="sb-history-header">
          <div>
            <div className="sb-history-title">Session History</div>
            <div className="sb-history-subtitle">The chronological ledger of your obsidian focus.</div>
          </div>
          <button className="sb-export-btn" onClick={() => generateReport(data, 'Het Patel')}>
            <FileText size={13} style={{ marginRight: 4 }} />
            EXPORT LEDGER
          </button>
        </div>

        {visibleSessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
            No sessions recorded yet. Start a focus session to begin tracking.
          </div>
        ) : (
          <>
            {visibleSessions.map(s => {
              const pct = s.deep_work_pct ?? 100
              const { label, cls } = getSessionType(pct)
              const dur = s.duration_minutes || 0
              const dateObj = new Date(s.started_at)
              const dayStr = dateObj.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })
              const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
              const score = s.intensity_score || 0
              const tier = score >= 8 ? 'ELITE TIER' : score >= 5 ? 'STABLE TIER' : 'UTILITY TIER'

              return (
                <div key={s.id} className="sb-session-row">
                  <div className={`sb-session-icon ${cls}`}>
                    {cls === 'deep' ? <Monitor size={18} /> : cls === 'mixed' ? <FileText size={18} /> : <Activity size={18} />}
                  </div>
                  <div className="sb-session-info">
                    <div className="sb-session-title">
                      {label}: {s.notes || 'Focus Session'}
                    </div>
                    <div className="sb-session-meta">
                      {dayStr.toUpperCase()}, {timeStr} • {formatDuration(dur)} • {pct}% Deep
                    </div>
                  </div>
                  <div className="sb-session-score">
                    <div className="sb-session-score-value">{score}/10</div>
                    <div className="sb-session-score-label">{tier}</div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
                </div>
              )
            })}

            {data.sessions.length > 8 && (
              <div className="sb-show-more">
                <button onClick={() => setShowAllSessions(!showAllSessions)}>
                  {showAllSessions ? 'Show Less' : `View All ${data.sessions.length} Sessions`}
                  <ChevronDown size={13} style={{ marginLeft: 4, transform: showAllSessions ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
