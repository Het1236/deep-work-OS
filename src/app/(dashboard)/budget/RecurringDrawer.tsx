'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { FinanceAccount, FinanceCategory, RecurringRule, RecurringFrequency } from '@/lib/types'
import { getRecurringRules, createRecurringRule, deleteRecurringRule } from '@/lib/data'
import { formatINR } from '@/lib/finance'
import { X, Plus, Trash2, Repeat } from 'lucide-react'

const FREQS: RecurringFrequency[] = ['daily', 'weekly', 'monthly']

export default function RecurringDrawer({
  open, onClose, userId, categories, accounts, onChanged,
}: {
  open: boolean
  onClose: () => void
  userId: string
  categories: FinanceCategory[]
  accounts: FinanceAccount[]
  onChanged: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [freq, setFreq] = useState<RecurringFrequency>('monthly')
  const [startDate, setStartDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadRules = useCallback(async () => {
    if (!userId) return
    setRules(await getRecurringRules(userId))
  }, [userId])

  useEffect(() => { if (open) loadRules() }, [open, loadRules])

  if (!open) return null

  const visibleCats = categories.filter(c => c.kind === type)
  const catMap = new Map(categories.map(c => [c.id, c]))
  const acctMap = new Map(accounts.map(a => [a.id, a]))

  async function addRule() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter an amount greater than 0.'); return }
    if (!categoryId) { setError('Pick a category.'); return }
    setBusy(true)
    setError('')
    try {
      await createRecurringRule({
        user_id: userId, type, amount: amt, category_id: categoryId || null,
        account_id: accountId || null, note: note.trim() || null, frequency: freq,
        next_run: startDate, is_active: true,
      })
      setAmount(''); setNote(''); setCategoryId('')
      await loadRules()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally { setBusy(false) }
  }

  async function removeRule(id: string) {
    await deleteRecurringRule(id)
    await loadRules()
    onChanged()
  }

  return createPortal(
    <div className="bg-overlay" style={{ padding: 0, justifyContent: 'flex-end' }} onClick={onClose}>
      <div className="bg-drawer" onClick={e => e.stopPropagation()}>
        <div className="bg-drawer-head">
          <div className="bg-modal-title">Recurring Transactions</div>
          <button className="bg-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="bg-manage-section">
          <div className="bg-section-label">Active rules</div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>
            Due entries are logged automatically each time you open Budget.
          </div>
          {rules.length === 0 && <div className="bg-empty" style={{ padding: '24px 0' }}><Repeat size={24} className="bg-empty-icon" /><br />No recurring rules yet.</div>}
          {rules.map(r => (
            <div className="bg-manage-row" key={r.id}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  {catMap.get(r.category_id || '')?.name || (r.type === 'income' ? 'Income' : 'Expense')} · {formatINR(r.amount)}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                  {r.frequency} · next {r.next_run}{r.account_id ? ` · ${acctMap.get(r.account_id)?.name}` : ''}
                </div>
              </div>
              <button className="bg-icon-btn" title="Stop" onClick={() => removeRule(r.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        <div className="bg-manage-section">
          <div className="bg-section-label">New recurring rule</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="bg-seg">
              <button className={`bg-seg-btn${type === 'expense' ? ' bg-seg-btn--active' : ''}`} onClick={() => { setType('expense'); setCategoryId('') }}>Expense</button>
              <button className={`bg-seg-btn${type === 'income' ? ' bg-seg-btn--active' : ''}`} onClick={() => { setType('income'); setCategoryId('') }}>Income</button>
            </div>
            <div className="bg-row-2">
              <input className="bg-input" type="number" min="0" step="1" placeholder="Amount (₹)" value={amount} onChange={e => setAmount(e.target.value)} />
              <select className="bg-select" value={freq} onChange={e => setFreq(e.target.value as RecurringFrequency)}>
                {FREQS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <select className="bg-select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Select category…</option>
              {visibleCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="bg-select" value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">No wallet</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div className="bg-row-2">
              <div className="bg-field">
                <label className="bg-field-label">Start / next date</label>
                <input className="bg-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="bg-field">
                <label className="bg-field-label">Note</label>
                <input className="bg-input" type="text" placeholder="optional" value={note} onChange={e => setNote(e.target.value)} />
              </div>
            </div>
            {error && <div style={{ color: 'var(--status-danger)', fontSize: '0.8125rem' }}>{error}</div>}
            <button className="bg-btn bg-btn--primary" onClick={addRule} disabled={busy}><Plus size={14} /> Add rule</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
