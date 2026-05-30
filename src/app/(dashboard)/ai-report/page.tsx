'use client'

import { Sparkles, Download, RefreshCw, Clock, Target, TrendingUp, AlertTriangle, CheckCircle2, Loader2, Calendar } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { createClient } from '@/lib/supabase/client'

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
  const [reportsList, setReportsList] = useState<any[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string>('')
  const [report, setReport] = useState<Report | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  // Load historical reports list
  const loadHistory = useCallback(async () => {
    if (!userId) return
    setLoadingHistory(true)
    try {
      const { data, error } = await supabase
        .from('ai_reports')
        .select('*')
        .eq('user_id', userId)
        .order('period_start', { ascending: false })

      if (error) throw error
      
      setReportsList(data || [])
      
      if (data && data.length > 0) {
        // Default to the most recent report
        const latest = data[0]
        setSelectedReportId(latest.id)
        setReport({
          executionSnapshot: latest.execution_snapshot,
          dripAudit: latest.drip_audit,
          insights: typeof latest.pattern_insights === 'string'
            ? JSON.parse(latest.pattern_insights)
            : (latest.pattern_insights || []),
          recommendations: latest.recommendations || [],
          weekSummary: latest.execution_snapshot?.weekSummary || ''
        })
        setGeneratedAt(latest.generated_at)
      }
    } catch (err) {
      console.error('Failed to load report history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }, [userId])

  useEffect(() => {
    if (userId) {
      loadHistory()
    }
  }, [userId, loadHistory])

  // Select a historical report
  const handleSelectReport = (reportId: string) => {
    const selected = reportsList.find(r => r.id === reportId)
    if (!selected) return
    setSelectedReportId(reportId)
    setReport({
      executionSnapshot: selected.execution_snapshot,
      dripAudit: selected.drip_audit,
      insights: typeof selected.pattern_insights === 'string'
        ? JSON.parse(selected.pattern_insights)
        : (selected.pattern_insights || []),
      recommendations: selected.recommendations || [],
      weekSummary: selected.execution_snapshot?.weekSummary || ''
    })
    setGeneratedAt(selected.generated_at)
  }

  const generateReport = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        // Reload history, set the new report as active
        const { data: updatedList, error: historyErr } = await supabase
          .from('ai_reports')
          .select('*')
          .eq('user_id', userId)
          .order('period_start', { ascending: false })

        if (historyErr) throw historyErr

        setReportsList(updatedList || [])
        
        // Find the newly generated report
        const newReport = data.id 
          ? (updatedList || []).find(r => r.id === data.id)
          : null
        
        if (newReport) {
          setSelectedReportId(newReport.id)
          setReport({
            executionSnapshot: newReport.execution_snapshot,
            dripAudit: newReport.drip_audit,
            insights: typeof newReport.pattern_insights === 'string'
              ? JSON.parse(newReport.pattern_insights)
              : (newReport.pattern_insights || []),
            recommendations: newReport.recommendations || [],
            weekSummary: newReport.execution_snapshot?.weekSummary || ''
          })
          setGeneratedAt(newReport.generated_at)
        } else {
          // Fallback to returned transient structure
          setReport(data.report)
          setGeneratedAt(data.generatedAt)
        }
      }
    } catch (err) {
      setError('Failed to connect to AI service')
    }
    setLoading(false)
  }, [userId])

  const formatDateRange = (startStr: string, endStr: string) => {
    const start = new Date(startStr + 'T12:00:00')
    const end = new Date(endStr + 'T12:00:00')
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return (
    <div className="ai-report-page">
      <div className="ai-header animate-fade-in">
        <div>
          <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={22} style={{ color: 'var(--accent)' }} /> AI Weekly Reports
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Powered by Grok API · Performance Insights & Actions
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {reportsList.length > 0 && (
            <div className="history-selector-wrapper">
              <select
                className="input select-input"
                value={selectedReportId}
                onChange={e => handleSelectReport(e.target.value)}
                disabled={loading}
                style={{ minWidth: '240px', paddingRight: '24px' }}
              >
                {reportsList.map(r => (
                  <option key={r.id} value={r.id}>
                    {formatDateRange(r.period_start, r.period_end)}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <button className="btn btn-primary btn-sm" onClick={generateReport} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spinning' : ''} style={{ marginRight: '6px' }} />
            {loading ? 'Analyzing...' : reportsList.length > 0 ? 'Generate Weekly Report' : 'Analyze First Week'}
          </button>
        </div>
      </div>

      {/* Loading History State */}
      {loadingHistory && !loading && (
        <div className="loading-card card animate-fade-in" style={{ textAlign: 'center', padding: '60px 40px' }}>
          <Loader2 size={32} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
        </div>
      )}

      {/* Generating/Analyzing Loading State */}
      {loading && (
        <div className="loading-card card animate-fade-in" style={{ textAlign: 'center', padding: '80px 40px' }}>
          <Loader2 size={36} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Analyzing your performance...</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Our AI is auditing your deep work cycles, habits completed, and shutdown journals</p>
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

      {/* Empty State (No reports exist yet) */}
      {!loadingHistory && !loading && reportsList.length === 0 && !error && (
        <div className="card animate-fade-in" style={{ textAlign: 'center', padding: '80px 40px', color: 'var(--text-tertiary)' }}>
          <Calendar size={40} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>No Reports Generated</h3>
          <p style={{ fontSize: '0.875rem', marginBottom: '20px', maxWidth: '380px', margin: '0 auto 20px' }}>
            Perform deep work sessions, log habits, and complete shutdown journals. Then, generate your first performance report.
          </p>
          <button className="btn btn-primary btn-sm" onClick={generateReport}>Generate First Report</button>
        </div>
      )}

      {/* Report Content */}
      {report && !loading && !loadingHistory && (
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
        .select-input {
          background-color: var(--bg-elevated);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          border-radius: var(--radius-sm);
          cursor: pointer;
        }
        .select-input:hover {
          border-color: var(--border-hover);
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
