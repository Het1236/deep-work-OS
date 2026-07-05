'use client'

// Log Meal tab: photo → AI analysis → editable confirmation, or manual entry.
// Nothing saves until the user confirms in the MealEditor.

import { PencilLine, Camera, Check, Sparkles, Loader2, X } from 'lucide-react'
import { useState, useRef } from 'react'
import type { MealDraftItem, MealType } from '@/lib/types'
import { createMeal, createMealWithPhoto } from '@/lib/data'
import { localYmd, compressImage, blobToBase64 } from '@/lib/nutrition'
import MealEditor, { type MealEditorValue } from './MealEditor'

type Mode = 'photo' | 'manual'
type PhotoStage = 'pick' | 'analyzing' | 'confirm'

function guessMealType(): MealType {
  const h = new Date().getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

export default function LogMealTab({ userId, onLogged }: {
  userId: string
  onLogged: () => void
}) {
  const [mode, setMode] = useState<Mode>('photo')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [editorKey, setEditorKey] = useState(0)

  // photo flow state
  const [stage, setStage] = useState<PhotoStage>('pick')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [hint, setHint] = useState('')
  const [analysis, setAnalysis] = useState<{ meal_name: string; items: MealDraftItem[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function resetPhotoFlow() {
    setStage('pick'); setPhotoBlob(null); setHint(''); setAnalysis(null); setError(null)
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const blob = await compressImage(file)
      setPhotoBlob(blob)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch {
      setError('Could not read that image — try a different one.')
    }
  }

  async function handleAnalyze() {
    if (!photoBlob) return
    setStage('analyzing'); setError(null)
    try {
      const imageBase64 = await blobToBase64(photoBlob)
      const res = await fetch('/api/nutrition/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg', hint: hint.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Analysis failed')
      setAnalysis({ meal_name: data.meal_name, items: data.items })
      setStage('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed — try again.')
      setStage('pick')
    }
  }

  async function saveConfirmed(v: MealEditorValue) {
    setSaving(true)
    try {
      if (photoBlob) {
        await createMealWithPhoto(userId, {
          meal_date: localYmd(), meal_type: v.meal_type, name: v.name, source: 'photo',
        }, v.items, photoBlob)
      } else {
        await createMeal(userId, {
          meal_date: localYmd(), meal_type: v.meal_type, name: v.name, source: 'manual',
        }, v.items)
      }
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2500)
      resetPhotoFlow()
      onLogged()
    } finally { setSaving(false) }
  }

  async function saveManual(v: MealEditorValue) {
    setSaving(true)
    try {
      await createMeal(userId, {
        meal_date: localYmd(), meal_type: v.meal_type, name: v.name, source: 'manual',
      }, v.items)
      setJustSaved(true)
      setEditorKey(k => k + 1)
      setTimeout(() => setJustSaved(false), 2500)
      onLogged()
    } finally { setSaving(false) }
  }

  return (
    <div className="ft-log">
      {justSaved && <div className="ft-saved"><Check size={15} /> Meal logged — check Today.</div>}

      <div className="ft-modes">
        <button className={`ft-chip${mode === 'photo' ? ' on' : ''}`} onClick={() => setMode('photo')}><Camera size={14} /> Photo</button>
        <button className={`ft-chip${mode === 'manual' ? ' on' : ''}`} onClick={() => setMode('manual')}><PencilLine size={14} /> Manual</button>
      </div>

      {mode === 'manual' ? (
        <div className="ft-card ft-pad">
          <h3 className="ft-card-title"><PencilLine size={15} /> Manual entry</h3>
          <p className="ft-hint">Break the meal into items for accurate totals — or log it as a single line.</p>
          <MealEditor key={editorKey} initial={{}} busy={saving} onSave={saveManual} />
        </div>
      ) : stage === 'confirm' && analysis ? (
        <div className="ft-card ft-pad">
          <h3 className="ft-card-title"><Sparkles size={15} /> Confirm the breakdown</h3>
          <p className="ft-hint">The AI&apos;s estimate — <b>check portions and macros, fix anything off</b>, then save. ◐/○ marks lower confidence.</p>
          {previewUrl && /* eslint-disable-next-line @next/next/no-img-element */
            <img src={previewUrl} alt="meal" className="ft-preview" />}
          <MealEditor
            initial={{ name: analysis.meal_name, meal_type: guessMealType(), items: analysis.items }}
            saveLabel="Save meal"
            busy={saving}
            onSave={saveConfirmed}
            onCancel={resetPhotoFlow}
          />
        </div>
      ) : (
        <div className="ft-card ft-pad">
          <h3 className="ft-card-title"><Camera size={15} /> Snap your meal</h3>
          <p className="ft-hint">Take or upload a photo — AI itemizes it with portions and macros, and you confirm before anything is saved.</p>

          {error && <div className="ft-error"><X size={14} /> {error}</div>}

          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={handleFile} className="ft-file" id="ft-file-input" />
          {!previewUrl ? (
            <label htmlFor="ft-file-input" className="ft-drop">
              <Camera size={26} />
              <span>Tap to take a photo or choose one</span>
            </label>
          ) : (
            <div className="ft-photo-stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="meal preview" className="ft-preview" />
              <input className="ft-input" placeholder='Optional hint — e.g. "paneer bhurji, 2 rotis, homemade"'
                value={hint} onChange={e => setHint(e.target.value)} />
              <div className="ft-photo-actions">
                <button className="ft-btn" onClick={resetPhotoFlow}>Change photo</button>
                <button className="ft-btn ft-btn--accent" onClick={handleAnalyze} disabled={stage === 'analyzing'}>
                  {stage === 'analyzing' ? <Loader2 size={15} className="ft-spin" /> : <Sparkles size={15} />}
                  {stage === 'analyzing' ? 'Analyzing…' : 'Analyze meal'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
