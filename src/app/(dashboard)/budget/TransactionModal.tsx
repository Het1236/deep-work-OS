'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { FinanceAccount, FinanceCategory, Transaction } from '@/lib/types'
import { createTransaction, updateTransaction, isFirstLogToday, awardXP } from '@/lib/data'
import { useXPToast } from '@/components/XPToast'
import { X } from 'lucide-react'

type TxnType = 'expense' | 'income' | 'transfer'

export default function TransactionModal({
  open, onClose, userId, categories, accounts, editing, onSaved,
}: {
  open: boolean
  onClose: () => void
  userId: string
  categories: FinanceCategory[]
  accounts: FinanceAccount[]
  editing?: Transaction | null
  onSaved: () => void
}) {
  const { showXP } = useXPToast()
  const today = new Date().toISOString().split('T')[0]

  const [type, setType] = useState<TxnType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [scope, setScope] = useState<'self' | 'family'>('self')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      // Debt rows (lend/borrow/repayment) are managed in the Udhaar modal, not here.
      const t: TxnType = editing.type === 'income' || editing.type === 'expense' || editing.type === 'transfer'
        ? editing.type : 'expense'
      setType(t)
      setAmount(String(editing.amount))
      setCategoryId(editing.category_id || '')
      setAccountId(editing.account_id || '')
      setToAccountId(editing.to_account_id || '')
      setDate(editing.txn_date)
      setNote(editing.note || '')
      setScope(editing.scope || 'self')
    } else {
      setType('expense')
      setAmount('')
      setCategoryId('')
      setAccountId(accounts[0]?.id || '')
      setToAccountId('')
      setDate(today)
      setNote('')
      setScope('self')
    }
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  if (!open) return null

  const visibleCats = categories.filter(c => c.kind === (type === 'income' ? 'income' : 'expense'))

  async function handleSave() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter an amount greater than 0.'); return }
    if (type !== 'transfer' && !categoryId) { setError('Pick a category.'); return }
    if (type === 'transfer') {
      if (!accountId || !toAccountId) { setError('Pick both wallets for the transfer.'); return }
      if (accountId === toAccountId) { setError('Transfer wallets must be different.'); return }
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        user_id: userId,
        type,
        amount: amt,
        category_id: type === 'transfer' ? null : (categoryId || null),
        account_id: accountId || null,
        to_account_id: type === 'transfer' ? (toAccountId || null) : null,
        goal_id: null,
        scope: type === 'expense' ? scope : 'self',
        txn_date: date,
        note: note.trim() || null,
        recurring_id: null,
      }
      if (editing) {
        await updateTransaction(editing.id, payload)
      } else {
        const first = await isFirstLogToday(userId)
        await createTransaction(payload)
        if (first) {
          const res = await awardXP(userId, 'finance_log', { txn_date: date })
          showXP(res.xpAwarded, 'Daily money logged', res.leveledUp, undefined)
        }
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const types: TxnType[] = ['expense', 'income', 'transfer']

  return createPortal(
    <div className="bg-overlay" onClick={onClose}>
      <div className="bg-modal" onClick={e => e.stopPropagation()}>
        <div className="bg-modal-head">
          <div className="bg-modal-title">{editing ? 'Edit Transaction' : 'Add Transaction'}</div>
          <button className="bg-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="bg-modal-body">
          <div className="bg-seg">
            {types.map(t => (
              <button
                key={t}
                className={`bg-seg-btn${type === t ? ' bg-seg-btn--active' : ''}`}
                onClick={() => { setType(t); setCategoryId('') }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="bg-field">
            <label className="bg-field-label">Amount (₹)</label>
            <input
              className="bg-input" type="number" min="0" step="0.01" inputMode="decimal"
              placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} autoFocus
            />
          </div>

          {type !== 'transfer' && (
            <div className="bg-field">
              <label className="bg-field-label">Category</label>
              <select
                className="bg-select"
                value={categoryId}
                onChange={e => {
                  setCategoryId(e.target.value)
                  const c = categories.find(x => x.id === e.target.value)
                  if (c && type === 'expense') setScope(c.default_scope || 'self')
                }}
              >
                <option value="">Select category…</option>
                {visibleCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {type === 'expense' && (
            <div className="bg-field">
              <label className="bg-field-label">Spend for</label>
              <div className="bg-seg">
                <button className={`bg-seg-btn${scope === 'self' ? ' bg-seg-btn--active' : ''}`} onClick={() => setScope('self')}>🙋 Myself</button>
                <button className={`bg-seg-btn${scope === 'family' ? ' bg-seg-btn--active' : ''}`} onClick={() => setScope('family')}>👨‍👩‍👧 Family</button>
              </div>
            </div>
          )}

          <div className="bg-field">
            <label className="bg-field-label">{type === 'transfer' ? 'From wallet' : 'Wallet'}</label>
            <select className="bg-select" value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">{type === 'transfer' ? 'Select wallet…' : 'No wallet'}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {type === 'transfer' && (
            <div className="bg-field">
              <label className="bg-field-label">To wallet</label>
              <select className="bg-select" value={toAccountId} onChange={e => setToAccountId(e.target.value)}>
                <option value="">Select wallet…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

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
          <button className="bg-btn bg-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
