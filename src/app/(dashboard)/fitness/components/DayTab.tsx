'use client'

// Today and tomorrow, hour by hour. The timeline is derived by buildDayPlan()
// from schedule primitives — nothing here is hand-authored per day.

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2, AlertTriangle, Check, X, Sparkles, RefreshCw, Utensils,
  Moon, Sunrise, Bath, Bus, GraduationCap, Footprints, Dumbbell, BookOpen, Heart, ChevronRight,
} from 'lucide-react'
import {
  getDayPlan, getMealOptions, selectMealOption, getPrescription,
  respondToPrescription, saveReadiness, getReadinessHistory,
} from '@/lib/fitness/data'
import { logPlannedMeal } from '@/lib/fitness/data'
import type { DayPlan, TimelineBlock, MealOption, Prescription, DailyReadiness, BlockKind } from '@/lib/types'

const ICONS: Record<BlockKind, typeof Moon> = {
  sleep: Moon, wake: Sunrise, routine: Bath, travel: Bus, class: GraduationCap,
  run: Footprints, lift: Dumbbell, mobility: Heart, meal: Utensils,
  study: BookOpen, winddown: Moon,
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }
function toMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

export default function DayTab({ userId }: { userId: string }) {
  const today = useMemo(() => ymd(new Date()), [])
  const tomorrow = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d) }, [])

  const [which, setWhich] = useState<'today' | 'tomorrow'>('today')
  const [plans, setPlans] = useState<Record<string, DayPlan>>({})
  const [options, setOptions] = useState<MealOption[]>([])
  const [rx, setRx] = useState<Prescription | null>(null)
  const [readiness, setReadiness] = useState<DailyReadiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [swapping, setSwapping] = useState<TimelineBlock | null>(null)
  const [busy, setBusy] = useState(false)

  const date = which === 'today' ? today : tomorrow

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [a, b, opts, hist] = await Promise.all([
      getDayPlan(userId, today),
      getDayPlan(userId, tomorrow),
      getMealOptions(userId),
      getReadinessHistory(userId, 7),
    ])
    setPlans({ [today]: a, [tomorrow]: b })
    setOptions(opts)
    setReadiness(hist.find(h => h.date === today) ?? null)
    setRx(await getPrescription(userId, today))
    setLoading(false)
  }, [userId, today, tomorrow])

  useEffect(() => { load() }, [load])

  async function generate() {
    setBusy(true)
    try {
      const res = await fetch('/api/fitness/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, force: true }),
      })
      const j = await res.json()
      if (j.prescription) setRx(j.prescription)
    } finally { setBusy(false) }
  }

  async function respond(status: 'accepted' | 'skipped') {
    if (!rx) return
    setBusy(true)
    try { await respondToPrescription(rx.id, status); setRx({ ...rx, status }) }
    finally { setBusy(false) }
  }

  async function setReady(score: number) {
    setBusy(true)
    try {
      await saveReadiness(userId, { date: today, readiness: score })
      setReadiness(r => ({ ...(r ?? { user_id: userId, date: today, sleep_hours: null, resting_hr: null, soreness: null, note: null }), readiness: score }))
    } finally { setBusy(false) }
  }

  async function saveExtra(field: 'sleep_hours' | 'resting_hr', value: number | null) {
    await saveReadiness(userId, { date: today, readiness: readiness?.readiness ?? 3, [field]: value })
    setReadiness(r => (r ? { ...r, [field]: value } : r))
  }

  async function swapTo(option: MealOption) {
    if (!swapping?.mealPlanItemId) return
    setBusy(true)
    try { await selectMealOption(swapping.mealPlanItemId, option.id); setSwapping(null); await load() }
    finally { setBusy(false) }
  }

  async function logMeal(block: TimelineBlock) {
    const plan = plans[date]
    if (!plan || !block.mealPlanItemId) return
    const opt = options.find(o => o.title === block.title)
    setBusy(true)
    try {
      await logPlannedMeal(userId, {
        id: block.mealPlanItemId, user_id: userId, day_of_week: plan.dayOfWeek,
        slot_time: block.start, slot_label: block.meta ?? '', meal_type: 'snack',
        title: block.title, detail: block.detail ?? null,
        kcal: opt?.kcal ?? block.macros?.kcal ?? 0,
        protein_g: opt?.protein_g ?? block.macros?.protein_g ?? 0,
        carbs_g: opt?.carbs_g ?? 0, fat_g: opt?.fat_g ?? 0,
        order_index: 0, is_training: false, created_at: '',
      }, today)
    } finally { setBusy(false) }
  }

  if (loading) return <div className="ft-loading"><Loader2 size={20} className="ft-spin" /> Building your day…</div>

  const plan = plans[date]
  if (!plan) return <div className="ft-empty">Could not build a plan for this day.</div>

  const cur = nowMin()

  return (
    <div className="ft-dayview">
      <div className="ft-daytabs">
        <button className={`ft-chip${which === 'today' ? ' on' : ''}`} onClick={() => setWhich('today')}>Today</button>
        <button className={`ft-chip${which === 'tomorrow' ? ' on' : ''}`} onClick={() => setWhich('tomorrow')}>Tomorrow</button>
        <span className="ft-daydate">
          {new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* Readiness — required input, one tap */}
      {which === 'today' && (
        <div className="ft-card ft-pad">
          <h3 className="ft-card-title"><Heart size={15} /> Readiness</h3>
          <p className="ft-hint">One tap. Sleep and resting HR are optional — read them off Samsung Health when you have a moment.</p>
          <div className="ft-ready">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className={`ft-readybtn${readiness?.readiness === n ? ' on' : ''}`}
                      onClick={() => setReady(n)} disabled={busy}>{n}</button>
            ))}
          </div>
          <div className="ft-grid3" style={{ marginTop: 12, marginBottom: 0 }}>
            <label className="ft-field"><span>Sleep (h)</span>
              <input className="ft-input ft-sm ft-num" type="number" step="0.5" defaultValue={readiness?.sleep_hours ?? ''}
                     onBlur={e => saveExtra('sleep_hours', e.target.value ? Number(e.target.value) : null)} /></label>
            <label className="ft-field"><span>Resting HR</span>
              <input className="ft-input ft-sm ft-num" type="number" defaultValue={readiness?.resting_hr ?? ''}
                     onBlur={e => saveExtra('resting_hr', e.target.value ? Number(e.target.value) : null)} /></label>
          </div>
        </div>
      )}

      {/* Prescription — proposed, never applied automatically */}
      {which === 'today' && (
        <div className="ft-card ft-pad ft-rx">
          <div className="ft-card-head">
            <h3 className="ft-card-title"><Sparkles size={15} /> Today&apos;s proposal</h3>
            <button className="ft-btn ft-btn--ghost ft-tiny" onClick={generate} disabled={busy}>
              {busy ? <Loader2 size={13} className="ft-spin" /> : <RefreshCw size={13} />} Recalculate
            </button>
          </div>
          {rx ? (
            <>
              <div className="ft-rx-title">{rx.session.title}</div>
              <div className="ft-rx-meta">
                {rx.session.distanceKm ? `${rx.session.distanceKm} km · ` : ''}
                {rx.session.hrRange ?? rx.session.paceRange ?? ''}
                {rx.session.exercises ? `${rx.session.exercises.length} exercises` : ''}
              </div>
              <p className="ft-rx-why">{rx.reasoning}</p>
              {rx.flags.length > 0 && (
                <div className="ft-rx-flags">
                  {rx.flags.map(f => <span key={f} className="ft-flag">{f.replace(/_/g, ' ')}</span>)}
                </div>
              )}
              <div className="ft-rx-foot">
                <span className="ft-rx-inputs">
                  {rx.inputs_used.length > 0
                    ? `Based on: ${rx.inputs_used.map(i => i.replace(/_/g, ' ')).join(', ')}`
                    : 'No data inputs yet — this is the plan as written.'}
                </span>
                {rx.status === 'proposed' ? (
                  <div className="ft-rx-actions">
                    <button className="ft-btn" onClick={() => respond('skipped')} disabled={busy}><X size={14} /> Skip</button>
                    <button className="ft-btn ft-btn--accent" onClick={() => respond('accepted')} disabled={busy}><Check size={14} /> Accept</button>
                  </div>
                ) : (
                  <span className={`ft-rx-status ft-rx-status--${rx.status}`}>{rx.status}</span>
                )}
              </div>
            </>
          ) : (
            <p className="ft-hint" style={{ marginBottom: 0 }}>
              No proposal yet. Hit Recalculate to generate one from your current load, zones and readiness.
            </p>
          )}
        </div>
      )}

      {plan.warnings.length > 0 && (
        <div className="ft-warns">
          {plan.warnings.map((w, i) => (
            <div key={i} className="ft-warn"><AlertTriangle size={14} /> <span>{w}</span></div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="ft-card">
        <div className="ft-tl">
          {plan.blocks.map((b, i) => {
            const Icon = ICONS[b.kind] ?? BookOpen
            const isNow = which === 'today' && cur >= toMin(b.start) && cur < toMin(b.end)
            return (
              <div key={i} className={`ft-tlrow ft-tlrow--${b.kind}${isNow ? ' ft-tlrow--now' : ''}`}>
                <div className="ft-tltime">{b.start}<span>{b.end}</span></div>
                <div className="ft-tlicon"><Icon size={14} /></div>
                <div className="ft-tlbody">
                  <div className="ft-tltitle">
                    {b.title}
                    {isNow && <span className="ft-nowtag">now</span>}
                  </div>
                  {b.meta && <div className="ft-tlmeta">{b.meta}</div>}
                  {b.detail && <div className="ft-tldetail">{b.detail}</div>}
                  {b.macros && (
                    <div className="ft-tlmacros">{b.macros.kcal} kcal · <b>{Math.round(b.macros.protein_g)} g P</b></div>
                  )}
                  {b.conflict && <div className="ft-tlconflict"><AlertTriangle size={12} /> {b.conflict}</div>}
                </div>
                {b.kind === 'meal' && (
                  <div className="ft-tlactions">
                    <button className="ft-mini" onClick={() => setSwapping(b)} title="Swap meal"><ChevronRight size={14} /></button>
                    {which === 'today' && (
                      <button className="ft-mini" onClick={() => logMeal(b)} disabled={busy} title="Log this meal"><Utensils size={13} /></button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="ft-daytotals">
        <div><b>{plan.totals.kcal.toLocaleString()}</b><span>kcal planned</span></div>
        <div><b>{plan.totals.protein_g} g</b><span>protein planned</span></div>
        <div><b>{plan.blocks.filter(b => b.kind === 'class').length}</b><span>lectures</span></div>
      </div>

      {swapping && (
        <MealSwap
          block={swapping}
          options={options}
          onPick={swapTo}
          onClose={() => setSwapping(null)}
        />
      )}
    </div>
  )
}

// Meals change here and nowhere else. The coach has no write access to this.
function MealSwap({ block, options, onPick, onClose }: {
  block: TimelineBlock; options: MealOption[]; onPick: (o: MealOption) => void; onClose: () => void
}) {
  const current = options.find(o => o.title === block.title)
  const pool = options.filter(o => !current || o.category === current.category)

  return (
    <div className="ft-sheet-back" onClick={onClose}>
      <div className="ft-sheet" onClick={e => e.stopPropagation()}>
        <div className="ft-sheet-top">
          <div>
            <h3>Swap {block.meta ?? 'meal'}</h3>
            <span>Currently: {block.title}</span>
          </div>
          <button className="ft-mini" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="ft-hint">Your choice sticks until you change it again. Nothing rotates on its own.</p>
        <div className="ft-sheet-body">
          {pool.map(o => (
            <button key={o.id} className={`ft-optrow${o.title === block.title ? ' on' : ''}`} onClick={() => onPick(o)}>
              <div>
                <div className="ft-optname">{o.title}</div>
                {o.detail && <div className="ft-optdetail">{o.detail}</div>}
                <div className="ft-optmacros">{o.kcal} kcal · <b>{o.protein_g} g P</b> · {o.carbs_g} C · {o.fat_g} F</div>
                {o.tags.length > 0 && (
                  <div className="ft-opttags">{o.tags.map(t => <span key={t}>{t.replace(/_/g, ' ')}</span>)}</div>
                )}
              </div>
              {o.title === block.title ? <Check size={16} /> : <ChevronRight size={16} />}
            </button>
          ))}
          {pool.length === 0 && <div className="ft-empty">No alternatives in this category yet.</div>}
        </div>
      </div>
    </div>
  )
}
