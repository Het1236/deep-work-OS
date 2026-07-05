'use client'

// Body stats → computed TDEE/macros (Mifflin-St Jeor), with every target
// field manually editable — "both" per user requirement.

import { Calculator, Save, Loader2, Check } from 'lucide-react'
import { useState } from 'react'
import type { NutritionTargets } from '@/lib/types'
import { computeTargets, type BodyStats } from '@/lib/nutrition'
import { upsertNutritionTargets } from '@/lib/data'

export default function TargetsTab({ userId, targets, onSaved }: {
  userId: string
  targets: NutritionTargets | null
  onSaved: () => void
}) {
  const [weight, setWeight] = useState(targets?.weight_kg?.toString() || '')
  const [height, setHeight] = useState(targets?.height_cm?.toString() || '')
  const [age, setAge] = useState(targets?.age?.toString() || '')
  const [sex, setSex] = useState<'male' | 'female'>(targets?.sex || 'male')
  const [activity, setActivity] = useState<BodyStats['activityLevel']>(targets?.activity_level || 'moderate')
  const [goal, setGoal] = useState<'cut' | 'maintain' | 'bulk'>(targets?.goal || 'maintain')

  const [tdee, setTdee] = useState<number | null>(targets?.tdee_kcal ?? null)
  const [kcal, setKcal] = useState(targets?.target_kcal?.toString() || '2000')
  const [protein, setProtein] = useState(targets?.protein_g?.toString() || '120')
  const [carbs, setCarbs] = useState(targets?.carbs_g?.toString() || '220')
  const [fat, setFat] = useState(targets?.fat_g?.toString() || '60')
  const [manual, setManual] = useState(targets?.targets_manual ?? false)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const statsComplete = !!(parseFloat(weight) && parseFloat(height) && parseInt(age, 10))

  function handleCompute() {
    if (!statsComplete) return
    const t = computeTargets({
      weightKg: parseFloat(weight), heightCm: parseFloat(height), age: parseInt(age, 10),
      sex, activityLevel: activity, goal,
    })
    setTdee(t.tdeeKcal)
    setKcal(String(t.targetKcal)); setProtein(String(t.proteinG))
    setCarbs(String(t.carbsG)); setFat(String(t.fatG))
    setManual(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await upsertNutritionTargets(userId, {
        weight_kg: parseFloat(weight) || null,
        height_cm: parseFloat(height) || null,
        age: parseInt(age, 10) || null,
        sex, activity_level: activity, goal,
        tdee_kcal: tdee,
        target_kcal: parseInt(kcal, 10) || 2000,
        protein_g: parseInt(protein, 10) || 0,
        carbs_g: parseInt(carbs, 10) || 0,
        fat_g: parseInt(fat, 10) || 0,
        targets_manual: manual,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const markManual = (setter: (v: string) => void) => (v: string) => { setter(v); setManual(true) }

  return (
    <div className="ft-targets">
      <div className="ft-card ft-pad">
        <h3 className="ft-card-title">Your stats</h3>
        <div className="ft-grid3">
          <label className="ft-field"><span>Weight (kg)</span>
            <input className="ft-input" type="number" min="30" max="250" value={weight} onChange={e => setWeight(e.target.value)} /></label>
          <label className="ft-field"><span>Height (cm)</span>
            <input className="ft-input" type="number" min="100" max="230" value={height} onChange={e => setHeight(e.target.value)} /></label>
          <label className="ft-field"><span>Age</span>
            <input className="ft-input" type="number" min="10" max="100" value={age} onChange={e => setAge(e.target.value)} /></label>
        </div>
        <div className="ft-grid3">
          <label className="ft-field"><span>Sex</span>
            <select className="ft-input" value={sex} onChange={e => setSex(e.target.value as 'male' | 'female')}>
              <option value="male">Male</option><option value="female">Female</option>
            </select></label>
          <label className="ft-field"><span>Activity</span>
            <select className="ft-input" value={activity} onChange={e => setActivity(e.target.value as BodyStats['activityLevel'])}>
              <option value="sedentary">Sedentary (desk, no exercise)</option>
              <option value="light">Light (1-3 workouts/wk)</option>
              <option value="moderate">Moderate (3-5 workouts/wk)</option>
              <option value="active">Active (6-7 workouts/wk)</option>
              <option value="very_active">Very active (2x/day, physical job)</option>
            </select></label>
          <label className="ft-field"><span>Goal</span>
            <select className="ft-input" value={goal} onChange={e => setGoal(e.target.value as 'cut' | 'maintain' | 'bulk')}>
              <option value="cut">Cut (−20%)</option>
              <option value="maintain">Maintain</option>
              <option value="bulk">Bulk (+10%)</option>
            </select></label>
        </div>
        <button className="ft-btn ft-btn--accent" onClick={handleCompute} disabled={!statsComplete}>
          <Calculator size={15} /> Compute targets{tdee ? ` · TDEE ${tdee} kcal` : ''}
        </button>
        {!statsComplete && <p className="ft-hint">Fill weight, height and age to compute.</p>}
      </div>

      <div className="ft-card ft-pad">
        <h3 className="ft-card-title">Daily targets {manual && <span className="ft-badge">manually adjusted</span>}</h3>
        <p className="ft-hint">Computed values land here — edit any of them freely.</p>
        <div className="ft-grid4">
          <label className="ft-field"><span>Calories</span>
            <input className="ft-input" type="number" min="800" value={kcal} onChange={e => markManual(setKcal)(e.target.value)} /></label>
          <label className="ft-field"><span>Protein (g)</span>
            <input className="ft-input" type="number" min="0" value={protein} onChange={e => markManual(setProtein)(e.target.value)} /></label>
          <label className="ft-field"><span>Carbs (g)</span>
            <input className="ft-input" type="number" min="0" value={carbs} onChange={e => markManual(setCarbs)(e.target.value)} /></label>
          <label className="ft-field"><span>Fat (g)</span>
            <input className="ft-input" type="number" min="0" value={fat} onChange={e => markManual(setFat)(e.target.value)} /></label>
        </div>
        <button className="ft-btn ft-btn--accent" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={15} className="ft-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
          {saved ? 'Saved!' : 'Save targets'}
        </button>
      </div>
    </div>
  )
}
