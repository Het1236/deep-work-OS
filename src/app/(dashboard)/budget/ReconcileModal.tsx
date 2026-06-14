'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { adjustWalletBalance } from '@/lib/data'
import { formatINR } from '@/lib/finance'
import { X, Scale } from 'lucide-react'

export default function ReconcileModal({
  open, onClose, userId, account, onSaved,
}: {
  open: boolean
  onClose: () => void
  userId: string
  account: { id: string; name: string; balance: number } | null
  onSaved: () => void
}) {
  const [actual, setActual] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && account) { setActual(String(account.balance)); setError('') }
  }, [open, account])

  if (!open || !account || typeof document === 'undefined') return null

  const diff = (parseFloat(actual || '0') || 0) - account.balance

  async function save() {
    const v = parseFloat(actual)
    if (Number.isNaN(v)) { setError('Enter the actual amount.'); return }
    setSaving(true); setError('')
    try { await adjustWalletBalance(userId, account!.id, account!.balance, v); onSaved(); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to adjust.') }
    finally { setSaving(false) }
  }

  return createPortal(
    <div className="bg-overlay" onClick={onClose}>
      <div className="bg-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="bg-modal-head">
          <div className="bg-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Scale size={16} /> Fix {account.name} balance</div>
          <button className="bg-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="bg-modal-body">
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
            The app shows <b style={{ color: 'var(--text-primary)' }}>{formatINR(account.balance)}</b>. Enter what you <i>actually</i> have and we&apos;ll log the difference as an adjustment.
          </div>
          <div className="bg-field">
            <label className="bg-field-label">Actual balance (₹)</label>
            <input className="bg-input" type="number" step="0.01" value={actual} onChange={e => setActual(e.target.value)} autoFocus />
          </div>
          {Math.abs(diff) >= 0.01 && (
            <div style={{ fontSize: '0.8125rem', color: diff > 0 ? 'var(--status-success)' : 'var(--status-danger)' }}>
              Adjustment: {diff > 0 ? '+' : '−'}{formatINR(Math.abs(diff))} ({diff > 0 ? 'added as income' : 'logged as expense'})
            </div>
          )}
          {error && <div style={{ color: 'var(--status-danger)', fontSize: '0.8125rem' }}>{error}</div>}
        </div>
        <div className="bg-modal-foot">
          <button className="bg-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="bg-btn bg-btn--primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Fix balance'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
