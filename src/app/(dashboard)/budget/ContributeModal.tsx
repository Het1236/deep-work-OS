'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { SavingsGoalStatus } from '@/lib/types'
import { addContribution, awardXP } from '@/lib/data'
import { useXPToast } from '@/components/XPToast'
import { formatINR } from '@/lib/finance'
import { X } from 'lucide-react'

export default function ContributeModal({
  open, onClose, userId, goal, onSaved,
}: {
  open: boolean
  onClose: () => void
  userId: string
  goal: SavingsGoalStatus | null
  onSaved: () => void
}) {
  const { showXP } = useXPToast()
  const today = new Date().toISOString().split('T')[0]
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setAmount(''); setDate(today); setNote(''); setError('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || !goal) return null

  async function handleSave() {
    if (!goal) return
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter an amount greater than 0.'); return }
    setSaving(true)
    setError('')
    try {
      const { justAchieved } = await addContribution({
        user_id: userId, goal_id: goal.id, amount: amt, contributed_at: date, note: note.trim() || null,
      }, goal)
      if (justAchieved) {
        const res = await awardXP(userId, 'savings_funded', { goal_id: goal.id })
        showXP(res.xpAwarded, `Goal funded: ${goal.name} 🎉`, res.leveledUp)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="bg-overlay" onClick={onClose}>
      <div className="bg-modal" onClick={e => e.stopPropagation()}>
        <div className="bg-modal-head">
          <div className="bg-modal-title">Add to {goal.name}</div>
          <button className="bg-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="bg-modal-body">
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
            {formatINR(goal.saved)} saved of {formatINR(goal.target_amount)} · {formatINR(goal.remaining)} to go
          </div>
          <div className="bg-field">
            <label className="bg-field-label">Amount (₹)</label>
            <input className="bg-input" type="number" min="0" step="1" inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="bg-row-2">
            <div className="bg-field">
              <label className="bg-field-label">Date</label>
              <input className="bg-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="bg-field">
              <label className="bg-field-label">Note</label>
              <input className="bg-input" type="text" placeholder="optional" value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </div>
          {error && <div style={{ color: 'var(--status-danger)', fontSize: '0.8125rem' }}>{error}</div>}
        </div>
        <div className="bg-modal-foot">
          <button className="bg-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="bg-btn bg-btn--primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Add money'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
