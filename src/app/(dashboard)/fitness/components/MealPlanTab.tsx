'use client'

// The weekly meal plan, one tap to log a slot into `meals`.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Check, Loader2, Flame, Utensils, Dumbbell, Pencil, Trash2, Plus, X } from 'lucide-react'
import { getMealPlan, logPlannedMeal, updateMealPlanItem, deleteMealPlanItem, createMealPlanItem } from '@/lib/fitness/data'
import { getMealsForDate } from '@/lib/data'
import { localYmd } from '@/lib/nutrition'
import type { MealPlanItem, NutritionTargets, Meal } from '@/lib/types'

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function todayDow() { return (new Date().getDay() + 6) % 7 }

export default function MealPlanTab({
  userId, targets, onLogged,
}: {
  userId: string; targets: NutritionTargets | null; onLogged: () => void
}) {
  const [items, setItems] = useState<MealPlanItem[]>([])
  const [logged, setLogged] = useState<Meal[]>([])
  const [day, setDay] = useState(todayDow())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [plan, meals] = await Promise.all([getMealPlan(userId), getMealsForDate(userId, localYmd())])
    setItems(plan)
    setLogged(meals)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const dayItems = useMemo(
    () => items.filter(i => i.day_of_week === day).sort((a, b) => a.order_index - b.order_index),
    [items, day])

  const totals = useMemo(() => dayItems.reduce((t, i) => ({
    kcal: t.kcal + i.kcal,
    p: t.p + Number(i.protein_g),
    c: t.c + Number(i.carbs_g),
    f: t.f + Number(i.fat_g),
  }), { kcal: 0, p: 0, c: 0, f: 0 }), [dayItems])

  // A slot counts as logged when a meal with the same name exists today.
  const loggedNames = useMemo(() => new Set(logged.map(m => m.name)), [logged])
  const isToday = day === todayDow()

  async function logItem(item: MealPlanItem) {
    setBusy(item.id)
    try {
      await logPlannedMeal(userId, item, localYmd())
      await load()
      onLogged()
    } finally { setBusy(null) }
  }

  async function patch(item: MealPlanItem, updates: Partial<MealPlanItem>) {
    await updateMealPlanItem(item.id, updates)
    load()
  }
  async function remove(item: MealPlanItem) {
    if (!confirm(`Delete "${item.title}" from ${SHORT[item.day_of_week]}?`)) return
    await deleteMealPlanItem(item.id)
    load()
  }
  async function addSlot(form: Partial<MealPlanItem>) {
    await createMealPlanItem(userId, { ...form, day_of_week: day, order_index: dayItems.length })
    setAdding(false)
    load()
  }

  if (loading) return <div className="ft-loading"><Loader2 size={20} className="ft-spin" /> Loading plan…</div>

  return (
    <div className="ft-plan">
      <div className="ft-week ft-week--slim">
        {SHORT.map((s, i) => (
          <button key={s} className={`ft-wd${day === i ? ' ft-wd--on' : ''}${i === todayDow() ? ' ft-wd--today' : ''}`}
                  onClick={() => setDay(i)}>
            <span className="ft-wd-d">{s}</span>
          </button>
        ))}
      </div>

      <div className="ft-card ft-pad">
        <div className="ft-card-head">
          <h3 className="ft-card-title"><Flame size={15} /> Day total</h3>
          <button className="ft-btn ft-btn--ghost ft-tiny" onClick={() => setEditing(e => !e)}>
            {editing ? <><Check size={13} /> Done</> : <><Pencil size={13} /> Edit</>}
          </button>
        </div>
        <div className="ft-plantotals">
          <div><b>{totals.kcal.toLocaleString()}</b><span>kcal{targets ? ` / ${targets.target_kcal}` : ''}</span></div>
          <div className="ft-total--p"><b>{Math.round(totals.p)}g</b><span>protein{targets ? ` / ${targets.protein_g}` : ''}</span></div>
          <div className="ft-total--c"><b>{Math.round(totals.c)}g</b><span>carbs</span></div>
          <div className="ft-total--f"><b>{Math.round(totals.f)}g</b><span>fat</span></div>
        </div>
        {targets && totals.p < Number(targets.protein_g) - 15 && (
          <p className="ft-hint" style={{ marginTop: 10, marginBottom: 0 }}>
            This day lands {Math.round(Number(targets.protein_g) - totals.p)}g under your protein target.
            On a fast day that is expected — the weekly average is what matters.
          </p>
        )}
      </div>

      <div className="ft-slots">
        {dayItems.map(item => {
          const done = isToday && loggedNames.has(item.title)
          return (
            <div key={item.id} className={`ft-slot${item.is_training ? ' ft-slot--train' : ''}${done ? ' ft-slot--done' : ''}`}>
              <div className="ft-slot-time">
                {item.slot_time}
                {item.is_training && <Dumbbell size={11} />}
              </div>
              <div className="ft-slot-main">
                <div className="ft-slot-label">{item.slot_label}</div>
                <div className="ft-slot-title">{item.title}</div>
                {item.detail && <div className="ft-slot-detail">{item.detail}</div>}
                <div className="ft-slot-macros">
                  {item.kcal} kcal · <b>{item.protein_g}g P</b> · {item.carbs_g}g C · {item.fat_g}g F
                </div>
                {editing && (
                  <div className="ft-slot-edit">
                    <label><span>kcal</span><input className="ft-input ft-sm ft-num" type="number" defaultValue={item.kcal}
                      onBlur={e => patch(item, { kcal: Number(e.target.value) })} /></label>
                    <label><span>P</span><input className="ft-input ft-sm ft-num" type="number" defaultValue={item.protein_g}
                      onBlur={e => patch(item, { protein_g: Number(e.target.value) })} /></label>
                    <label><span>C</span><input className="ft-input ft-sm ft-num" type="number" defaultValue={item.carbs_g}
                      onBlur={e => patch(item, { carbs_g: Number(e.target.value) })} /></label>
                    <label><span>F</span><input className="ft-input ft-sm ft-num" type="number" defaultValue={item.fat_g}
                      onBlur={e => patch(item, { fat_g: Number(e.target.value) })} /></label>
                    <button className="ft-mini ft-mini--danger" onClick={() => remove(item)}><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
              {isToday && (
                <button className={`ft-slot-log${done ? ' on' : ''}`} onClick={() => logItem(item)}
                        disabled={busy === item.id} aria-label="Log this meal">
                  {busy === item.id ? <Loader2 size={15} className="ft-spin" /> : done ? <Check size={15} /> : <Utensils size={15} />}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {editing && (
        adding
          ? <AddSlot onCancel={() => setAdding(false)} onSave={addSlot} />
          : <button className="ft-btn ft-btn--ghost" onClick={() => setAdding(true)}><Plus size={14} /> Add slot</button>
      )}

      {!isToday && <p className="ft-hint">Switch to today to log meals from the plan.</p>}
    </div>
  )
}

function AddSlot({ onCancel, onSave }: { onCancel: () => void; onSave: (f: Partial<MealPlanItem>) => void }) {
  const [f, setF] = useState<Partial<MealPlanItem>>({
    slot_time: '12:00', slot_label: 'Lunch', meal_type: 'lunch', title: '', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
  })
  const set = (k: keyof MealPlanItem, v: unknown) => setF(p => ({ ...p, [k]: v }))

  return (
    <div className="ft-card ft-pad">
      <div className="ft-card-head">
        <h3 className="ft-card-title">New slot</h3>
        <button className="ft-mini" onClick={onCancel}><X size={14} /></button>
      </div>
      <div className="ft-grid3">
        <label className="ft-field"><span>Time</span>
          <input className="ft-input ft-sm" value={f.slot_time} onChange={e => set('slot_time', e.target.value)} /></label>
        <label className="ft-field"><span>Label</span>
          <input className="ft-input ft-sm" value={f.slot_label} onChange={e => set('slot_label', e.target.value)} /></label>
        <label className="ft-field"><span>Type</span>
          <select className="ft-input ft-sm ft-select" value={f.meal_type}
                  onChange={e => set('meal_type', e.target.value)}>
            <option value="breakfast">Breakfast</option><option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option><option value="snack">Snack</option>
          </select></label>
      </div>
      <label className="ft-field" style={{ marginBottom: 12 }}><span>What</span>
        <input className="ft-input ft-sm" value={f.title} onChange={e => set('title', e.target.value)} /></label>
      <div className="ft-grid4">
        <label className="ft-field"><span>kcal</span>
          <input className="ft-input ft-sm ft-num" type="number" value={f.kcal} onChange={e => set('kcal', Number(e.target.value))} /></label>
        <label className="ft-field"><span>Protein</span>
          <input className="ft-input ft-sm ft-num" type="number" value={f.protein_g} onChange={e => set('protein_g', Number(e.target.value))} /></label>
        <label className="ft-field"><span>Carbs</span>
          <input className="ft-input ft-sm ft-num" type="number" value={f.carbs_g} onChange={e => set('carbs_g', Number(e.target.value))} /></label>
        <label className="ft-field"><span>Fat</span>
          <input className="ft-input ft-sm ft-num" type="number" value={f.fat_g} onChange={e => set('fat_g', Number(e.target.value))} /></label>
      </div>
      <button className="ft-btn ft-btn--accent" onClick={() => onSave(f)} disabled={!f.title}>
        <Check size={14} /> Add
      </button>
    </div>
  )
}
