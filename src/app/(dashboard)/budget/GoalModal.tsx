'use client'

import { useState, useEffect } from 'react'
import type { SavingsGoalStatus } from '@/lib/types'
import { createSavingsGoal, updateSavingsGoal } from '@/lib/data'
import { X } from 'lucide-react'

const PALETTE = ['#96fac2', '#5B9BD5', '#F5A623', '#E85D5D', '#9B7EDE', '#50b380', '#E89B5D', '#E85D9B', '#5DC9E8', '#888888']

export default function GoalModal({
  open, onClose, userId, editing, sortOrder, onSaved,
}: {
  open: boolean
  onClose: () => void
  userId: string
  editing?: SavingsGoalStatus | null
  sortOrder: number
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setTarget(String(editing.target_amount))
      setDate(editing.target_date || '')
      setColor(editing.color || PALETTE[0])
    } else {
      setName(''); setTarget(''); setDate(''); setColor(PALETTE[0])
    }
    setError('')
  }, [open, editing])

  if (!open) return null

  async function handleSave() {
    const amt = parseFloat(target)
    if (!name.trim()) { setError('Give your goal a name.'); return }
    if (!amt || amt <= 0) { setError('Target amount must be greater than 0.'); return }
    setSaving(true)
    setError('')
    try {
      if (editing) {
        await updateSavingsGoal(editing.id, { name: name.trim(), target_amount: amt, target_date: date || null, color })
      } else {
        await createSavingsGoal({
          user_id: userId, name: name.trim(), target_amount: amt, target_date: date || null,
          color, icon: null, is_achieved: false, sort_order: sortOrder,
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-overlay" onClick={onClose}>
      <div className="bg-modal" onClick={e => e.stopPropagation()}>
        <div className="bg-modal-head">
          <div className="bg-modal-title">{editing ? 'Edit Goal' : 'New Savings Goal'}</div>
          <button className="bg-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="bg-modal-body">
          <div className="bg-field">
            <label className="bg-field-label">Goal name</label>
            <input className="bg-input" placeholder="e.g. Goa trip, New laptop" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div className="bg-row-2">
            <div className="bg-field">
              <label className="bg-field-label">Target (₹)</label>
              <input className="bg-input" type="number" min="0" step="1" placeholder="5000" value={target} onChange={e => setTarget(e.target.value)} />
            </div>
            <div className="bg-field">
              <label className="bg-field-label">Target date (optional)</label>
              <input className="bg-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div className="bg-field">
            <label className="bg-field-label">Color</label>
            <div className="bg-palette">
              {PALETTE.map(p => (
                <span key={p} className={`bg-palette-dot${color === p ? ' bg-palette-dot--active' : ''}`} style={{ background: p }} onClick={() => setColor(p)} />
              ))}
            </div>
          </div>
          {error && <div style={{ color: 'var(--status-danger)', fontSize: '0.8125rem' }}>{error}</div>}
        </div>
        <div className="bg-modal-foot">
          <button className="bg-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="bg-btn bg-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create goal'}
          </button>
        </div>
      </div>
    </div>
  )
}
