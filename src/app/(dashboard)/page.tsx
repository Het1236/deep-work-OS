'use client'

import { useEffect, useState, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import {
  getDashboardStats, getHabits, getHabitLogs, toggleHabitLog,
  getGoals, createSession, endSession as endSessionApi, discardSession,
  getActiveTasks, updateTaskStatus, getPlannerBlocks,
} from '@/lib/data'
import type { DashboardStats, Habit, HabitLog, Goal, Task, PlannerBlock } from '@/lib/types'
import {
  Play, Pause, Square, Zap,
  Loader2, Shield, ArrowRight, Coffee, Brain, SkipForward, Trash2, Clock, Sparkles
} from 'lucide-react'
import { useTimerStore } from '@/stores/timerStore'
import AICoachCard from '@/components/AICoachCard'

const DEEP_WORK_QUOTES = [
  { text: "Who you are, what you think, what you do, what you love—this is what your life is made of.", author: "Cal Newport" },
  { text: "Deep work is not some nostalgic affectation... It is instead an indispensable skill.", author: "Cal Newport" },
  { text: "Concentrate all your thoughts upon the work at hand. The sun's rays do not burn until brought to a focus.", author: "Alexander Graham Bell" },
  { text: "Only one who devotes himself to a cause with his whole strength and soul can be a true master.", author: "Albert Einstein" },
  { text: "He who is everywhere is nowhere.", author: "Seneca" },
  { text: "The key to productivity is to rotate your mind through different styles of focus.", author: "Cal Newport" },
  { text: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh" },
  { text: "Your goal is not to do more, but to have more of what you do matter.", author: "Cal Newport" },
  { text: "Solitude is the school of genius.", author: "Edward Gibbon" }
]

export default function DashboardPage() {
  const { userId, lastUpdate, triggerRefresh } = useUser()
  const {
    sessionId, isRunning, elapsed,
    startTimer, pauseTimer, resumeTimer, stopTimer, resetTimer,
  } = useTimerStore()

  /* ---- Hydration Guard ---- */
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  /* ---- Data State ---- */
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [activeTasks, setActiveTasks] = useState<Task[]>([])
  const [plannerBlocks, setPlannerBlocks] = useState<PlannerBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [intensity, setIntensity] = useState(10)
  const [saving, setSaving] = useState(false)
  const [isWrapUpOpen, setIsWrapUpOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [deepWorkPct, setDeepWorkPct] = useState(100)
  const [durationOverride, setDurationOverride] = useState<number | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const thirtyAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })()

  /* ---- Timer Tick ---- */
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRunning) {
      interval = setInterval(() => { useTimerStore.getState().tick() }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRunning])

  /* ---- Load Data ---- */
  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [s, h, l, g, tasks, blocks] = await Promise.all([
      getDashboardStats(userId),
      getHabits(userId),
      getHabitLogs(userId, thirtyAgo, today),
      getGoals(userId),
      getActiveTasks(userId),
      getPlannerBlocks(userId, today),
    ])
    setStats(s); setHabits(h); setLogs(l); setGoals(g); setActiveTasks(tasks); setPlannerBlocks(blocks)
    setLoading(false)
  }, [userId, today, thirtyAgo, lastUpdate])

  useEffect(() => { loadData() }, [loadData])

  /* ---- Timer Display ---- */
  const displayHours = Math.floor(elapsed / 3600)
  const displayMins = Math.floor((elapsed % 3600) / 60)
  const displaySecs = elapsed % 60
  const timeStr = displayHours > 0
    ? `${displayHours}:${String(displayMins).padStart(2, '0')}:${String(displaySecs).padStart(2, '0')}`
    : `${String(displayMins).padStart(2, '0')}:${String(displaySecs).padStart(2, '0')}`

  /* ---- Computed Stats ---- */
  const todayH = Math.floor((stats?.todayMinutes || 0) / 60)
  const todayM = (stats?.todayMinutes || 0) % 60
  const weekHrs = ((stats?.weekMinutes || 0) / 60).toFixed(1)
  const qualityScore = Math.round((stats?.avgIntensity || 0) * 10)
  const weeklyData = stats?.weeklyData || []
  const maxMin = Math.max(...weeklyData.map(d => d.minutes), 1)
  const dailyPct = Math.min(Math.round((stats?.todayMinutes || 0) / 480 * 100), 100)

  /* Habits */
  const completedH = habits.filter(h => logs.some(l => l.habit_id === h.id && l.log_date === today && l.completed)).length
  const totalH = habits.length
  const habitPct = totalH > 0 ? Math.round((completedH / totalH) * 100) : 0

  /* Intensity mode */
  const iMode = intensity >= 8 ? 'deep' : intensity >= 5 ? 'flow' : 'lite'

  /* Pinned WIGs & Daily Quote & Today's Agenda */
  const pinnedWigs = goals.filter(g => g.is_wig).slice(0, 3)
  const dayOfYear = new Date().getDate()
  const quote = DEEP_WORK_QUOTES[dayOfYear % DEEP_WORK_QUOTES.length]
  const todayTasks = activeTasks.filter(t => t.scheduled_date === today)

  const formatSlot = (slot: number) => {
    const hrs = Math.floor(slot / 2)
    const mins = (slot % 2) * 30
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  }

  /* ---- Actions ---- */
  async function handleStart() {
    try {
      const session = await createSession({
        user_id: userId!,
        started_at: new Date().toISOString(),
        session_date: today,
      })
      startTimer(session.id, 'deepwork')
    } catch (err: any) {
      console.error('createSession error:', err)
      alert('Failed to start session: ' + (err?.message || JSON.stringify(err)))
    }
  }

  async function handleRequestEnd() {
    pauseTimer()
    if (elapsed > 0 && sessionId && sessionId !== 'break_session') {
      setIsWrapUpOpen(true)
      if (userId) {
        const tasks = await getActiveTasks(userId)
        setActiveTasks(tasks)
      }
    } else {
      resetTimer()
    }
  }

  async function finalizeSession() {
    setSaving(true)
    const duration = durationOverride ?? Math.floor(elapsed / 60)
    if (duration > 0 && sessionId && sessionId !== 'break_session') {
      try {
        await endSessionApi(sessionId, {
          ended_at: new Date().toISOString(),
          duration_minutes: duration,
          intensity_score: intensity,
          notes: notes || undefined,
          deep_work_pct: deepWorkPct,
        })
        for (const taskId of selectedTaskIds) {
          await updateTaskStatus(taskId, 'done')
        }
        if (triggerRefresh) triggerRefresh()
      } catch (err) { console.error(err) }
    }
    cleanupWrapUp()
  }

  async function handleDiscard() {
    if (!confirm('Are you sure you want to discard this session? This cannot be undone.')) return
    setSaving(true)
    try {
      if (sessionId && sessionId !== 'break_session') {
        await discardSession(sessionId)
      }
    } catch (err) {
      console.error('Failed to discard session', err)
    }
    cleanupWrapUp()
  }

  function cleanupWrapUp() {
    setIsWrapUpOpen(false)
    setSelectedTaskIds(new Set())
    setNotes('')
    setDeepWorkPct(100)
    setDurationOverride(null)
    resetTimer()
    setSaving(false)
  }

  /* ---- Loading State ---- */
  if (!mounted || loading) {
    return (
      <div className="fd-loading">
        <Loader2 size={24} className="fd-spinner" />
        <style jsx>{`
          .fd-loading { display: flex; align-items: center; justify-content: center; height: 60vh; color: var(--text-tertiary); }
          .fd-spinner { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  return (
    <div className="fd">
      {/* ════════════════ HEADER ════════════════ */}
      <div className="fd-header animate-fade-in">
        <div>
          <div className="fd-status">STATUS: PEAK FLOW STATE</div>
          <h1 className="fd-title">Focus Dashboard</h1>
        </div>
        <div className="fd-meta">
          <div className="fd-sid text-mono">Session ID: {sessionId ? sessionId.slice(0, 7).toUpperCase() : '---'}</div>
          <div className="fd-sync">Last Synced: just now</div>
        </div>
      </div>

      {/* ════════════════ DAILY QUOTE ════════════════ */}
      <div className="fd-quote card animate-fade-in" style={{ animationDelay: '0.03s', padding: '16px 24px', textAlign: 'center', borderStyle: 'dashed', borderColor: 'var(--border-subtle)' }}>
        <p style={{ fontStyle: 'italic', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          &ldquo;{quote.text}&rdquo;
        </p>
        <span style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '4px', display: 'block', fontWeight: 600 }}>
          — {quote.author}
        </span>
      </div>

      {/* ════════════════ AI COACH ════════════════ */}
      <AICoachCard />

      {/* ════════════════ TIMER + INTENSITY ════════════════ */}
      <div className="fd-row1 animate-fade-in" style={{ animationDelay: '0.06s' }}>
        {/* Timer */}
        <div className="fd-timer-card">
          <div className="fd-tm-label text-mono">
            FOCUSING: {isRunning ? 'DEEP WORK SESSION' : 'USER INTERFACE DESIGN'}
          </div>
          <div className="fd-tm-time text-mono">{timeStr}</div>
          <div className="fd-tm-actions">
            {!isRunning ? (
              elapsed > 0 && sessionId ? (
                <>
                  <button className="fd-btn-primary" onClick={resumeTimer}><Play size={14} /> RESUME</button>
                  <button className="fd-btn-ghost" onClick={handleRequestEnd}>END</button>
                </>
              ) : (
                <>
                  <button className="fd-btn-primary" onClick={handleStart}><Play size={14} /> START SESSION</button>
                  <button className="fd-btn-ghost"><SkipForward size={14} /> SKIP</button>
                </>
              )
            ) : (
              <>
                <button className="fd-btn-primary" onClick={pauseTimer}><Pause size={14} /> PAUSE</button>
                <button className="fd-btn-ghost" onClick={handleRequestEnd}><Square size={14} /> END SESSION</button>
              </>
            )}
          </div>
        </div>

        {/* Intensity Protocol */}
        <div className="fd-ip-card">
          <h3 className="fd-sec-title">INTENSITY PROTOCOL</h3>
          <div className="fd-modes">
            <button className={`fd-mode ${iMode === 'deep' ? 'active' : ''}`} onClick={() => setIntensity(10)}>
              <Zap size={14} />
              <span className="fd-mode-name">Deep Work</span>
              <span className="fd-mode-tag text-mono">100% RAW</span>
            </button>
            <button className={`fd-mode ${iMode === 'flow' ? 'active' : ''}`} onClick={() => setIntensity(7)}>
              <Coffee size={14} />
              <span className="fd-mode-name">Flow Loop</span>
              <span className="fd-mode-tag text-mono">80% POWER</span>
            </button>
            <button className={`fd-mode ${iMode === 'lite' ? 'active' : ''}`} onClick={() => setIntensity(3)}>
              <Brain size={14} />
              <span className="fd-mode-name">Lite Focus</span>
              <span className="fd-mode-tag text-mono">40% POWER</span>
            </button>
          </div>
          <p className="fd-ip-note">
            High intensity blocks all notifications, web-browsing, and mobile interactions for the duration of the cycle.
          </p>
        </div>
      </div>

      {/* ════════════════ STATS ROW ════════════════ */}
      <div className="fd-row2 animate-fade-in" style={{ animationDelay: '0.12s' }}>
        {/* Deep Work Today */}
        <div className="fd-stat-card">
          <div className="fd-st-label text-mono">DEEP WORK TODAY</div>
          <div className="fd-st-val text-mono">{todayH}h {todayM}m</div>
          <div className="fd-progress-wrap">
            <div className="fd-progress-bar">
              <div className="fd-progress-fill" style={{ width: `${dailyPct}%` }} />
            </div>
          </div>
          <div className="fd-st-footer">
            <span className="text-mono">DAILY GOAL</span>
            <span className="text-mono">{dailyPct}% ACHIEVED</span>
          </div>
        </div>

        {/* Quality Score */}
        <div className="fd-stat-card">
          <div className="fd-st-label text-mono">QUALITY SCORE</div>
          <div className="fd-st-val fd-st-accent text-mono">{qualityScore}/100</div>
          <div className="fd-bars">
            {weeklyData.map((d, i) => (
              <div key={i} className="fd-bar-col">
                <div
                  className={`fd-bar ${i === weeklyData.length - 1 ? 'fd-bar-last' : ''}`}
                  style={{ height: `${Math.max((d.minutes / maxMin) * 100, 8)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="fd-st-center text-mono">OPTIMAL ENVIRONMENT DETECTED</div>
        </div>

        {/* Weekly Hours */}
        <div className="fd-stat-card">
          <div className="fd-st-label text-mono">WEEKLY HOURS</div>
          <div className="fd-st-val text-mono">{weekHrs} <span className="fd-st-unit">hrs</span></div>
          <div className="fd-bars">
            {weeklyData.map((d, i) => (
              <div key={i} className="fd-bar-col">
                <div
                  className={`fd-bar ${i >= weeklyData.length - 2 ? 'fd-bar-last' : ''}`}
                  style={{ height: `${Math.max((d.minutes / maxMin) * 100, 5)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="fd-st-change text-mono">+12% FROM LAST WEEK</div>
        </div>
      </div>

      {/* ════════════════ BOTTOM COMMAND SECTION ════════════════ */}
      <div className="fd-row3 animate-fade-in" style={{ animationDelay: '0.18s' }}>
        {/* Column 1: Habits Widget */}
        <div className="fd-evo-card">
          <div className="fd-evo-hdr">
            <h3 className="fd-sec-title">TODAY&apos;S HABITS</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="text-mono" style={{ fontSize: '0.75rem', color: habitPct >= 80 ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                {completedH}/{totalH}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <div className="fd-progress-bar" style={{ height: '6px' }}>
              <div className="fd-progress-fill" style={{ width: `${habitPct}%`, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span className="text-mono" style={{ fontSize: '0.5625rem', color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                {habitPct >= 100 ? 'ALL HABITS COMPLETE' : habitPct >= 80 ? 'ALMOST THERE' : habitPct >= 50 ? 'GOOD MOMENTUM' : 'KEEP GOING'}
              </span>
              <span className="text-mono" style={{ fontSize: '0.5625rem', color: 'var(--accent)', letterSpacing: '0.08em', float: 'right' }}>{habitPct}%</span>
            </div>
          </div>

          {habits.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {habits.map(habit => {
                const isDone = logs.some(l => l.habit_id === habit.id && l.log_date === today && l.completed)
                return (
                  <div key={habit.id} className="fd-habit-row" onClick={async () => {
                    await toggleHabitLog(userId!, habit.id, today, !isDone)
                    loadData()
                  }}>
                    <div className={`fd-habit-check ${isDone ? 'fd-habit-done' : ''}`}>
                      {isDone && <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="fd-habit-name" style={{
                      textDecoration: isDone ? 'line-through' : 'none',
                      color: isDone ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    }}>{habit.name}</span>
                    <span className="fd-habit-tag text-mono">
                      {habit.time_of_day === 'anytime' ? '' : habit.time_of_day.toUpperCase()}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="fd-empty">No habits configured. <a href="/habits" style={{ color: 'var(--accent)' }}>Add habits →</a></div>
          )}
        </div>

        {/* Column 2: Today's Agenda */}
        <div className="fd-agenda-card">
          <h3 className="fd-sec-title">TODAY&apos;S AGENDA</h3>
          {plannerBlocks.length > 0 || todayTasks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {plannerBlocks.map(block => (
                <div key={block.id} className="agenda-item">
                  <span className="agenda-time text-mono">{formatSlot(block.start_slot)} - {formatSlot(block.end_slot)}</span>
                  <div className="agenda-content">
                    <span className="agenda-title">{block.title}</span>
                    <span className="agenda-tag text-mono">{block.block_type.replace('_', ' ').toUpperCase()}</span>
                  </div>
                </div>
              ))}
              {todayTasks.filter(t => !plannerBlocks.some(pb => pb.task_id === t.id)).map(task => (
                <div key={task.id} className="agenda-item">
                  <span className="agenda-time text-mono">TASK</span>
                  <div className="agenda-content">
                    <span className="agenda-title">{task.title}</span>
                    <span className="agenda-tag text-mono" style={{ color: 'var(--accent)' }}>TODO</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="fd-empty">No planner blocks or tasks scheduled for today. <a href="/planner" style={{ color: 'var(--accent)' }}>Open Planner →</a></div>
          )}
        </div>

        {/* Column 3: Pinned WIGs & Environmental Insight */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div className="fd-wigs-card">
            <h3 className="fd-sec-title">PINNED WIGS</h3>
            {pinnedWigs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pinnedWigs.map(wig => (
                  <div key={wig.id} style={{ padding: '10px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{wig.title}</span>
                      <span className="text-mono" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{wig.progress_pct}%</span>
                    </div>
                    <div className="fd-progress-bar" style={{ height: '4px' }}>
                      <div className="fd-progress-fill" style={{ width: `${wig.progress_pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fd-empty">No active WIGs pinned. <a href="/goals" style={{ color: 'var(--accent)' }}>Open Goals →</a></div>
            )}
          </div>

          <div className="fd-env-card-inner">
            <h3 className="fd-sec-title">ENVIRONMENTAL INSIGHT</h3>
            <div className="fd-env-badge">
              <Shield size={16} style={{ color: 'var(--accent)' }} />
              <span>Distraction Shield: <strong style={{ color: 'var(--accent)' }}>ACTIVE</strong></span>
            </div>
            <p className="fd-env-text">
              {completedH > 0
                ? `System has tracked ${completedH} of ${totalH} habits completed today (${habitPct}%).`
                : `${totalH} habits configured for tracking today.`
              }
              {habitPct >= 80 ? ' Focus remains unbroken.' : ' Establish consistency.'}
            </p>
            <a href="/habits" className="fd-env-link text-mono">
              VIEW FULL SECURITY LOG <ArrowRight size={12} />
            </a>
          </div>
        </div>
      </div>

      {/* ════════════════ WRAP-UP MODAL ════════════════ */}
      {isWrapUpOpen && (
        <div className="wrapup-overlay">
          <div className="wrapup-modal animate-fade-in">
            <h2 className="wrapup-title">Session Wrap-up</h2>

            {/* Duration Override */}
            <div className="wrapup-field">
              <label className="wrapup-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} /> Adjust Duration (minutes)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={600}
                  value={durationOverride ?? Math.floor(elapsed / 60)}
                  onChange={e => setDurationOverride(Math.max(1, Number(e.target.value)))}
                  style={{ width: '100px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  Timer recorded: {Math.floor(elapsed / 60)}m
                  {durationOverride !== null && durationOverride !== Math.floor(elapsed / 60) && (
                    <span style={{ color: 'var(--status-warning)', marginLeft: '6px' }}>(overridden)</span>
                  )}
                </span>
              </div>
            </div>

            <div className="wrapup-field">
              <label className="wrapup-label">What did you mainly focus on?</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Log notes, thoughts, or achievements..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ width: '100%', resize: 'none' }}
              />
            </div>
            <div className="wrapup-field">
              <label className="wrapup-label">Deep Work vs Shallow Work</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', minWidth: '55px' }}>Shallow</span>
                <input
                  type="range" min={0} max={100} value={deepWorkPct}
                  onChange={e => setDeepWorkPct(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', minWidth: '40px' }}>Deep</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--status-warning)' }}>{100 - deepWorkPct}% Shallow</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)' }}>{deepWorkPct}% Deep Work</span>
              </div>
            </div>
            <div className="wrapup-field" style={{ marginBottom: '24px' }}>
              <label className="wrapup-label">Check off completed tasks</label>
              <div className="wrapup-tasks">
                {activeTasks.length > 0 ? activeTasks.map(task => (
                  <label key={task.id} className="wrapup-task">
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.has(task.id)}
                      onChange={(e) => {
                        const s = new Set(selectedTaskIds)
                        e.target.checked ? s.add(task.id) : s.delete(task.id)
                        setSelectedTaskIds(s)
                      }}
                    />
                    <span style={{
                      textDecoration: selectedTaskIds.has(task.id) ? 'line-through' : 'none',
                      fontSize: '0.875rem',
                    }}>{task.title}</span>
                  </label>
                )) : (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>No active tasks found.</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-ghost"
                onClick={handleDiscard}
                disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--status-error)', borderColor: 'rgba(239,68,68,0.3)' }}
              >
                <Trash2 size={14} /> Discard
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setIsWrapUpOpen(false); setDurationOverride(null); resumeTimer() }}>
                Cancel &amp; Resume
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={finalizeSession} disabled={saving}>
                {saving ? 'Saving...' : 'Finish & Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ STYLES ════════════════ */}
      <style jsx>{`
        /* ---- Container ---- */
        .fd { display: flex; flex-direction: column; gap: var(--space-xl); }

        /* ---- Header ---- */
        .fd-header { display: flex; align-items: flex-start; justify-content: space-between; }
        .fd-status {
          font-size: 0.6875rem; font-weight: 700; color: var(--accent);
          letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px;
        }
        .fd-title {
          font-size: 2.5rem; font-weight: 800; color: var(--text-primary);
          letter-spacing: -0.03em; line-height: 1.05;
          font-family: var(--font-display, var(--font-sans));
        }
        .fd-meta { text-align: right; padding-top: 4px; }
        .fd-sid { font-size: 0.75rem; color: var(--text-secondary); }
        .fd-sync { font-size: 0.6875rem; color: var(--accent); margin-top: 3px; }

        /* ---- Row 1: Timer + Intensity ---- */
        .fd-row1 { display: grid; grid-template-columns: 1fr 280px; gap: var(--space-lg); }

        /* Timer Card */
        .fd-timer-card {
          background: var(--bg-surface-glass);
          box-shadow: var(--shadow-md);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: 48px 40px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 300px;
        }
        .fd-tm-label {
          font-size: 0.75rem; color: var(--text-tertiary);
          letter-spacing: 0.16em; margin-bottom: var(--space-xl);
        }
        .fd-tm-time {
          font-size: 6rem; font-weight: 200; color: var(--text-primary);
          letter-spacing: 0.04em; line-height: 1; margin-bottom: 36px;
        }
        .fd-tm-actions { display: flex; gap: var(--space-md); align-items: center; }

        /* Buttons */
        .fd-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 13px 36px;
          background: var(--primary-gradient); color: var(--on-accent);
          border: none; border-radius: var(--radius-sm);
          font-size: 0.8125rem; font-weight: 700;
          letter-spacing: 0.07em; text-transform: uppercase;
          cursor: pointer; transition: all 0.2s ease;
          font-family: var(--font-sans);
        }
        .fd-btn-primary:hover { filter: brightness(1.12); box-shadow: var(--shadow-glow); }

        .fd-btn-ghost {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 13px 24px;
          background: var(--bg-hover); color: var(--text-primary);
          border: 1px solid var(--border-default); border-radius: var(--radius-sm);
          font-size: 0.8125rem; font-weight: 600;
          letter-spacing: 0.05em; text-transform: uppercase;
          cursor: pointer; transition: all 0.2s ease;
          font-family: var(--font-sans);
        }
        .fd-btn-ghost:hover { background: var(--bg-active); border-color: var(--border-hover); }

        /* Intensity Protocol */
        .fd-ip-card {
          background: var(--bg-surface-glass);
          box-shadow: var(--shadow-md);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: var(--space-xl);
          display: flex; flex-direction: column;
        }
        .fd-sec-title {
          font-size: 0.75rem; font-weight: 700; color: var(--text-primary);
          letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: var(--space-lg);
        }
        .fd-modes { display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .fd-mode {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 14px; border-radius: var(--radius-sm);
          background: var(--bg-hover); border: 1px solid var(--border-subtle);
          color: var(--text-tertiary); cursor: pointer;
          transition: all 0.15s ease; font-family: var(--font-sans);
          font-size: 0.8125rem;
        }
        .fd-mode:hover { border-color: var(--border-hover); color: var(--text-secondary); }
        .fd-mode.active {
          background: var(--accent-muted);
          border-color: var(--accent);
          color: var(--text-primary);
        }
        .fd-mode-name { flex: 1; font-weight: 500; }
        .fd-mode-tag { font-size: 0.5625rem; letter-spacing: 0.08em; color: var(--text-tertiary); }
        .fd-mode.active .fd-mode-tag { color: var(--accent); }
        .fd-ip-note {
          font-size: 0.75rem; color: var(--text-tertiary);
          line-height: 1.55; margin-top: auto; padding-top: var(--space-lg);
        }

        /* ---- Row 2: Stats ---- */
        .fd-row2 { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-lg); }
        .fd-stat-card {
          background: var(--bg-surface-glass);
          box-shadow: var(--shadow-md);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: var(--space-xl);
        }
        .fd-st-label {
          font-size: 0.6875rem; font-weight: 600; color: var(--text-tertiary);
          letter-spacing: 0.1em; margin-bottom: 8px;
        }
        .fd-st-val {
          font-size: 1.875rem; font-weight: 700; color: var(--text-primary);
          letter-spacing: -0.02em; line-height: 1.1;
        }
        .fd-st-unit { font-size: 0.875rem; font-weight: 400; color: var(--text-tertiary); }
        .fd-st-accent { color: var(--accent) !important; }

        /* Progress bar */
        .fd-progress-wrap { margin: 14px 0 10px; }
        .fd-progress-bar {
          width: 100%; height: 4px;
          background: var(--bg-hover);
          border-radius: 2px; overflow: hidden;
        }
        .fd-progress-fill {
          height: 100%; background: var(--accent);
          border-radius: 2px; transition: width 0.6s ease;
        }

        .fd-st-footer {
          display: flex; justify-content: space-between;
          font-size: 0.5625rem; color: var(--text-tertiary); letter-spacing: 0.08em;
        }
        .fd-st-center {
          text-align: center; font-size: 0.5625rem;
          color: var(--text-tertiary); letter-spacing: 0.08em; margin-top: 8px;
        }
        .fd-st-change {
          font-size: 0.625rem; color: var(--accent);
          letter-spacing: 0.06em; margin-top: 8px;
        }

        /* Mini bar charts */
        .fd-bars {
          display: flex; gap: 5px; align-items: flex-end;
          height: 44px; margin: 14px 0 8px;
        }
        .fd-bar-col { flex: 1; height: 100%; display: flex; align-items: flex-end; }
        .fd-bar {
          width: 100%; background: var(--accent-muted);
          border-radius: 2px; transition: height 0.5s ease; min-height: 3px;
        }
        .fd-bar-last { background: var(--accent) !important; }

        /* ---- Row 3: Bottom Command Center Grid ---- */
        .fd-row3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--space-lg); }
        
        .fd-evo-card, .fd-agenda-card, .fd-wigs-card, .fd-env-card-inner {
          background: var(--bg-surface-glass);
          box-shadow: var(--shadow-md);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: var(--space-xl);
        }

        /* Habits Widget */
        .fd-evo-hdr {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: var(--space-lg);
        }
        .fd-evo-hdr .fd-sec-title { margin-bottom: 0; }
        .fd-habit-row {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 0; cursor: pointer;
          transition: opacity 0.15s ease;
        }
        .fd-habit-row + .fd-habit-row { border-top: 1px solid var(--border-subtle); }
        .fd-habit-row:hover { opacity: 0.85; }
        .fd-habit-check {
          width: 20px; height: 20px; border-radius: 4px;
          border: 1.5px solid var(--border-default);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: all 0.2s ease;
          color: transparent;
        }
        .fd-habit-done {
          background: var(--accent); border-color: var(--accent); color: var(--on-accent);
        }
        .fd-habit-name {
          flex: 1; font-size: 0.8125rem; font-weight: 500;
          transition: all 0.15s ease;
        }
        .fd-habit-tag {
          font-size: 0.5625rem; color: var(--text-tertiary);
          letter-spacing: 0.08em;
        }
        .fd-empty { color: var(--text-tertiary); font-size: 0.8125rem; padding: 12px 0; }

        /* Agenda Widget */
        .agenda-item { display: flex; gap: var(--space-md); padding: 10px 0; border-bottom: 1px solid var(--border-subtle); align-items: center; }
        .agenda-item:last-child { border-bottom: none; }
        .agenda-time { font-size: 0.75rem; color: var(--accent); min-width: 85px; }
        .agenda-content { display: flex; flex-direction: column; gap: 3px; flex: 1; }
        .agenda-title { font-size: 0.8125rem; font-weight: 500; color: var(--text-primary); }
        .agenda-tag { font-size: 0.5625rem; color: var(--text-tertiary); letter-spacing: 0.08em; }

        /* Environmental Insight */
        .fd-env-badge {
          display: flex; align-items: center; gap: 10px;
          font-size: 0.875rem; color: var(--text-primary);
          margin-bottom: var(--space-lg);
        }
        .fd-env-text {
          font-size: 0.8125rem; color: var(--text-secondary);
          line-height: 1.65; margin-bottom: var(--space-md);
        }
        .fd-env-link {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 0.6875rem; font-weight: 700; color: var(--text-tertiary);
          letter-spacing: 0.08em; text-decoration: none;
          transition: color 0.15s ease;
        }
        .fd-env-link:hover { color: var(--accent); }

        /* ---- Wrap-Up Modal ---- */
        .wrapup-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          display: flex; align-items: center; justify-content: center;
          z-index: 100;
        }
        .wrapup-modal {
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: 20px;
          padding: var(--space-2xl);
          width: 90%; max-width: 520px;
          box-shadow: var(--shadow-lg);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }
        .wrapup-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 16px; }
        .wrapup-field { margin-bottom: 16px; }
        .wrapup-label {
          font-size: 0.8125rem; color: var(--text-secondary);
          display: block; margin-bottom: 6px;
        }
        .wrapup-tasks {
          max-height: 180px; overflow-y: auto;
          display: flex; flex-direction: column; gap: 8px;
          background: var(--bg-base); padding: 12px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-default);
        }
        .wrapup-task { display: flex; align-items: center; gap: 10px; cursor: pointer; }
        .wrapup-task input[type="checkbox"] { accent-color: var(--accent); width: 14px; height: 14px; }

        /* ---- Responsive ---- */
        @media (max-width: 1100px) {
          .fd-row1 { grid-template-columns: 1fr; }
          .fd-row2 { grid-template-columns: 1fr 1fr; }
          .fd-row3 { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          .fd-row2 { grid-template-columns: 1fr; }
          .fd-title { font-size: 1.75rem; }
          .fd-tm-time { font-size: 3.5rem; }
        }
      `}</style>
    </div>
  )
}
