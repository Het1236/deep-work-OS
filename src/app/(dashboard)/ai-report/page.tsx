'use client'

import { Sparkles, Download, RefreshCw, Clock, Target, TrendingUp, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'

type Report = {
  executionSnapshot: {
    totalHours: string
    avgQuality: string
    habitCompletion: string
    shutdownRituals: string
    hoursChange: string
    qualityChange: string
    habitChange: string
    shutdownStatus: string
  }
  dripAudit: {
    producing: number
    investing: number
    recharging: number
    draining: number
  }
  insights: { type: string; title: string; description: string }[]
  recommendations: string[]
  weekSummary: string
}

export default function AIReportPage() {
  const { userId } = useUser()
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generateReport = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setReport(data.report)
        setGeneratedAt(data.generatedAt)
      }
    } catch (err) {
      setError('Failed to connect to AI service')
    }
    setLoading(false)
  }, [userId])

  // Auto-generate on first load
  useEffect(() => {
    if (userId && !report && !loading) {
      generateReport()
    }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const weekRange = (() => {
    const now = new Date()
    const weekAgo = new Date(now)
    weekAgo.setDate(now.getDate() - 7)
    return `${weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  })()

  return (
    <div className="ai-report-page">
      <div className="ai-header animate-fade-in">
        <div>
          <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={22} style={{ color: 'var(--accent)' }} /> AI Weekly Report
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Week of {weekRange} · Powered by Google Gemini
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={generateReport} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spinning' : ''} /> {loading ? 'Generating...' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-card card animate-fade-in" style={{ textAlign: 'center', padding: '80px 40px' }}>
          <Loader2 size={36} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Analyzing your week...</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Gemini is processing your sessions, habits, and journal data</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="card animate-fade-in" style={{ textAlign: 'center', padding: '60px 40px' }}>
          <AlertTriangle size={36} style={{ color: 'var(--status-warning)', margin: '0 auto 20px' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Could not generate report</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>{error}</p>
          <button className="btn btn-primary btn-sm" onClick={generateReport}>Try Again</button>
        </div>
      )}

      {/* Report Content */}
      {report && !loading && (
        <>
          {/* Week Summary */}
          {report.weekSummary && (
            <div className="summary-banner card animate-fade-in" style={{ animationDelay: '0.05s', background: 'linear-gradient(135deg, rgba(76,175,125,0.08), rgba(76,175,125,0.02))', borderColor: 'rgba(76,175,125,0.2)' }}>
              <p style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', lineHeight: 1.6, fontStyle: 'italic' }}>
                &ldquo;{report.weekSummary}&rdquo;
              </p>
              {generatedAt && (
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', marginTop: '12px' }}>
                  Generated {new Date(generatedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Execution Snapshot */}
          <div className="report-section card animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <h3 className="report-section-title"><Clock size={16} /> Execution Snapshot</h3>
            <div className="snapshot-grid">
              <div className="snapshot-item">
                <span className="snapshot-value text-mono">{report.executionSnapshot.totalHours}h</span>
                <span className="snapshot-label">Total Deep Work</span>
                <span className="badge badge-green">{report.executionSnapshot.hoursChange}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-value text-mono">{report.executionSnapshot.avgQuality}</span>
                <span className="snapshot-label">Avg Quality Score</span>
                <span className="badge badge-green">{report.executionSnapshot.qualityChange}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-value text-mono">{report.executionSnapshot.habitCompletion}</span>
                <span className="snapshot-label">Habit Completion</span>
                <span className="badge badge-amber">{report.executionSnapshot.habitChange}</span>
              </div>
              <div className="snapshot-item">
                <span className="snapshot-value text-mono">{report.executionSnapshot.shutdownRituals}</span>
                <span className="snapshot-label">Shutdown Rituals</span>
                <span className="badge badge-green">{report.executionSnapshot.shutdownStatus}</span>
              </div>
            </div>
          </div>

          {/* DRIP Audit */}
          <div className="report-section card animate-fade-in" style={{ animationDelay: '0.15s' }}>
            <h3 className="report-section-title"><Target size={16} /> DRIP Time Audit</h3>
            <div className="drip-bars">
              {[
                { label: 'Producing', pct: report.dripAudit.producing, color: 'var(--drip-producing, var(--accent))' },
                { label: 'Investing', pct: report.dripAudit.investing, color: 'var(--drip-investing, var(--status-info))' },
                { label: 'Recharging', pct: report.dripAudit.recharging, color: 'var(--drip-recharging, var(--status-warning))' },
                { label: 'Draining', pct: report.dripAudit.draining, color: 'var(--drip-draining, var(--status-danger))' },
              ].map(d => (
                <div key={d.label} className="drip-bar-row">
                  <span className="drip-bar-label">{d.label}</span>
                  <div className="drip-bar-track">
                    <div className="drip-bar-fill" style={{ width: `${d.pct}%`, background: d.color }} />
                  </div>
                  <span className="text-mono drip-bar-pct">{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pattern Insights */}
          <div className="report-section card animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <h3 className="report-section-title"><TrendingUp size={16} /> Pattern Insights</h3>
            <div className="insights">
              {report.insights.map((insight, i) => (
                <div key={i} className="insight-item">
                  {insight.type === 'positive'
                    ? <CheckCircle2 size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    : <AlertTriangle size={16} style={{ color: 'var(--status-warning)', flexShrink: 0 }} />
                  }
                  <p><strong>{insight.title}:</strong> {insight.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className="report-section card animate-fade-in" style={{ animationDelay: '0.25s' }}>
            <h3 className="report-section-title"><Sparkles size={16} /> Action Recommendations</h3>
            <div className="recs">
              {report.recommendations.map((rec, i) => (
                <div key={i} className="rec-item">
                  <span className="rec-num text-mono">{i + 1}</span>
                  <p>{rec}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .ai-report-page { display: flex; flex-direction: column; gap: var(--space-xl); }
        .ai-header { display: flex; align-items: center; justify-content: space-between; }
        .report-section-title { display: flex; align-items: center; gap: var(--space-sm); font-size: 0.9375rem; font-weight: 600; margin-bottom: var(--space-xl); color: var(--text-primary); }
        .snapshot-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-lg); }
        .snapshot-item { display: flex; flex-direction: column; gap: var(--space-xs); }
        .snapshot-value { font-size: 1.75rem; font-weight: 700; color: var(--text-primary); }
        .snapshot-label { font-size: 0.8125rem; color: var(--text-secondary); }
        .drip-bars { display: flex; flex-direction: column; gap: var(--space-md); }
        .drip-bar-row { display: flex; align-items: center; gap: var(--space-md); }
        .drip-bar-label { font-size: 0.8125rem; color: var(--text-secondary); min-width: 90px; }
        .drip-bar-track { flex: 1; height: 8px; background: var(--bg-hover); border-radius: var(--radius-full); overflow: hidden; }
        .drip-bar-fill { height: 100%; border-radius: var(--radius-full); transition: width 0.8s ease; }
        .drip-bar-pct { font-size: 0.75rem; color: var(--text-tertiary); min-width: 35px; text-align: right; }
        .insights { display: flex; flex-direction: column; gap: var(--space-lg); }
        .insight-item { display: flex; gap: var(--space-md); font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; }
        .insight-item strong { color: var(--text-primary); }
        .recs { display: flex; flex-direction: column; gap: var(--space-md); }
        .rec-item { display: flex; gap: var(--space-md); font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; padding: var(--space-md); background: var(--bg-surface); border-radius: var(--radius-sm); }
        .rec-num { font-size: 0.875rem; font-weight: 700; color: var(--accent); min-width: 20px; }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
