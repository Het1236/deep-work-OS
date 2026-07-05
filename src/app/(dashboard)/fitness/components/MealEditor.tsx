'use client'

// Reusable itemized meal editor — the confirmation/edit surface used by
// manual entry, photo analysis confirmation, and suggestion logging.
// Nothing is saved until the user hits Save.

import { Plus, X, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { MealDraftItem, MealType } from '@/lib/types'
import { sumMacros, round1 } from '@/lib/nutrition'

export type MealEditorValue = {
  name: string
  meal_type: MealType
  items: MealDraftItem[]
}

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: '🌅 Breakfast' },
  { key: 'lunch', label: '☀️ Lunch' },
  { key: 'dinner', label: '🌙 Dinner' },
  { key: 'snack', label: '🍿 Snack' },
  { key: 'drink', label: '🥤 Drink' },
]

const EMPTY_ITEM: MealDraftItem = { name: '', portion: '', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

export default function MealEditor({ initial, saveLabel = 'Save meal', busy = false, onSave, onCancel }: {
  initial: Partial<MealEditorValue>
  saveLabel?: string
  busy?: boolean
  onSave: (value: MealEditorValue) => void | Promise<void>
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial.name || '')
  const [mealType, setMealType] = useState<MealType>(initial.meal_type || 'snack')
  const [items, setItems] = useState<MealDraftItem[]>(
    initial.items && initial.items.length ? initial.items : [{ ...EMPTY_ITEM }],
  )

  const totals = sumMacros(items)
  const valid = name.trim().length > 0 && items.some(i => i.name.trim())

  function patchItem(idx: number, patch: Partial<MealDraftItem>) {
    setItems(list => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function removeItem(idx: number) {
    setItems(list => (list.length > 1 ? list.filter((_, i) => i !== idx) : [{ ...EMPTY_ITEM }]))
  }
  function num(v: string): number {
    const n = parseFloat(v)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }

  async function handleSave() {
    if (!valid || busy) return
    await onSave({ name: name.trim(), meal_type: mealType, items: items.filter(i => i.name.trim()) })
  }

  return (
    <div className="ft-editor">
      <div className="ft-editor-head">
        <input className="ft-input ft-editor-name" placeholder="Meal name (e.g. Lunch thali)"
          value={name} onChange={e => setName(e.target.value)} />
        <div className="ft-typerow">
          {MEAL_TYPES.map(t => (
            <button key={t.key} type="button"
              className={`ft-chip${mealType === t.key ? ' on' : ''}`}
              onClick={() => setMealType(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="ft-items">
        <div className="ft-item ft-item--header">
          <span>Item</span><span>Portion</span><span>kcal</span><span>P</span><span>C</span><span>F</span><span />
        </div>
        {items.map((it, i) => (
          <div key={i} className={`ft-item${it.confidence === 'low' ? ' ft-item--low' : ''}`}>
            <input className="ft-input ft-sm" placeholder="e.g. Dal tadka" value={it.name}
              onChange={e => patchItem(i, { name: e.target.value })} />
            <input className="ft-input ft-sm" placeholder="1 katori (~150g)" value={it.portion}
              onChange={e => patchItem(i, { portion: e.target.value })} />
            <input className="ft-input ft-sm ft-num" type="number" min="0" value={it.kcal || ''}
              onChange={e => patchItem(i, { kcal: num(e.target.value) })} />
            <input className="ft-input ft-sm ft-num" type="number" min="0" value={it.protein_g || ''}
              onChange={e => patchItem(i, { protein_g: num(e.target.value) })} />
            <input className="ft-input ft-sm ft-num" type="number" min="0" value={it.carbs_g || ''}
              onChange={e => patchItem(i, { carbs_g: num(e.target.value) })} />
            <input className="ft-input ft-sm ft-num" type="number" min="0" value={it.fat_g || ''}
              onChange={e => patchItem(i, { fat_g: num(e.target.value) })} />
            <div className="ft-item-tail">
              {it.confidence && <span className={`ft-conf ft-conf--${it.confidence}`} title={`AI confidence: ${it.confidence}`}>{it.confidence === 'high' ? '●' : it.confidence === 'medium' ? '◐' : '○'}</span>}
              <button type="button" className="ft-mini ft-mini--danger" onClick={() => removeItem(i)} aria-label="remove item"><X size={13} /></button>
            </div>
          </div>
        ))}
        <button type="button" className="ft-btn ft-btn--ghost" onClick={() => setItems(l => [...l, { ...EMPTY_ITEM }])}>
          <Plus size={14} /> Add item
        </button>
      </div>

      <div className="ft-editor-foot">
        <div className="ft-totals">
          <span className="ft-total"><b>{Math.round(totals.kcal)}</b> kcal</span>
          <span className="ft-total ft-total--p"><b>{round1(totals.protein_g)}</b>g protein</span>
          <span className="ft-total ft-total--c"><b>{round1(totals.carbs_g)}</b>g carbs</span>
          <span className="ft-total ft-total--f"><b>{round1(totals.fat_g)}</b>g fat</span>
        </div>
        <div className="ft-editor-actions">
          {onCancel && <button type="button" className="ft-btn" onClick={onCancel} disabled={busy}>Cancel</button>}
          <button type="button" className="ft-btn ft-btn--accent" onClick={handleSave} disabled={!valid || busy}>
            {busy ? <Loader2 size={14} className="ft-spin" /> : null} {saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
