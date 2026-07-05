'use client'

// Pantry manager + AI dish suggestions (pure veg, high-protein, gut/metabolism).
// Daily rhythm: ☀ morning drink → meals → 🌙 night finisher. One-tap log via MealEditor.

import { ChefHat, Plus, X, Sparkles, Loader2, Sun, Moon, UtensilsCrossed, ClipboardCheck } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import type { PantryItem, MealType } from '@/lib/types'
import { getPantry, addPantryItem, removePantryItem, createMeal } from '@/lib/data'
import { localYmd } from '@/lib/nutrition'
import MealEditor, { type MealEditorValue } from './MealEditor'

type Dish = {
  name: string; why: string; recipe_hint: string
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; slot?: string
}
type Suggestion = { morning_drink: Dish | null; meals: Dish[]; night_finisher: Dish | null }

function slotToMealType(dish: Dish, fallback: MealType): MealType {
  const s = dish.slot
  if (s === 'breakfast' || s === 'lunch' || s === 'dinner' || s === 'snack' || s === 'drink') return s
  return fallback
}

export default function SuggestTab({ userId, onLogged }: {
  userId: string
  onLogged: () => void
}) {
  const [pantry, setPantry] = useState<PantryItem[]>([])
  const [newItem, setNewItem] = useState('')
  const [extra, setExtra] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logging, setLogging] = useState<{ dish: Dish; mealType: MealType } | null>(null)
  const [saving, setSaving] = useState(false)

  const loadPantry = useCallback(async () => {
    if (!userId) return
    setPantry(await getPantry(userId))
  }, [userId])

  useEffect(() => { loadPantry() }, [loadPantry])

  async function handleAdd() {
    if (!newItem.trim()) return
    await addPantryItem(userId, newItem)
    setNewItem('')
    loadPantry()
  }

  async function handleSuggest() {
    setSuggesting(true); setError(null)
    try {
      const res = await fetch('/api/nutrition/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra: extra.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Suggestion failed')
      setSuggestion({ morning_drink: data.morning_drink, meals: data.meals || [], night_finisher: data.night_finisher })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suggestion failed — try again.')
    } finally {
      setSuggesting(false)
    }
  }

  async function handleLogSave(v: MealEditorValue) {
    setSaving(true)
    try {
      await createMeal(userId, {
        meal_date: localYmd(), meal_type: v.meal_type, name: v.name, source: 'suggestion',
      }, v.items)
      setLogging(null)
      onLogged()
    } finally { setSaving(false) }
  }

  if (logging) {
    return (
      <div className="ft-card ft-pad">
        <h3 className="ft-card-title"><ClipboardCheck size={15} /> Log &quot;{logging.dish.name}&quot;</h3>
        <p className="ft-hint">Adjust the portion or macros to match what you actually ate, then save.</p>
        <MealEditor
          initial={{
            name: logging.dish.name,
            meal_type: logging.mealType,
            items: [{
              name: logging.dish.name,
              portion: '1 serving',
              kcal: logging.dish.kcal, protein_g: logging.dish.protein_g,
              carbs_g: logging.dish.carbs_g, fat_g: logging.dish.fat_g,
            }],
          }}
          saveLabel="Log meal"
          busy={saving}
          onSave={handleLogSave}
          onCancel={() => setLogging(null)}
        />
      </div>
    )
  }

  return (
    <div className="ft-suggest">
      {/* Pantry */}
      <div className="ft-card ft-pad">
        <h3 className="ft-card-title"><ChefHat size={15} /> Your pantry</h3>
        <p className="ft-hint">Keep this list current — suggestions only use what&apos;s here (+ salt, spices, oil).</p>
        <div className="ft-pantry">
          {pantry.map(p => (
            <span key={p.id} className="ft-pantry-chip">
              {p.name}
              <button className="ft-pantry-x" onClick={() => removePantryItem(p.id).then(loadPantry)} aria-label={`remove ${p.name}`}><X size={12} /></button>
            </span>
          ))}
          {pantry.length === 0 && <span className="ft-hint" style={{ marginBottom: 0 }}>Empty — add staples like paneer, dal, oats, curd, soya chunks…</span>}
        </div>
        <div className="ft-pantry-add">
          <input className="ft-input" placeholder="Add ingredient (e.g. paneer)" value={newItem}
            onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
          <button className="ft-btn" onClick={handleAdd}><Plus size={14} /> Add</button>
        </div>
      </div>

      {/* Ask */}
      <div className="ft-card ft-pad">
        <h3 className="ft-card-title"><Sparkles size={15} /> What should I eat?</h3>
        <div className="ft-pantry-add">
          <input className="ft-input" placeholder='Today I also have… (optional, e.g. "fresh spinach, leftover rice")'
            value={extra} onChange={e => setExtra(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSuggest() }} />
          <button className="ft-btn ft-btn--accent" onClick={handleSuggest} disabled={suggesting || pantry.length === 0}>
            {suggesting ? <Loader2 size={15} className="ft-spin" /> : <Sparkles size={15} />}
            {suggesting ? 'Thinking…' : 'Suggest'}
          </button>
        </div>
        {pantry.length === 0 && <p className="ft-hint" style={{ marginTop: 10, marginBottom: 0 }}>Add pantry items first.</p>}
        {error && <div className="ft-error" style={{ marginTop: 12, marginBottom: 0 }}><X size={14} /> {error}</div>}
      </div>

      {/* Results */}
      {suggestion && (
        <div className="ft-dishes">
          {suggestion.morning_drink && (
            <DishCard dish={suggestion.morning_drink} icon={<Sun size={15} />} tag="Morning metabolism drink"
              onLog={() => setLogging({ dish: suggestion.morning_drink!, mealType: 'drink' })} />
          )}
          {suggestion.meals.map((d, i) => (
            <DishCard key={i} dish={d} icon={<UtensilsCrossed size={15} />} tag={d.slot ? d.slot[0].toUpperCase() + d.slot.slice(1) : 'Meal'}
              onLog={() => setLogging({ dish: d, mealType: slotToMealType(d, 'lunch') })} />
          ))}
          {suggestion.night_finisher && (
            <DishCard dish={suggestion.night_finisher} icon={<Moon size={15} />} tag="Night gut-health finisher"
              onLog={() => setLogging({ dish: suggestion.night_finisher!, mealType: 'drink' })} />
          )}
        </div>
      )}
    </div>
  )
}

function DishCard({ dish, icon, tag, onLog }: { dish: Dish; icon: React.ReactNode; tag: string; onLog: () => void }) {
  return (
    <div className="ft-card ft-dish">
      <div className="ft-dish-head">
        <span className="ft-dish-tag">{icon} {tag}</span>
        <button className="ft-btn ft-btn--accent ft-dish-log" onClick={onLog}><ClipboardCheck size={14} /> Log this</button>
      </div>
      <div className="ft-dish-name">{dish.name}</div>
      <div className="ft-dish-macros">
        ~{dish.kcal} kcal · <b>{dish.protein_g}g protein</b> · {dish.carbs_g}c · {dish.fat_g}f
      </div>
      {dish.why && <div className="ft-dish-why">💡 {dish.why}</div>}
      {dish.recipe_hint && <div className="ft-dish-recipe">{dish.recipe_hint}</div>}
    </div>
  )
}
