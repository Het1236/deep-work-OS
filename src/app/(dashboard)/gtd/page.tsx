'use client'

import {
  Inbox, Zap, Hourglass, CalendarDays, Cloud, FileText, Trash2,
  Check, ArrowRight, Loader2, Sparkles, Pencil, FolderPlus, Battery, BatteryLow, Compass,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useUser } from '@/components/UserContext'
import {
  getInbox, getNextActions, getWaitingFor, getCalendarTasks, getSomeday, getReference,
  getContexts, ensureSeedContexts, clarifyTask, updateTaskStatus, deleteTask,
  createProject, getProjects,
} from '@/lib/data'
import type { Task, GtdContext, Project, GtdBucket } from '@/lib/types'

type Tab = 'clarify' | 'engage' | 'next_action' | 'waiting_for' | 'calendar' | 'someday' | 'reference'

const TABS: { key: Tab; label: string; icon: typeof Inbox; bucket?: GtdBucket }[] = [
  { key: 'clarify', label: 'Clarify', icon: Inbox, bucket: 'inbox' },
  { key: 'engage', label: 'Engage', icon: Compass },
  { key: 'next_action', label: 'Next Actions', icon: Zap, bucket: 'next_action' },
  { key: 'waiting_for', label: 'Waiting For', icon: Hourglass, bucket: 'waiting_for' },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays, bucket: 'calendar' },
  { key: 'someday', label: 'Someday', icon: Cloud, bucket: 'someday' },
  { key: 'reference', label: 'Reference', icon: FileText, bucket: 'reference' },
]

function todayStr(): string { return new Date().toISOString().split('T')[0] }
function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export default function GtdPage() {
  const { userId } = useUser()
  const [tab, setTab] = useState<Tab>('clarify')
  const [loading, setLoading] = useState(true)
  const [contexts, setContexts] = useState<GtdContext[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  // bucket data
  const [inbox, setInbox] = useState<Task[]>([])
  const [nextActions, setNextActions] = useState<Task[]>([])
  const [waiting, setWaiting] = useState<Task[]>([])
  const [calendar, setCalendar] = useState<Task[]>([])
  const [someday, setSomeday] = useState<Task[]>([])
  const [reference, setReference] = useState<Task[]>([])

  const counts: Record<Tab, number> = {
    clarify: inbox.length, engage: 0, next_action: nextActions.length, waiting_for: waiting.length,
    calendar: calendar.length, someday: someday.length, reference: reference.length,
  }

  const loadAll = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [ib, na, wf, cal, sm, ref, ctx, proj] = await Promise.all([
      getInbox(userId), getNextActions(userId), getWaitingFor(userId), getCalendarTasks(userId),
      getSomeday(userId), getReference(userId), ensureSeedContexts(userId), getProjects(userId),
    ])
    setInbox(ib); setNextActions(na); setWaiting(wf); setCalendar(cal)
    setSomeday(sm); setReference(ref); setContexts(ctx)
    setProjects(proj.filter(p => p.status !== 'archived' && p.status !== 'done'))
    setLoading(false)
  }, [userId])

  useEffect(() => { loadAll() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="gtd-wrap">
      <header className="gtd-head">
        <div>
          <h1 className="gtd-title"><Sparkles size={20} /> GTD Workspace</h1>
          <p className="gtd-sub">Capture → Clarify → Organize → Engage. Process your inbox to zero, one item at a time.</p>
        </div>
        <Link href="/gtd/review" className="gtd-review-link"><Compass size={15} /> Weekly Review</Link>
      </header>

      <nav className="gtd-tabs">
        {TABS.map(t => {
          const Icon = t.icon
          const n = counts[t.key]
          return (
            <button key={t.key} className={`gtd-tab${tab === t.key ? ' gtd-tab--active' : ''}`} onClick={() => setTab(t.key)}>
              <Icon size={15} />
              <span>{t.label}</span>
              {n > 0 && <span className={`gtd-count${t.key === 'clarify' ? ' gtd-count--hot' : ''}`}>{n}</span>}
            </button>
          )
        })}
      </nav>

      {loading ? (
        <div className="gtd-loading"><Loader2 size={22} className="spin" /> Loading…</div>
      ) : tab === 'clarify' ? (
        <ClarifyWizard item={inbox[0] ?? null} total={inbox.length} contexts={contexts} onChanged={loadAll} />
      ) : tab === 'engage' ? (
        <EngageView tasks={nextActions} contexts={contexts} onChanged={loadAll} />
      ) : (
        <BucketList
          tab={tab}
          tasks={{ next_action: nextActions, waiting_for: waiting, calendar, someday, reference }[tab]}
          contexts={contexts}
          onChanged={loadAll}
        />
      )}

      <GtdStyles />
    </div>
  )
}

// ─────────────────────────── Clarify Wizard ───────────────────────────
// Walks the GTD decision tree on the top inbox item, to zero.
function ClarifyWizard({ item, total, contexts, onChanged }: {
  item: Task | null; total: number; contexts: GtdContext[]; onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [actionable, setActionable] = useState<boolean | null>(null)
  // next-action form
  const [ctxId, setCtxId] = useState<string>('')
  const [energy, setEnergy] = useState<'high' | 'low' | ''>('')
  const [mins, setMins] = useState<string>('')
  // delegate / schedule
  const [who, setWho] = useState('')
  const [schedDate, setSchedDate] = useState(todayStr())

  // reset the form whenever a new item surfaces
  useEffect(() => {
    setTitle(item?.title ?? ''); setActionable(null)
    setCtxId(''); setEnergy(''); setMins(''); setWho(''); setSchedDate(todayStr())
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) {
    return (
      <div className="gtd-empty gtd-zero">
        <div className="gtd-zero-badge"><Check size={30} /></div>
        <h2>Inbox zero 🎉</h2>
        <p>Nothing left to clarify. Mind like water — go engage your <strong>Next Actions</strong>.</p>
      </div>
    )
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try { await fn(); onChanged() } finally { setBusy(false) }
  }

  const id = item.id
  const titleChanged = title.trim() && title.trim() !== item.title

  // disposition handlers
  const doNow = () => run(async () => {
    if (titleChanged) await clarifyTask(id, { gtd_bucket: 'next_action', title: title.trim() })
    await updateTaskStatus(id, 'done')
  })
  const toNextAction = () => run(() => clarifyTask(id, {
    gtd_bucket: 'next_action',
    title: title.trim() || item.title,
    context_id: ctxId || null,
    energy_level: energy || null,
    time_estimate_minutes: mins ? parseInt(mins, 10) : null,
  }))
  const toWaiting = () => run(() => clarifyTask(id, {
    gtd_bucket: 'waiting_for', title: title.trim() || item.title, waiting_for_who: who.trim() || null,
  }))
  const toCalendar = () => run(() => clarifyTask(id, {
    gtd_bucket: 'calendar', title: title.trim() || item.title, scheduled_date: schedDate,
  }))
  const toSomeday = () => run(() => clarifyTask(id, { gtd_bucket: 'someday', title: title.trim() || item.title }))
  const toReference = () => run(() => clarifyTask(id, { gtd_bucket: 'reference', title: title.trim() || item.title }))
  const toTrash = () => run(() => deleteTask(id))
  const toProject = () => run(async () => {
    const proj = await createProject({ user_id: item.user_id, title: title.trim() || item.title, status: 'active' })
    await clarifyTask(id, { gtd_bucket: 'next_action', project_id: (proj as Project).id, title: title.trim() || item.title })
  })

  return (
    <div className="gtd-clarify">
      <div className="gtd-clarify-progress">{total} item{total === 1 ? '' : 's'} left in inbox</div>

      <div className="gtd-card gtd-clarify-card">
        <label className="gtd-field-label"><Pencil size={13} /> What is it? <span>(clarify the wording)</span></label>
        <input className="gtd-input gtd-title-input" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Describe the item…" />

        <div className="gtd-q">Is it actionable?</div>
        <div className="gtd-seg">
          <button className={`gtd-segbtn${actionable === true ? ' on' : ''}`} onClick={() => setActionable(true)}>Yes — there's something to do</button>
          <button className={`gtd-segbtn${actionable === false ? ' on' : ''}`} onClick={() => setActionable(false)}>No</button>
        </div>

        {actionable === false && (
          <div className="gtd-branch">
            <p className="gtd-hint">Not actionable — file it or let it go.</p>
            <div className="gtd-actions">
              <button className="gtd-btn" disabled={busy} onClick={toSomeday}><Cloud size={15} /> Someday / Maybe</button>
              <button className="gtd-btn" disabled={busy} onClick={toReference}><FileText size={15} /> Reference</button>
              <button className="gtd-btn gtd-btn--danger" disabled={busy} onClick={toTrash}><Trash2 size={15} /> Trash</button>
            </div>
          </div>
        )}

        {actionable === true && (
          <div className="gtd-branch">
            <p className="gtd-hint">What&apos;s the very next <strong>physical</strong> action? (Call X, Email Y, Buy Z…) Refine the title above, then choose:</p>

            <div className="gtd-2min">
              <button className="gtd-btn gtd-btn--accent" disabled={busy} onClick={doNow}>
                <Zap size={15} /> Do it now <span className="gtd-2min-tag">2-min rule</span>
              </button>
            </div>

            <div className="gtd-disp-grid">
              {/* Next Action */}
              <div className="gtd-disp">
                <div className="gtd-disp-h"><Zap size={14} /> Defer → Next Action</div>
                <div className="gtd-disp-row">
                  <select className="gtd-input gtd-sm" value={ctxId} onChange={e => setCtxId(e.target.value)}>
                    <option value="">Context…</option>
                    {contexts.map(c => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
                  </select>
                  <div className="gtd-energy">
                    <button type="button" className={`gtd-chip${energy === 'high' ? ' on' : ''}`} onClick={() => setEnergy(energy === 'high' ? '' : 'high')}><Battery size={13} /> High</button>
                    <button type="button" className={`gtd-chip${energy === 'low' ? ' on' : ''}`} onClick={() => setEnergy(energy === 'low' ? '' : 'low')}><BatteryLow size={13} /> Low</button>
                  </div>
                  <input className="gtd-input gtd-sm gtd-mins" type="number" min="1" placeholder="min" value={mins} onChange={e => setMins(e.target.value)} />
                </div>
                <button className="gtd-btn gtd-btn--full" disabled={busy} onClick={toNextAction}><ArrowRight size={15} /> File as Next Action</button>
              </div>

              {/* Delegate */}
              <div className="gtd-disp">
                <div className="gtd-disp-h"><Hourglass size={14} /> Delegate → Waiting For</div>
                <input className="gtd-input gtd-sm gtd-full" placeholder="Waiting on who?" value={who} onChange={e => setWho(e.target.value)} />
                <button className="gtd-btn gtd-btn--full" disabled={busy} onClick={toWaiting}><ArrowRight size={15} /> Move to Waiting</button>
              </div>

              {/* Calendar */}
              <div className="gtd-disp">
                <div className="gtd-disp-h"><CalendarDays size={14} /> Defer → Calendar (time-fixed)</div>
                <input className="gtd-input gtd-sm gtd-full" type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} />
                <button className="gtd-btn gtd-btn--full" disabled={busy} onClick={toCalendar}><ArrowRight size={15} /> Schedule it</button>
              </div>

              {/* Project */}
              <div className="gtd-disp">
                <div className="gtd-disp-h"><FolderPlus size={14} /> Multi-step? → Project</div>
                <p className="gtd-disp-note">More than one action → make it a project. This becomes its first next action.</p>
                <button className="gtd-btn gtd-btn--full" disabled={busy} onClick={toProject}><FolderPlus size={15} /> Create project</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────── Engage ───────────────────────────
// "What do I do right now?" — GTD's 4-criteria filter over Next Actions.
const TIME_BUCKETS: { label: string; max: number | null }[] = [
  { label: 'Any time', max: null },
  { label: '≤ 2 min', max: 2 },
  { label: '≤ 15 min', max: 15 },
  { label: '≤ 60 min', max: 60 },
]
function EngageView({ tasks, contexts, onChanged }: {
  tasks: Task[]; contexts: GtdContext[]; onChanged: () => void
}) {
  const [ctxId, setCtxId] = useState('')
  const [energy, setEnergy] = useState<'high' | 'low' | ''>('')
  const [timeIdx, setTimeIdx] = useState(0)

  const maxMin = TIME_BUCKETS[timeIdx].max
  const filtered = tasks.filter(t =>
    (!ctxId || t.context_id === ctxId) &&
    (!energy || t.energy_level === energy) &&
    (maxMin == null || (t.time_estimate_minutes != null && t.time_estimate_minutes <= maxMin))
  )
  const twoMin = tasks.filter(t => t.time_estimate_minutes != null && t.time_estimate_minutes <= 2)

  return (
    <div className="gtd-engage">
      <p className="gtd-engage-intro"><Compass size={15} /> Narrow by your current <strong>context</strong>, <strong>energy</strong>, and <strong>time available</strong> — then just do the top one.</p>

      <div className="gtd-filters">
        <div className="gtd-filter">
          <span className="gtd-filter-label">Context</span>
          <div className="gtd-filter-row">
            <button className={`gtd-fchip${ctxId === '' ? ' on' : ''}`} onClick={() => setCtxId('')}>All</button>
            {contexts.map(c => (
              <button key={c.id} className={`gtd-fchip${ctxId === c.id ? ' on' : ''}`} onClick={() => setCtxId(ctxId === c.id ? '' : c.id)}>
                {c.emoji ? `${c.emoji} ` : ''}{c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="gtd-filter">
          <span className="gtd-filter-label">Energy</span>
          <div className="gtd-filter-row">
            <button className={`gtd-fchip${energy === '' ? ' on' : ''}`} onClick={() => setEnergy('')}>Any</button>
            <button className={`gtd-fchip${energy === 'high' ? ' on' : ''}`} onClick={() => setEnergy(energy === 'high' ? '' : 'high')}>🔋 High</button>
            <button className={`gtd-fchip${energy === 'low' ? ' on' : ''}`} onClick={() => setEnergy(energy === 'low' ? '' : 'low')}>🪫 Low</button>
          </div>
        </div>
        <div className="gtd-filter">
          <span className="gtd-filter-label">Time available</span>
          <div className="gtd-filter-row">
            {TIME_BUCKETS.map((b, i) => (
              <button key={b.label} className={`gtd-fchip${timeIdx === i ? ' on' : ''}`} onClick={() => setTimeIdx(i)}>{b.label}</button>
            ))}
          </div>
        </div>
      </div>

      {twoMin.length > 0 && (
        <div className="gtd-2min-callout">
          <Zap size={15} /> <strong>{twoMin.length}</strong> two-minute item{twoMin.length === 1 ? '' : 's'} — knock these out now.
        </div>
      )}

      <BucketList tab="next_action" tasks={filtered} contexts={contexts} onChanged={onChanged} />
    </div>
  )
}

// ─────────────────────────── Bucket Lists ───────────────────────────
function BucketList({ tab, tasks, contexts, onChanged }: {
  tab: Tab; tasks: Task[]; contexts: GtdContext[]; onChanged: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const ctxName = (id: string | null) => {
    const c = contexts.find(x => x.id === id)
    return c ? `${c.emoji ? c.emoji + ' ' : ''}${c.name}` : null
  }
  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id)
    try { await fn(); onChanged() } finally { setBusyId(null) }
  }

  if (tasks.length === 0) {
    const blurb: Record<string, string> = {
      next_action: 'No next actions yet. Clarify your inbox to populate this list.',
      waiting_for: 'Nothing delegated or pending. You\'re not waiting on anyone.',
      calendar: 'No time-fixed items scheduled.',
      someday: 'No someday/maybe items. Park future ideas here without commitment.',
      reference: 'No reference notes filed.',
    }
    return <div className="gtd-empty">{blurb[tab]}</div>
  }

  return (
    <div className="gtd-list">
      {tasks.map(t => {
        const busy = busyId === t.id
        const wDays = daysSince(t.waiting_since)
        return (
          <div key={t.id} className="gtd-card gtd-row">
            <div className="gtd-row-main">
              <div className="gtd-row-title">{t.title}</div>
              <div className="gtd-row-meta">
                {tab === 'next_action' && ctxName(t.context_id) && <span className="gtd-tag">{ctxName(t.context_id)}</span>}
                {tab === 'next_action' && t.energy_level && <span className="gtd-tag">{t.energy_level === 'high' ? '🔋 High' : '🪫 Low'} energy</span>}
                {tab === 'next_action' && t.time_estimate_minutes != null && <span className="gtd-tag">~{t.time_estimate_minutes}m</span>}
                {tab === 'waiting_for' && t.waiting_for_who && <span className="gtd-tag">⏳ {t.waiting_for_who}</span>}
                {tab === 'waiting_for' && wDays != null && <span className={`gtd-tag${wDays >= 3 ? ' gtd-tag--warn' : ''}`}>{wDays}d waiting</span>}
                {tab === 'calendar' && t.scheduled_date && <span className="gtd-tag">📅 {t.scheduled_date}</span>}
              </div>
            </div>
            <div className="gtd-row-actions">
              {tab === 'someday' ? (
                <>
                  <button className="gtd-mini" disabled={busy} title="Activate as Next Action"
                    onClick={() => act(t.id, () => clarifyTask(t.id, { gtd_bucket: 'next_action' }))}><Zap size={14} /></button>
                  <button className="gtd-mini gtd-mini--danger" disabled={busy} title="Delete"
                    onClick={() => act(t.id, () => deleteTask(t.id))}><Trash2 size={14} /></button>
                </>
              ) : tab === 'reference' ? (
                <button className="gtd-mini gtd-mini--danger" disabled={busy} title="Delete"
                  onClick={() => act(t.id, () => deleteTask(t.id))}><Trash2 size={14} /></button>
              ) : tab === 'waiting_for' ? (
                <>
                  <button className="gtd-mini" disabled={busy} title="Unblock → Next Action"
                    onClick={() => act(t.id, () => clarifyTask(t.id, { gtd_bucket: 'next_action', waiting_for_who: null, waiting_since: null }))}><Zap size={14} /></button>
                  <button className="gtd-mini gtd-mini--done" disabled={busy} title="Done"
                    onClick={() => act(t.id, () => updateTaskStatus(t.id, 'done'))}><Check size={14} /></button>
                </>
              ) : (
                <button className="gtd-mini gtd-mini--done" disabled={busy} title="Done"
                  onClick={() => act(t.id, () => updateTaskStatus(t.id, 'done'))}>
                  {busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────── Styles ───────────────────────────
function GtdStyles() {
  return (
    <style jsx global>{`
      .gtd-wrap { max-width: 920px; margin: 0 auto; padding: 8px 4px 64px; }
      .gtd-head { margin-bottom: 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .gtd-review-link { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; padding: 8px 14px; border-radius: 10px; text-decoration: none;
        font-size: 0.8125rem; font-weight: 600; color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent);
        background: color-mix(in srgb, var(--accent) 9%, transparent); transition: all .15s; }
      .gtd-review-link:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); }
      .gtd-title { display: flex; align-items: center; gap: 9px; font-size: 1.5rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em; }
      .gtd-title svg { color: var(--accent); }
      .gtd-sub { color: var(--text-tertiary); font-size: 0.875rem; margin-top: 4px; }

      .gtd-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px; }
      .gtd-tab { display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 10px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.08)); background: var(--card-bg, rgba(255,255,255,0.02));
        color: var(--text-tertiary); font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all .18s ease; }
      .gtd-tab:hover { color: var(--text-secondary); background: rgba(255,255,255,0.04); }
      .gtd-tab--active { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 30%, transparent);
        background: color-mix(in srgb, var(--accent) 12%, transparent); font-weight: 600; }
      .gtd-count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font-size: 0.6875rem; font-weight: 700;
        display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); color: var(--text-secondary); }
      .gtd-count--hot { background: var(--primary-gradient, var(--accent)); color: var(--on-accent); }

      .gtd-loading, .gtd-empty { display: flex; align-items: center; justify-content: center; gap: 10px;
        padding: 56px 20px; color: var(--text-tertiary); font-size: 0.9rem; text-align: center; }
      .gtd-empty { flex-direction: column; }

      .gtd-card { background: var(--card-bg, rgba(255,255,255,0.025)); border: 1px solid var(--nav-border, rgba(255,255,255,0.08));
        border-radius: 14px; }

      /* Clarify */
      .gtd-clarify-progress { font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
      .gtd-clarify-card { padding: 22px; }
      .gtd-field-label { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--text-tertiary); font-weight: 600; margin-bottom: 7px; }
      .gtd-field-label span { color: var(--text-tertiary); opacity: 0.7; font-weight: 400; }
      .gtd-input { width: 100%; padding: 10px 12px; border-radius: 9px; border: 1px solid var(--nav-border, rgba(255,255,255,0.1));
        background: var(--input-bg, rgba(0,0,0,0.18)); color: var(--text-primary); font-size: 0.9rem; outline: none; }
      .gtd-input:focus { border-color: var(--accent); }
      .gtd-title-input { font-size: 1.05rem; font-weight: 600; }
      .gtd-q { margin: 18px 0 9px; font-size: 0.95rem; font-weight: 600; color: var(--text-primary); }
      .gtd-seg { display: flex; gap: 8px; flex-wrap: wrap; }
      .gtd-segbtn { flex: 1; min-width: 140px; padding: 11px 14px; border-radius: 10px; cursor: pointer; font-size: 0.85rem; font-weight: 500;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.1)); background: rgba(255,255,255,0.02); color: var(--text-secondary); transition: all .15s; }
      .gtd-segbtn:hover { background: rgba(255,255,255,0.05); }
      .gtd-segbtn.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); font-weight: 600; }

      .gtd-branch { margin-top: 18px; padding-top: 16px; border-top: 1px dashed var(--nav-border, rgba(255,255,255,0.1)); }
      .gtd-hint { font-size: 0.83rem; color: var(--text-tertiary); margin-bottom: 14px; line-height: 1.45; }
      .gtd-actions { display: flex; gap: 8px; flex-wrap: wrap; }

      .gtd-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 9px; cursor: pointer;
        font-size: 0.83rem; font-weight: 600; border: 1px solid var(--nav-border, rgba(255,255,255,0.12));
        background: rgba(255,255,255,0.03); color: var(--text-secondary); transition: all .15s; }
      .gtd-btn:hover:not(:disabled) { background: rgba(255,255,255,0.07); color: var(--text-primary); }
      .gtd-btn:disabled { opacity: 0.5; cursor: default; }
      .gtd-btn--full { width: 100%; justify-content: center; margin-top: auto; }
      .gtd-btn--accent { background: var(--primary-gradient, var(--accent)); color: var(--on-accent); border: none; }
      .gtd-btn--danger:hover:not(:disabled) { color: #ff6b6b; border-color: color-mix(in srgb, #ff6b6b 40%, transparent); }

      .gtd-2min { margin-bottom: 16px; }
      .gtd-2min-tag { font-size: 0.65rem; padding: 2px 6px; border-radius: 6px; background: rgba(0,0,0,0.2); color: var(--on-accent); opacity: 0.85; font-weight: 700; }

      .gtd-disp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      @media (max-width: 640px) { .gtd-disp-grid { grid-template-columns: 1fr; } }
      .gtd-disp { display: flex; flex-direction: column; gap: 8px; padding: 13px; border-radius: 11px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.07)); background: rgba(255,255,255,0.015); }
      .gtd-disp-h { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 600; color: var(--text-primary); }
      .gtd-disp-h svg { color: var(--accent); }
      .gtd-disp-note { font-size: 0.74rem; color: var(--text-tertiary); line-height: 1.4; }
      .gtd-disp-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
      .gtd-sm { padding: 7px 9px; font-size: 0.8rem; }
      .gtd-full { width: 100%; }
      .gtd-mins { width: 70px; }
      .gtd-energy { display: flex; gap: 4px; }
      .gtd-chip { display: inline-flex; align-items: center; gap: 4px; padding: 6px 9px; border-radius: 8px; cursor: pointer; font-size: 0.74rem;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.1)); background: rgba(255,255,255,0.02); color: var(--text-tertiary); }
      .gtd-chip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }

      /* Engage */
      .gtd-engage-intro { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-tertiary); margin-bottom: 16px; line-height: 1.4; }
      .gtd-engage-intro svg { color: var(--accent); flex-shrink: 0; }
      .gtd-filters { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; padding: 15px; border-radius: 13px;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.07)); background: rgba(255,255,255,0.015); }
      .gtd-filter-label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; color: var(--text-tertiary); margin-bottom: 7px; }
      .gtd-filter-row { display: flex; gap: 6px; flex-wrap: wrap; }
      .gtd-fchip { padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 0.78rem; font-weight: 500;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.1)); background: rgba(255,255,255,0.02); color: var(--text-tertiary); transition: all .15s; }
      .gtd-fchip:hover { background: rgba(255,255,255,0.05); color: var(--text-secondary); }
      .gtd-fchip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); font-weight: 600; }
      .gtd-2min-callout { display: flex; align-items: center; gap: 8px; padding: 11px 15px; border-radius: 10px; margin-bottom: 14px; font-size: 0.83rem;
        color: var(--accent); background: color-mix(in srgb, var(--accent) 11%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent); }

      /* Lists */
      .gtd-list { display: flex; flex-direction: column; gap: 8px; }
      .gtd-row { display: flex; align-items: center; gap: 12px; padding: 13px 15px; }
      .gtd-row-main { flex: 1; min-width: 0; }
      .gtd-row-title { font-size: 0.9rem; color: var(--text-primary); font-weight: 500; }
      .gtd-row-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
      .gtd-tag { font-size: 0.68rem; padding: 2px 7px; border-radius: 6px; background: rgba(255,255,255,0.06); color: var(--text-tertiary); font-weight: 500; }
      .gtd-tag--warn { background: color-mix(in srgb, #f5a623 22%, transparent); color: #f5a623; }
      .gtd-row-actions { display: flex; gap: 6px; flex-shrink: 0; }
      .gtd-mini { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
        border: 1px solid var(--nav-border, rgba(255,255,255,0.1)); background: rgba(255,255,255,0.02); color: var(--text-tertiary); transition: all .15s; }
      .gtd-mini:hover:not(:disabled) { background: rgba(255,255,255,0.07); color: var(--text-primary); }
      .gtd-mini--done:hover:not(:disabled) { color: #34d399; border-color: color-mix(in srgb, #34d399 40%, transparent); }
      .gtd-mini--danger:hover:not(:disabled) { color: #ff6b6b; border-color: color-mix(in srgb, #ff6b6b 40%, transparent); }

      /* Inbox zero */
      .gtd-zero { padding: 64px 20px; }
      .gtd-zero-badge { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); margin-bottom: 8px; }
      .gtd-zero h2 { font-size: 1.3rem; color: var(--text-primary); font-weight: 700; }
      .gtd-zero p { max-width: 360px; line-height: 1.5; }

      .spin { animation: gtdspin 1s linear infinite; }
      @keyframes gtdspin { to { transform: rotate(360deg); } }
    `}</style>
  )
}
