'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { SavingsGoalStatus, FinanceAccount } from '@/lib/types'
import { moveGoalMoney, awardXP } from '@/lib/data'
import { useXPToast } from '@/components/XPToast'
import { formatINR } from '@/lib/finance'
import { X } from 'lucide-react'

export default function ContributeModal({
  open, onClose, userId, goal, accounts, onSaved,
}: {
  open: boolean
  onClose: () => void
  userId: string
  goal: SavingsGoalStatus | null
  accounts: FinanceAccount[]
  onSaved: () => void
}) {
  const { showXP } = useXPToast()
  const [direction, setDirection] = useState<'add' | 'withdraw'>('add')
  const [amount, setAmount] = useState('')
  const [walletId, setWalletId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setDirection('add'); setAmount(''); setWalletId(accounts[0]?.id || ''); setError('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || !goal || typeof document === 'undefined') return null

  async function handleSave() {
    if (!goal) return
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter an amount greater than 0.'); return }
    if (!walletId) { setError('Pick a wallet.'); return }
    if (direction === 'withdraw' && amt > goal.saved) { setError(`You only have ${formatINR(goal.saved)} in this goal.`); return }
    setSaving(true); setError('')
    try {
      const { justAchieved } = await moveGoalMoney(userId, goal, amt, direction, walletId)
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

  const isAdd = direction === 'add'

  return createPortal(
    <div className="bg-overlay" onClick={onClose}>
      <div className="bg-modal" onClick={e => e.stopPropagation()}>
        <div className="bg-modal-head">
          <div className="bg-modal-title">{goal.name}</div>
          <button className="bg-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="bg-modal-body">
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
            {formatINR(goal.saved)} saved of {formatINR(goal.target_amount)} · {formatINR(goal.remaining)} to go
          </div>

          <div className="bg-seg">
            <button className={`bg-seg-btn${isAdd ? ' bg-seg-btn--active' : ''}`} onClick={() => setDirection('add')}>Add money</button>
            <button className={`bg-seg-btn${!isAdd ? ' bg-seg-btn--active' : ''}`} onClick={() => setDirection('withdraw')}>Withdraw</button>
          </div>

          <div className="bg-field">
            <label className="bg-field-label">Amount (₹)</label>
            <input className="bg-input" type="number" min="0" step="1" inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="bg-field">
            <label className="bg-field-label">{isAdd ? 'From wallet' : 'To wallet'}</label>
            <select className="bg-select" value={walletId} onChange={e => setWalletId(e.target.value)}>
              <option value="">Select wallet…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
            {isAdd ? 'Moves money out of the wallet into this goal — logged as a transfer.' : 'Returns money from this goal back to the wallet — logged as a transfer.'}
          </div>

          {error && <div style={{ color: 'var(--status-danger)', fontSize: '0.8125rem' }}>{error}</div>}
        </div>
        <div className="bg-modal-foot">
          <button className="bg-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="bg-btn bg-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isAdd ? 'Add money' : 'Withdraw'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
