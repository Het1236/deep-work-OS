'use client'

import {
  Sparkles, Inbox, Zap, Hourglass, CalendarDays, FolderKanban, Cloud,
  Compass, Check, ArrowRight, Loader2, Plus, X, AlertTriangle, PartyPopper,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useUser } from '@/components/UserContext'
import {
  getInbox, getWaitingFor, getSomeday, getCalendarTasks, getProjects,
  getAreas, createArea, deleteArea,
} from '@/lib/data'
import type { Task, Project, AreaOfFocus } from '@/lib/types'

function todayStr(): string { return new Date().toISOString().split('T')[0] }

type StepDef = { key: string; label: string; hint: string; href: string; icon: typeof Inbox; count?: number; warn?: boolean }

export default function WeeklyReviewPage() {
  const { userId } = useUser()
  const [loading, setLoading] = useState(true)
  const [inbox, setInbox] = useState<Task[]>([])
  const [waiting, setWaiting] = useState<Task[]>([])
  const [someday, setSomeday] = useState<Task[]>([])
  const [calendar, setCalendar] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [areas, setAreas] = useState<AreaOfFocus[]>([])
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [newArea, setNewArea] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [ib, wf, sm, cal, proj, ar] = await Promise.all([
      getInbox(userId), getWaitingFor(userId), getSomeday(userId), getCalendarTasks(userId),
      getProjects(userId), getAreas(userId),
    ])
    setInbox(ib); setWaiting(wf); setSomeday(sm); setCalendar(cal)
    setProjects(proj.filter(p => p.status === 'active' || p.status === 'upcoming'))
    setAreas(ar)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayStr()
  const projectsNeedingNA = projects.filter(p =>
    p.status === 'active' && !(p.tasks || []).some(t => t.gtd_bucket === 'next_action' && t.status !== 'done'))
  const overdue = calendar.filter(t => t.scheduled_date && t.scheduled_date < today)

  const sections: { title: string; icon: typeof Inbox; steps: StepDef[] }[] = [
    {
      title: 'Get Clear', icon: Inbox, steps: [
        { key: 'inbox', label: 'Process Inbox to zero', hint: 'Clarify every captured item — decide the next action.', href: '/gtd', icon: Inbox, count: inbox.length, warn: inbox.length > 0 },
        { key: 'collect', label: 'Collect loose notes & open loops', hint: 'Empty your head, downloads, scraps, screenshots — get it all into the system.', href: '/gtd', icon: Sparkles },
      ],
    },
    {
      title: 'Get Current', icon: Compass, steps: [
        { key: 'next', label: 'Review Next Actions', hint: 'Mark off what\'s done; is each still the real next step?', href: '/gtd', icon: Zap },
        { key: 'cal', label: 'Review Calendar (past & upcoming)', hint: 'Capture loose ends from past items; prep for what\'s coming.', href: '/gtd', icon: CalendarDays, count: overdue.length, warn: overdue.length > 0 },
        { key: 'waiting', label: 'Review Waiting-For', hint: 'Any updates received? Anything to chase?', href: '/gtd', icon: Hourglass, count: waiting.length },
        { key: 'projects', label: 'Review Projects one-by-one', hint: 'Every active project needs at least one next action.', href: '/projects', icon: FolderKanban, count: projectsNeedingNA.length, warn: projectsNeedingNA.length > 0 },
      ],
    },
    {
      title: 'Get Creative', icon: Cloud, steps: [
        { key: 'someday', label: 'Review Someday / Maybe', hint: 'Activate what\'s now compelling; delete what\'s gone stale.', href: '/gtd', icon: Cloud, count: someday.length },
        { key: 'areas', label: 'Scan your Areas of Focus', hint: 'Use each role/responsibility below as a trigger for new projects.', href: '#areas', icon: Compass },
      ],
    },
  ]

  const totalSteps = sections.reduce((n, s) => n + s.steps.length, 0)
  const doneCount = Object.values(done).filter(Boolean).length
  const allDone = doneCount >= totalSteps

  async function addArea() {
    if (!userId || !newArea.trim()) return
    await createArea({ user_id: userId, name: newArea.trim() })
    setNewArea('')
    load()
  }
  async function removeArea(id: string) { await deleteArea(id); load() }

  if (loading) {
    return <div className="wr-wrap"><div className="wr-loading"><Loader2 size={22} className="wr-spin" /> Loading review…</div><WrStyles /></div>
  }

  return (
    <div className="wr-wrap">
      <header className="wr-head">
        <h1 className="wr-title"><Sparkles size={20} /> Weekly Review</h1>
        <p className="wr-sub">The master key to a trusted system. Walk each step — get clear, get current, get creative.</p>
        <div className="wr-progress">
          <div className="wr-progress-bar"><div className="wr-progress-fill" style={{ width: `${(doneCount / totalSteps) * 100}%` }} /></div>
          <span className="wr-progress-txt">{doneCount}/{totalSteps}</span>
        </div>
      </header>

      {allDone && (
        <div className="wr-celebrate"><PartyPopper size={18} /> Review complete — your system is current and trusted. See you next week.</div>
      )}

      {sections.map(sec => {
        const SIcon = sec.icon
        return (
          <section key={sec.title} className="wr-section">
            <h2 className="wr-section-title"><SIcon size={16} /> {sec.title}</h2>
            <div className="wr-steps">
              {sec.steps.map(step => {
                const Icon = step.icon
                const checked = !!done[step.key]
                return (
                  <div key={step.key} className={`wr-step${checked ? ' wr-step--done' : ''}`}>
                    <button className={`wr-check${checked ? ' on' : ''}`} onClick={() => setDone(d => ({ ...d, [step.key]: !d[step.key] }))} aria-label="toggle">
                      {checked && <Check size={14} />}
                    </button>
                    <div className="wr-step-main">
                      <div className="wr-step-label">
                        <Icon size={14} /> {step.label}
                        {step.count != null && step.count > 0 && (
                          <span className={`wr-pill${step.warn ? ' wr-pill--warn' : ''}`}>{step.count}</span>
                        )}
                      </div>
                      <div className="wr-step-hint">{step.hint}</div>
                    </div>
                    {step.href.startsWith('#') ? (
                      <a className="wr-go" href={step.href}>Open <ArrowRight size={13} /></a>
                    ) : (
                      <Link className="wr-go" href={step.href}>Open <ArrowRight size={13} /></Link>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* Areas of Focus (Horizon 2) */}
      <section className="wr-section" id="areas">
        <h2 className="wr-section-title"><Compass size={16} /> Areas of Focus <span className="wr-h">Horizon 2 · roles & accountabilities</span></h2>
        <p className="wr-areas-intro">The hats you wear. Review them monthly as a trigger for projects you might be missing.</p>
        <div className="wr-areas">
          {areas.map(a => (
            <div key={a.id} className="wr-area">
              <span>{a.name}</span>
              <button className="wr-area-x" onClick={() => removeArea(a.id)} aria-label="delete"><X size={13} /></button>
            </div>
          ))}
          {areas.length === 0 && <span className="wr-empty">No areas yet. Add a few — e.g. Studies, Health, Finances, Family, Side projects.</span>}
        </div>
        <div className="wr-area-add">
          <input className="wr-input" value={newArea} onChange={e => setNewArea(e.target.value)}
            placeholder="Add an area of focus…" onKeyDown={e => { if (e.key === 'Enter') addArea() }} />
          <button className="wr-addbtn" onClick={addArea}><Plus size={15} /> Add</button>
        </div>
        {projectsNeedingNA.length > 0 && (
          <div className="wr-warn-note"><AlertTriangle size={14} /> {projectsNeedingNA.length} active project{projectsNeedingNA.length === 1 ? '' : 's'} missing a next action — fix during this review.</div>
        )}
      </section>

      <WrStyles />
    </div>
  )
}

function WrStyles() {
  return (
    <style jsx global>{`
      .wr-wrap { max-width: 760px; margin: 0 auto; padding: 8px 4px 64px; }
      .wr-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 56px; color: var(--text-tertiary); }
      .wr-head { margin-bottom: 22px; }
      .wr-title { display: flex; align-items: center; gap: 9px; font-size: 1.5rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em; }
      .wr-title svg { color: var(--accent); }
      .wr-sub { color: var(--text-tertiary); font-size: 0.875rem; margin-top: 4px; }
      .wr-progress { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
      .wr-progress-bar { flex: 1; height: 7px; border-radius: 4px; background: rgba(255,255,255,0.08); overflow: hidden; }
      .wr-progress-fill { height: 100%; background: var(--primary-gradient, var(--accent)); transition: width .3s ease; }
      .wr-progress-txt { font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; font-variant-numeric: tabular-nums; }

      .wr-celebrate { display: flex; align-items: center; gap: 9px; padding: 13px 16px; border-radius: 11px; margin-bottom: 20px; font-size: 0.875rem; font-weight: 500;
        color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent); }

      .wr-section { margin-bottom: 24px; }
      .wr-section-title { display: flex; align-items: center; gap: 8px; font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; }
      .wr-section-title svg { color: var(--accent); }
      .wr-h { font-size: 0.68rem; font-weight: 500; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }
      .wr-steps { display: flex; flex-direction: column; gap: 8px; }
      .wr-step { display: flex; align-items: center; gap: 12px; padding: 13px 15px; border-radius: 12px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.08)); background: var(--card-bg, rgba(255,255,255,0.02)); transition: all .15s; }
      .wr-step--done { opacity: 0.55; }
      .wr-check { width: 26px; height: 26px; flex-shrink: 0; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center;
        border: 1.5px solid var(--nav-border, rgba(255,255,255,0.18)); background: transparent; color: var(--on-accent); transition: all .15s; }
      .wr-check.on { background: var(--accent); border-color: var(--accent); }
      .wr-step-main { flex: 1; min-width: 0; }
      .wr-step-label { display: flex; align-items: center; gap: 7px; font-size: 0.875rem; font-weight: 600; color: var(--text-primary); flex-wrap: wrap; }
      .wr-step-label svg { color: var(--text-tertiary); }
      .wr-step-hint { font-size: 0.76rem; color: var(--text-tertiary); margin-top: 3px; line-height: 1.4; }
      .wr-pill { min-width: 18px; height: 18px; padding: 0 6px; border-radius: 9px; font-size: 0.68rem; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,0.1); color: var(--text-secondary); }
      .wr-pill--warn { background: color-mix(in srgb, #f5a623 22%, transparent); color: #f5a623; }
      .wr-go { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; font-size: 0.78rem; font-weight: 600; color: var(--accent); text-decoration: none;
        padding: 6px 10px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent); transition: all .15s; }
      .wr-go:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }

      .wr-areas-intro { font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 12px; }
      .wr-areas { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      .wr-area { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 9px; font-size: 0.82rem; color: var(--text-primary);
        border: 1px solid var(--nav-border, rgba(255,255,255,0.1)); background: rgba(255,255,255,0.02); }
      .wr-area-x { display: inline-flex; cursor: pointer; color: var(--text-tertiary); background: none; border: none; padding: 0; }
      .wr-area-x:hover { color: #ff6b6b; }
      .wr-empty { font-size: 0.8rem; color: var(--text-tertiary); }
      .wr-area-add { display: flex; gap: 8px; }
      .wr-input { flex: 1; padding: 9px 12px; border-radius: 9px; border: 1px solid var(--nav-border, rgba(255,255,255,0.1));
        background: var(--input-bg, rgba(0,0,0,0.18)); color: var(--text-primary); font-size: 0.85rem; outline: none; }
      .wr-input:focus { border-color: var(--accent); }
      .wr-addbtn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 9px; cursor: pointer; font-size: 0.82rem; font-weight: 600;
        background: var(--primary-gradient, var(--accent)); color: var(--on-accent); border: none; }
      .wr-warn-note { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 0.8rem; color: #f5a623; }

      .wr-spin { animation: wrspin 1s linear infinite; }
      @keyframes wrspin { to { transform: rotate(360deg); } }
    `}</style>
  )
}
