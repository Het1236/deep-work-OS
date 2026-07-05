'use client'

// Today dashboard: macro progress vs targets, today's meals, weekly trend.

import { Flame, Pencil, Trash2, Target, ArrowRight, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { Meal, NutritionTargets, MacroDay, MealDraftItem } from '@/lib/types'
import { round1 } from '@/lib/nutrition'
import { updateMeal, deleteMeal } from '@/lib/data'
import MealEditor, { type MealEditorValue } from './MealEditor'

const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍿', drink: '🥤',
}

function Ring({ label, value, target, unit, hue }: {
  label: string; value: number; target: number; unit: string; hue: string
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  const over = target > 0 && value > target
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <div className="ft-ring">
      <svg viewBox="0 0 84 84" width="84" height="84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={hue} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 42 42)" />
        <text x="42" y="39" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text-primary)">{Math.round(value)}</text>
        <text x="42" y="53" textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">/ {target}{unit}</text>
      </svg>
      <span className={`ft-ring-label${over ? ' ft-ring-label--over' : ''}`}>{label}{over ? ' · over' : ''}</span>
    </div>
  )
}

export default function TodayTab({ userId, targets, meals, trend, onChanged, onGoTargets, getPhotoUrl }: {
  userId: string
  targets: NutritionTargets | null
  meals: Meal[]
  trend: MacroDay[]
  onChanged: () => void
  onGoTargets: () => void
  getPhotoUrl?: (path: string) => Promise<string | null>
}) {
  const [editing, setEditing] = useState<Meal | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const totals = meals.reduce(
    (t, m) => ({
      kcal: t.kcal + Number(m.kcal), protein: t.protein + Number(m.protein_g),
      carbs: t.carbs + Number(m.carbs_g), fat: t.fat + Number(m.fat_g),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )

  async function handleDelete(id: string) {
    setBusyId(id)
    try { await deleteMeal(id); onChanged() } finally { setBusyId(null) }
  }

  async function handleEditSave(v: MealEditorValue) {
    if (!editing) return
    setSaving(true)
    try {
      const items: MealDraftItem[] = v.items
      await updateMeal(editing.id, userId, { name: v.name, meal_type: v.meal_type }, items)
      setEditing(null)
      onChanged()
    } finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="ft-card ft-pad">
        <h3 className="ft-card-title"><Pencil size={15} /> Edit meal</h3>
        <MealEditor
          initial={{
            name: editing.name,
            meal_type: editing.meal_type,
            items: (editing.meal_items || []).map(it => ({
              name: it.name, portion: it.portion || '',
              kcal: Number(it.kcal), protein_g: Number(it.protein_g),
              carbs_g: Number(it.carbs_g), fat_g: Number(it.fat_g),
            })),
          }}
          saveLabel="Update meal"
          busy={saving}
          onSave={handleEditSave}
          onCancel={() => setEditing(null)}
        />
      </div>
    )
  }

  return (
    <div className="ft-today">
      {!targets && (
        <button className="ft-banner" onClick={onGoTargets}>
          <Target size={16} /> Set your calorie & macro targets to activate the dashboard <ArrowRight size={14} />
        </button>
      )}

      <div className="ft-rings ft-card ft-pad">
        <Ring label="Calories" value={totals.kcal} target={targets?.target_kcal || 0} unit="" hue="var(--accent)" />
        <Ring label="Protein" value={totals.protein} target={targets?.protein_g || 0} unit="g" hue="#5B9BD5" />
        <Ring label="Carbs" value={totals.carbs} target={targets?.carbs_g || 0} unit="g" hue="#F5A623" />
        <Ring label="Fat" value={totals.fat} target={targets?.fat_g || 0} unit="g" hue="#E770A5" />
      </div>

      <div className="ft-card ft-pad">
        <h3 className="ft-card-title"><Flame size={15} /> Today&apos;s meals</h3>
        {meals.length === 0 ? (
          <p className="ft-hint">Nothing logged yet. Use <b>Log Meal</b> — type it or snap a photo.</p>
        ) : (
          <div className="ft-meals">
            {meals.map(m => (
              <div key={m.id} className="ft-meal">
                <MealThumb meal={m} getPhotoUrl={getPhotoUrl} />
                <div className="ft-meal-main">
                  <div className="ft-meal-name">{MEAL_EMOJI[m.meal_type] || '🍽'} {m.name}</div>
                  <div className="ft-meal-macros">
                    {Math.round(Number(m.kcal))} kcal · {round1(Number(m.protein_g))}p · {round1(Number(m.carbs_g))}c · {round1(Number(m.fat_g))}f
                    {m.meal_items && m.meal_items.length > 1 ? ` · ${m.meal_items.length} items` : ''}
                  </div>
                </div>
                <div className="ft-meal-actions">
                  <button className="ft-mini" title="Edit" onClick={() => setEditing(m)}><Pencil size={13} /></button>
                  <button className="ft-mini ft-mini--danger" title="Delete" disabled={busyId === m.id} onClick={() => handleDelete(m.id)}>
                    {busyId === m.id ? <Loader2 size={13} className="ft-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {trend.length > 1 && (
        <div className="ft-card ft-pad">
          <h3 className="ft-card-title">Last {trend.length} days</h3>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={trend} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="ftKcal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated, #1a1a1a)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="kcal" stroke="var(--accent)" fill="url(#ftKcal)" strokeWidth={2} name="kcal" />
                <Area type="monotone" dataKey="protein" stroke="#5B9BD5" fill="none" strokeWidth={2} name="protein (g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

function MealThumb({ meal, getPhotoUrl }: { meal: Meal; getPhotoUrl?: (path: string) => Promise<string | null> }) {
  const [url, setUrl] = useState<string | null>(null)
  const path = meal.photo_path
  useEffect(() => {
    if (!path || !getPhotoUrl) return
    let live = true
    getPhotoUrl(path).then(u => { if (live) setUrl(u) }).catch(() => {})
    return () => { live = false }
  }, [path, getPhotoUrl])
  if (!url) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="ft-thumb" />
}
