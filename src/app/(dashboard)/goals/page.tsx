'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import {
  getGoals, createGoal, updateGoal, getProfile,
  getProjects, getHabits, getHabitLogs, upsertNote, getNotes, updateProfile,
} from '@/lib/data'
import type { Goal, Project, Habit, HabitLog } from '@/lib/types'
import {
  Loader2, Plus, X, Target, Zap, Shield, Compass, Star,
  Flag, FolderKanban, CheckSquare, ChevronRight, MoreVertical,
  TrendingUp, Trash2, Sparkles,
} from 'lucide-react'
import './goals.css'

/* ─── Config ─── */
const STATUS_CFG: Record<string, { bg: string; text: string; label: string; border: string }> = {
  aspirational: { bg: 'rgba(91,155,213,0.1)', text: '#5B9BD5', label: 'Aspirational', border: 'rgba(91,155,213,0.3)' },
  developing:   { bg: 'rgba(245,166,35,0.1)', text: '#F5A623', label: 'Developing', border: 'rgba(245,166,35,0.3)' },
  integrated:   { bg: 'rgba(76,175,125,0.1)', text: '#4CAF7D', label: 'Integrated', border: 'rgba(76,175,125,0.3)' },
}

const ATTR_ICONS = [
  { icon: <Target size={18}/>, label: 'ARCHETYPE', color: 'rgba(76,175,125,0.12)', iconColor: 'var(--accent)' },
  { icon: <Shield size={18}/>, label: 'CORE VALUE', color: 'rgba(91,155,213,0.12)', iconColor: '#5B9BD5' },
  { icon: <Zap size={18}/>,    label: 'DRIVER', color: 'rgba(76,175,125,0.12)', iconColor: 'var(--accent)' },
  { icon: <Compass size={18}/>,label: 'BOUNDARIES', color: 'rgba(229,57,53,0.12)', iconColor: '#E53935' },
]

const ATTR_DEFAULTS = ['Deep Thinker', 'Precision', 'Velocity', 'Non-Negotiables']

const FLOW_STEPS = [
  { icon: <Shield size={18}/>, label: 'Identity' },
  { icon: <Star size={18}/>,   label: 'WIGs' },
  { icon: <Flag size={18}/>,   label: 'Goals' },
  { icon: <FolderKanban size={18}/>, label: 'Projects' },
  { icon: <CheckSquare size={18}/>, label: 'Tasks' },
]

export default function GoalsPage() {
  const { userId } = useUser()
  const [goals, setGoals] = useState<Goal[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [loading, setLoading] = useState(true)
  const [vision, setVision] = useState('')
  const [personality, setPersonality] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  // Vision & Anti-Vision board state
  const [isEditingVision, setIsEditingVision] = useState(false)
  const [coreValues, setCoreValues] = useState('')
  const [antiVisionTraps, setAntiVisionTraps] = useState('')
  const [futureIdentity, setFutureIdentity] = useState('')
  const [archetype, setArchetype] = useState('')

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editProgress, setEditProgress] = useState(0)

  // Form
  const [nTitle, setNTitle] = useState('')
  const [nProblem, setNProblem] = useState('')
  const [nSolution, setNSolution] = useState('')
  const [nStatus, setNStatus] = useState('aspirational')
  const [nArea, setNArea] = useState('')
  const [nDate, setNDate] = useState('')
  const [nWig, setNWig] = useState(false)
  const [nDomino, setNDomino] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [g, profile, p, h, hl, notes] = await Promise.all([
        getGoals(userId),
        getProfile(userId),
        getProjects(userId),
        getHabits(userId),
        getHabitLogs(userId, today, today),
        getNotes(userId, 'blueprint'),
      ])
      setGoals(g)
      setVision(profile?.identity_statement || '')
      setPersonality(profile?.personality_type || '')
      setProjects(p)
      setHabits(h)
      setHabitLogs(hl)

      // Set Vision board fields
      setFutureIdentity(profile?.identity_statement || '')
      setArchetype(profile?.personality_type || '')

      const profileNote = notes.find(n => n.title === 'Higher-Self Profile')
      if (profileNote) {
        try {
          const parsed = JSON.parse(profileNote.content)
          setCoreValues(parsed.coreValues || '')
          setAntiVisionTraps(parsed.antiVisionTraps || '')
        } catch {
          setCoreValues('')
          setAntiVisionTraps('')
        }
      }
    } catch (e: any) { console.error(e) }
    setLoading(false)
  }, [userId, today])

  async function handleSaveVision() {
    if (!userId) return
    try {
      // 1. Update profile
      await updateProfile(userId, {
        identity_statement: futureIdentity,
        personality_type: archetype
      })

      // 2. Fetch existing note to get ID
      const notes = await getNotes(userId, 'blueprint')
      const profileNote = notes.find(n => n.title === 'Higher-Self Profile')

      // 3. Upsert note
      await upsertNote({
        id: profileNote?.id,
        user_id: userId,
        title: 'Higher-Self Profile',
        content: JSON.stringify({ coreValues, antiVisionTraps }),
        note_type: 'blueprint'
      })

      setIsEditingVision(false)
      load()
    } catch (err: any) {
      alert('Failed to save Vision Board: ' + (err?.message || err))
    }
  }

  useEffect(() => { load() }, [load])

  /* ─── Handlers ─── */
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !nTitle.trim()) return
    await createGoal({
      user_id: userId, title: nTitle.trim(),
      problem: nProblem || undefined, solution: nSolution || undefined,
      status: nStatus, is_domino_goal: nDomino, is_wig: nWig,
      life_area: nArea || undefined, target_date: nDate || undefined,
    })
    setNTitle(''); setNProblem(''); setNSolution(''); setNStatus('aspirational')
    setNArea(''); setNDate(''); setNWig(false); setNDomino(false)
    setShowAdd(false); load()
  }

  async function handleProgressUpdate(goalId: string, progress: number) {
    await updateGoal(goalId, { progress_pct: progress })
    setEditId(null); load()
  }

  async function handleStatusChange(goalId: string, status: string) {
    await updateGoal(goalId, { status: status as Goal['status'] })
    setMenuOpen(null); load()
  }

  /* ─── Derived ─── */
  const wigGoals = goals.filter(g => g.is_wig)
  const activeGoals = showAll ? goals : goals.slice(0, 6)

  // Compute linked habits (habits whose identity_tag matches a goal's life_area)
  const linkedHabits = habits.filter(h => {
    if (!h.identity_tag) return false
    return goals.some(g => g.life_area && g.life_area.toLowerCase() === h.identity_tag?.toLowerCase())
  }).slice(0, 4)
  const displayHabits = linkedHabits.length > 0 ? linkedHabits : habits.slice(0, 4)

  // Pulse stats
  const avgProgress = goals.length > 0 ? Math.round(goals.reduce((a, g) => a + g.progress_pct, 0) / goals.length) : 0
  const integratedCount = goals.filter(g => g.status === 'integrated').length

  // Vision parsing
  const visionParts = vision.split('.')
  const visionTitle = visionParts[0] || 'Define Your Vision'
  const visionAccent = visionTitle.split(' ').pop() || ''
  const visionBase = visionTitle.replace(new RegExp(`\\s*${visionAccent}$`), '')
  const visionDesc = visionParts.slice(1).join('.').trim() || 'Set your identity statement in Settings to define your Higher Self Vision.'

  if (loading) return (
    <div className="pl-load"><Loader2 size={24} className="pl-spin" /></div>
  )

  return (
    <div className="gp">

      {/* ═══ CORE VISION ═══ */}
      <div className="gp-vision animate-fade-in">
        <div className="gp-vision-main">
          <div className="gp-vision-label">CORE VISION {new Date().getFullYear()}</div>
          <h1 className="gp-vision-title">
            {visionBase} <span>{visionAccent}</span>
          </h1>
          <p className="gp-vision-desc">{visionDesc}</p>
        </div>
        <div className="gp-attrs">
          {ATTR_ICONS.map((attr, i) => (
            <div key={i} className="gp-attr" style={{ borderColor: i === 3 ? 'rgba(229,57,53,0.2)' : undefined }}>
              <div className="gp-attr-icon" style={{ background: attr.color, color: attr.iconColor }}>
                {attr.icon}
              </div>
              <div className="gp-attr-label">{attr.label}</div>
              <div className="gp-attr-val">
                {i === 0 && (personality || ATTR_DEFAULTS[0])}
                {i === 1 && ATTR_DEFAULTS[1]}
                {i === 2 && ATTR_DEFAULTS[2]}
                {i === 3 && ATTR_DEFAULTS[3]}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ VISION & ANTI-VISION BOARD ═══ */}
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="gp-sec-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={20} style={{ color: 'var(--accent)' }} /> Higher-Self Profile & Vision Board
          </h2>
          {!isEditingVision ? (
            <button className="nav-today" onClick={() => setIsEditingVision(true)}>
              Edit Vision Board
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="sf-cancel" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setIsEditingVision(false)}>
                Cancel
              </button>
              <button className="sf-save" style={{ padding: '6px 16px', fontSize: '0.75rem', height: 'auto' }} onClick={handleSaveVision}>
                Save Board
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
          {/* Higher-Self / Vision Column */}
          <div className="card" style={{ background: 'var(--bg-surface-glass)', borderLeft: '3px solid var(--accent)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                FUTURE IDENTITY
              </div>
              {isEditingVision ? (
                <textarea 
                  className="input" 
                  rows={2} 
                  value={futureIdentity} 
                  onChange={e => setFutureIdentity(e.target.value)} 
                  placeholder="I am a highly focused builder who creates systems that..."
                  style={{ background: 'var(--bg-input)' }}
                />
              ) : (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
                  {futureIdentity || 'Define who you are becoming in settings or edit mode.'}
                </p>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                PERSONALITY TYPE / ARCHETYPE
              </div>
              {isEditingVision ? (
                <input 
                  className="input" 
                  value={archetype} 
                  onChange={e => setArchetype(e.target.value)} 
                  placeholder="INTJ / Deep Thinker / Builder"
                  style={{ background: 'var(--bg-input)' }}
                />
              ) : (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
                  {archetype || 'Set your personality archetype.'}
                </p>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                CORE VALUES & DRIVERS
              </div>
              {isEditingVision ? (
                <textarea 
                  className="input" 
                  rows={3} 
                  value={coreValues} 
                  onChange={e => setCoreValues(e.target.value)} 
                  placeholder="- Integrity: Doing perfect work even when no one watches.&#10;- Autonomy: Control over time and attention."
                  style={{ background: 'var(--bg-input)' }}
                />
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0 }}>
                  {coreValues || 'Add core values that guide your life decisions.'}
                </p>
              )}
            </div>
          </div>

          {/* Anti-Vision Column */}
          <div className="card" style={{ background: 'var(--bg-surface-glass)', borderLeft: '3px solid var(--status-danger)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--status-danger)', letterSpacing: '0.12em', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                ANTI-VISION STATEMENT
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
                Who I must NOT become: The passive consumer who reacts to distraction, lets their days drift, and fails to execute.
              </p>
            </div>

            <div>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--status-danger)', letterSpacing: '0.12em', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                TRAPS, TRIGGERS & DISTRACTIONS
              </div>
              {isEditingVision ? (
                <textarea 
                  className="input" 
                  rows={6} 
                  value={antiVisionTraps} 
                  onChange={e => setAntiVisionTraps(e.target.value)} 
                  placeholder="- Phone checking immediately after waking up.&#10;- Saying yes to low-leverage obligations.&#10;- Letting inbox dictate the daily schedule."
                  style={{ background: 'var(--bg-input)' }}
                />
              ) : (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0 }}>
                  {antiVisionTraps || 'List the traps, triggers, and bad habits that derail your progress.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ACTIVE TRAJECTORIES ═══ */}
      <div className="gp-sec-hdr animate-fade-in">
        <div>
          <h2 className="gp-sec-title">Active Trajectories</h2>
          <p className="gp-sec-sub">Prioritizing the Wildly Important Goals (WIGs)</p>
        </div>
        <button className="gp-view-all" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'SHOW LESS' : 'VIEW ALL NODES'}
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="gp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Target size={40} style={{ margin: '0 auto 12px', opacity: 0.2, color: 'var(--text-tertiary)' }}/>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No goals yet. Click + to create your first trajectory.</p>
        </div>
      ) : (
        <div className="gp-grid animate-fade-in">
          {activeGoals.map((goal, i) => {
            const st = STATUS_CFG[goal.status] || STATUS_CFG.aspirational
            const isEditing = editId === goal.id
            const proj = projects.find(p => p.id === (goal as any).project_id)
            return (
              <div key={goal.id} className="gp-card" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="gp-card-hdr">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="gp-status" style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}` }}>
                      {st.label}
                    </span>
                    {goal.is_wig && <span className="gp-wig-badge">WIG</span>}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button className="gp-card-menu" onClick={() => setMenuOpen(menuOpen === goal.id ? null : goal.id)}>
                      <MoreVertical size={14}/>
                    </button>
                    {menuOpen === goal.id && (
                      <div style={{
                        position: 'absolute', right: 0, top: '100%', zIndex: 20,
                        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                        borderRadius: '8px', padding: '6px 0', minWidth: '140px',
                        backdropFilter: 'blur(16px)',
                      }}>
                        {['aspirational','developing','integrated'].map(s => (
                          <button key={s} onClick={() => handleStatusChange(goal.id, s)}
                            style={{
                              display: 'block', width: '100%', padding: '8px 14px', background: 'none',
                              border: 'none', color: goal.status === s ? 'var(--accent)' : 'var(--text-secondary)',
                              fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left',
                              fontFamily: 'var(--font-sans)',
                            }}>
                            {STATUS_CFG[s]?.label}
                          </button>
                        ))}
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }}/>
                        <button onClick={() => { setEditId(goal.id); setEditProgress(goal.progress_pct); setMenuOpen(null) }}
                          style={{
                            display: 'block', width: '100%', padding: '8px 14px', background: 'none',
                            border: 'none', color: 'var(--text-secondary)', fontSize: '0.75rem',
                            cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
                          }}>
                          Update Progress
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="gp-card-title">{goal.title}</h3>
                {goal.problem && <p className="gp-card-desc">{goal.problem}</p>}
                {!goal.problem && goal.solution && <p className="gp-card-desc">{goal.solution}</p>}
                {goal.ai_solution && (
                  <div style={{ marginTop: '4px', marginBottom: '12px', padding: '10px 14px', background: 'rgba(150, 250, 194, 0.05)', border: '1px solid rgba(150, 250, 194, 0.15)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Sparkles size={11} /> AI Strategy & Recommendation
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>{goal.ai_solution}</p>
                  </div>
                )}
                {goal.life_area && <div className="gp-card-area">📍 {goal.life_area}</div>}

                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="range" min={0} max={100} value={editProgress}
                      onChange={e => setEditProgress(Number(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--accent)' }}/>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, minWidth: '35px' }}>{editProgress}%</span>
                    <button onClick={() => handleProgressUpdate(goal.id, editProgress)}
                      style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none',
                        borderRadius: '6px', padding: '4px 12px', fontSize: '0.6875rem',
                        fontWeight: 700, cursor: 'pointer' }}>
                      Save
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="gp-prog-bar">
                      <div className="gp-prog-fill" style={{ width: `${goal.progress_pct}%`, background: st.text }}/>
                    </div>
                    <div className="gp-prog-row">
                      <span className="gp-prog-label">PROGRESS</span>
                      <span className="gp-prog-val" style={{ color: st.text }}>{goal.progress_pct}%</span>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ GPS KINETIC ARCHITECTURE ═══ */}
      <div className="gp-flow-card animate-fade-in">
        <div className="gp-flow-title">GPS Kinetic Architecture</div>
        <div className="gp-flow-sub">Alignment Flow: Vision to Task</div>
        <div className="gp-flow-steps">
          {FLOW_STEPS.map((step, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight size={14} className="gp-flow-arrow"/>}
              <div className="gp-flow-step">
                <div className={`gp-flow-icon ${i === 0 ? 'active' : ''}`} style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                  {step.icon}
                </div>
                <span className={`gp-flow-step-label ${i === 0 ? 'active' : ''}`}>{step.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ═══ BOTTOM — Habit Stacks + Kinetic Pulse ═══ */}
      <div className="gp-bottom animate-fade-in">
        <div className="gp-habits-card">
          <div className="gp-habits-hdr">
            <span className="gp-habits-title">Integrated Habit Stacks</span>
            <span className="gp-sync-badge">Synchronized</span>
          </div>
          {displayHabits.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>No habits yet. Create habits to see them linked here.</p>
          ) : displayHabits.map(h => {
            const logs = habitLogs.filter(l => l.habit_id === h.id)
            const completed = logs.some(l => l.completed)
            return (
              <div key={h.id} className="gp-habit-row">
                <div className="gp-habit-icon"><Zap size={14}/></div>
                <div className="gp-habit-info">
                  <div className="gp-habit-name">{h.name}</div>
                  <div className="gp-habit-link">
                    {h.identity_tag ? `Linked to: ${h.identity_tag}` : h.time_of_day}
                  </div>
                </div>
                <div className="gp-habit-dots">
                  {[0,1,2,3,4].map(d => (
                    <div key={d} className={`gp-habit-dot ${d === 0 && completed ? 'filled' : d < 3 ? 'filled' : ''}`}/>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="gp-pulse-card">
          <div className="gp-pulse-icon">✦</div>
          <h3 className="gp-pulse-title">Kinetic Pulse</h3>
          <p className="gp-pulse-text">
            {avgProgress > 50
              ? `Your current momentum is ${avgProgress}% — you're in a high-efficiency phase. ${integratedCount} goal${integratedCount !== 1 ? 's' : ''} integrated.`
              : `Your average goal progress is ${avgProgress}%. Keep pushing — consistency compounds.`}
          </p>
          <button className="gp-pulse-btn">Optimize Flow</button>
        </div>
      </div>

      {/* ═══ FAB ═══ */}
      <button className="gp-fab" onClick={() => setShowAdd(true)}>
        <Plus size={22}/>
      </button>

      {/* ═══ CREATE MODAL ═══ */}
      {showAdd && (
        <div className="gp-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div className="gp-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span className="gp-modal-title">New Goal (GPS Framework)</span>
              <button onClick={() => setShowAdd(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                <X size={18}/>
              </button>
            </div>
            <form className="gp-form" onSubmit={handleAdd}>
              <input placeholder="Goal title — What do you want to achieve?" value={nTitle}
                onChange={e => setNTitle(e.target.value)} required autoFocus/>
              <textarea placeholder="Problem — What's blocking you?" rows={2} value={nProblem}
                onChange={e => setNProblem(e.target.value)}/>
              <textarea placeholder="Solution — How will you solve it?" rows={2} value={nSolution}
                onChange={e => setNSolution(e.target.value)}/>
              <div className="gp-form-row">
                <select value={nStatus} onChange={e => setNStatus(e.target.value)}>
                  <option value="aspirational">Aspirational</option>
                  <option value="developing">Developing</option>
                  <option value="integrated">Integrated</option>
                </select>
                <input placeholder="Life area (e.g. Health)" value={nArea}
                  onChange={e => setNArea(e.target.value)}/>
              </div>
              <input type="date" value={nDate} onChange={e => setNDate(e.target.value)}/>
              <div className="gp-form-checks">
                <label className="gp-form-check">
                  <input type="checkbox" checked={nWig} onChange={e => setNWig(e.target.checked)}/> WIG (Wildly Important)
                </label>
                <label className="gp-form-check">
                  <input type="checkbox" checked={nDomino} onChange={e => setNDomino(e.target.checked)}/> Domino Goal
                </label>
              </div>
              <div className="gp-form-btns">
                <button type="submit" className="gp-form-submit">Create Goal</button>
                <button type="button" className="gp-form-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
