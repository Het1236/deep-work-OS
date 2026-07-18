'use client'

// Udhaar (lend/borrow) — headline card + management modal.
// Debts move wallet balances but never count as income/expense.

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { FinanceAccount, DebtStatus } from '@/lib/types'
import { getDebts, createDebt, recordRepayment, deleteDebt } from '@/lib/data'
import { formatINR } from '@/lib/finance'
import { HandCoins, X, Plus, Trash2, Check, Loader2, AlertTriangle } from 'lucide-react'

export default function UdhaarCard({ userId, accounts, onChanged }: {
  userId: string
  accounts: FinanceAccount[]
  onChanged: () => void
}) {
  const [debts, setDebts] = useState<DebtStatus[]>([])
  const [open, setOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // add form
  const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent')
  const [person, setPerson] = useState('')
  const [amount, setAmount] = useState('')
  const [walletId, setWalletId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')

  // per-debt repayment input
  const [repayFor, setRepayFor] = useState<string | null>(null)
  const [repayAmt, setRepayAmt] = useState('')
  const [repayWallet, setRepayWallet] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    setDebts(await getDebts(userId))
  }, [userId])

  useEffect(() => { load() }, [load])

  const openDebts = debts.filter(d => d.outstanding > 0)
  const settled = debts.filter(d => d.outstanding <= 0)
  const owedToYou = openDebts.filter(d => d.direction === 'lent').reduce((s, d) => s + d.outstanding, 0)
  const youOwe = openDebts.filter(d => d.direction === 'borrowed').reduce((s, d) => s + d.outstanding, 0)

  function resetAdd() {
    setDirection('lent'); setPerson(''); setAmount(''); setDueDate(''); setNote('')
    setWalletId(accounts[0]?.id || ''); setError(''); setShowAdd(false)
  }

  async function handleAdd() {
    const amt = parseFloat(amount)
    if (!person.trim()) { setError('Who is this with?'); return }
    if (!amt || amt <= 0) { setError('Enter an amount greater than 0.'); return }
    if (!walletId) { setError('Pick a wallet.'); return }
    setBusy(true)
    try {
      await createDebt(userId, { direction, person, amount: amt, walletId, dueDate: dueDate || null, note: note || null })
      resetAdd()
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
    } finally { setBusy(false) }
  }

  async function handleRepay(d: DebtStatus) {
    const amt = parseFloat(repayAmt)
    if (!amt || amt <= 0 || !repayWallet) return
    setBusy(true)
    try {
      await recordRepayment(userId, d, amt, repayWallet)
      setRepayFor(null); setRepayAmt('')
      await load()
      onChanged()
    } finally { setBusy(false) }
  }

  async function handleDelete(d: DebtStatus) {
    if (!confirm(`Delete "${d.direction === 'lent' ? 'lent to' : 'borrowed from'} ${d.person}" and its repayments? Wallet balances will revert.`)) return
    setBusy(true)
    try { await deleteDebt(d.tx.id); await load(); onChanged() } finally { setBusy(false) }
  }

  return (
    <>
      <button className="bg-card ud-card" onClick={() => setOpen(true)}>
        <div className="ud-card-icon"><HandCoins size={18} /></div>
        <div className="ud-card-main">
          <div className="ud-card-title">Udhaar · Lend & Borrow</div>
          <div className="ud-card-nums">
            <span>Owed to you <b className="ud-pos">{formatINR(owedToYou)}</b></span>
            <span>You owe <b className="ud-neg">{formatINR(youOwe)}</b></span>
            {openDebts.some(d => d.overdue) && <span className="ud-overdue"><AlertTriangle size={12} /> overdue</span>}
          </div>
        </div>
        <span className="ud-card-open">{openDebts.length} open →</span>
      </button>

      {open && createPortal(
        <div className="bg-overlay" onClick={() => setOpen(false)}>
          <div className="bg-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="bg-modal-head">
              <div className="bg-modal-title"><HandCoins size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Udhaar — Lend & Borrow</div>
              <button className="bg-icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>

            <div className="bg-modal-body">
              <div className="ud-summary">
                <span>Owed to you <b className="ud-pos">{formatINR(owedToYou)}</b></span>
                <span>You owe <b className="ud-neg">{formatINR(youOwe)}</b></span>
              </div>

              {!showAdd ? (
                <button className="bg-btn bg-btn--primary" style={{ width: '100%' }} onClick={() => { setShowAdd(true); setWalletId(accounts[0]?.id || '') }}>
                  <Plus size={15} /> Add lend / borrow
                </button>
              ) : (
                <div className="ud-add">
                  <div className="bg-seg">
                    <button className={`bg-seg-btn${direction === 'lent' ? ' bg-seg-btn--active' : ''}`} onClick={() => setDirection('lent')}>💸 I lent</button>
                    <button className={`bg-seg-btn${direction === 'borrowed' ? ' bg-seg-btn--active' : ''}`} onClick={() => setDirection('borrowed')}>🤝 I borrowed</button>
                  </div>
                  <div className="bg-field">
                    <label className="bg-field-label">{direction === 'lent' ? 'To whom?' : 'From whom?'}</label>
                    <input className="bg-input" placeholder="Person's name" value={person} onChange={e => setPerson(e.target.value)} autoFocus />
                  </div>
                  <div className="ud-row2">
                    <div className="bg-field">
                      <label className="bg-field-label">Amount (₹)</label>
                      <input className="bg-input" type="number" min="0" inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
                    </div>
                    <div className="bg-field">
                      <label className="bg-field-label">{direction === 'lent' ? 'From wallet' : 'Into wallet'}</label>
                      <select className="bg-select" value={walletId} onChange={e => setWalletId(e.target.value)}>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="ud-row2">
                    <div className="bg-field">
                      <label className="bg-field-label">Expected back by (optional)</label>
                      <input className="bg-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                    <div className="bg-field">
                      <label className="bg-field-label">Note (optional)</label>
                      <input className="bg-input" placeholder="e.g. movie tickets" value={note} onChange={e => setNote(e.target.value)} />
                    </div>
                  </div>
                  {error && <div className="ud-err">{error}</div>}
                  <div className="ud-actions">
                    <button className="bg-btn" onClick={resetAdd} disabled={busy}>Cancel</button>
                    <button className="bg-btn bg-btn--primary" onClick={handleAdd} disabled={busy}>
                      {busy ? <Loader2 size={14} className="ud-spin" /> : <Check size={14} />} Save
                    </button>
                  </div>
                </div>
              )}

              {/* Open debts */}
              {openDebts.length === 0 && !showAdd && (
                <div className="ud-empty">All square — nothing outstanding. 🤝</div>
              )}
              {openDebts.map(d => (
                <div key={d.tx.id} className={`ud-debt${d.overdue ? ' ud-debt--overdue' : ''}`}>
                  <div className="ud-debt-head">
                    <div className="ud-debt-who">
                      <span className="ud-debt-person">{d.direction === 'lent' ? `${d.person} owes you` : `You owe ${d.person}`}</span>
                      <span className="ud-debt-meta">
                        {d.daysOut}d out{d.tx.due_date ? ` · due ${d.tx.due_date}` : ''}{d.overdue ? ' · ⚠ OVERDUE' : ''}
                        {d.repaid > 0 ? ` · ${formatINR(d.repaid)} returned` : ''}
                        {d.tx.note ? ` · ${d.tx.note}` : ''}
                      </span>
                    </div>
                    <div className="ud-debt-right">
                      <span className={`ud-debt-amt ${d.direction === 'lent' ? 'ud-pos' : 'ud-neg'}`}>{formatINR(d.outstanding)}</span>
                      <button className="bg-icon-btn" title="Delete debt" onClick={() => handleDelete(d)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {repayFor === d.tx.id ? (
                    <div className="ud-repay">
                      <input className="bg-input" type="number" min="0" inputMode="decimal" placeholder={`up to ${d.outstanding}`}
                        value={repayAmt} onChange={e => setRepayAmt(e.target.value)} />
                      <select className="bg-select" value={repayWallet} onChange={e => setRepayWallet(e.target.value)}>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <button className="bg-btn" onClick={() => setRepayFor(null)} disabled={busy}>✕</button>
                      <button className="bg-btn bg-btn--primary" onClick={() => handleRepay(d)} disabled={busy || !parseFloat(repayAmt)}>
                        {busy ? <Loader2 size={13} className="ud-spin" /> : <Check size={13} />}
                      </button>
                    </div>
                  ) : (
                    <div className="ud-repay-btns">
                      <button className="bg-btn bg-btn--sm" onClick={() => { setRepayFor(d.tx.id); setRepayAmt(''); setRepayWallet(accounts[0]?.id || '') }}>
                        Record repayment
                      </button>
                      <button className="bg-btn bg-btn--sm" onClick={() => { setRepayFor(d.tx.id); setRepayAmt(String(d.outstanding)); setRepayWallet(accounts[0]?.id || '') }}>
                        Settle {formatINR(d.outstanding)}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Settled history */}
              {settled.length > 0 && (
                <details className="ud-history">
                  <summary>Settled ({settled.length})</summary>
                  {settled.map(d => (
                    <div key={d.tx.id} className="ud-hist-row">
                      <span>{d.direction === 'lent' ? `Lent to ${d.person}` : `Borrowed from ${d.person}`} · {formatINR(d.original)}</span>
                      <span className="ud-hist-meta">{d.tx.txn_date} · ✓ settled</span>
                    </div>
                  ))}
                </details>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      <style jsx global>{`
        .ud-card { display: flex; align-items: center; gap: 13px; width: 100%; text-align: left; cursor: pointer; padding: 14px 16px; border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); transition: all .18s; }
        .ud-card:hover { border-color: var(--border-hover, rgba(255,255,255,0.16)); transform: translateY(-1px); }
        .ud-card-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          background: color-mix(in srgb, #F5A623 16%, transparent); color: #F5A623; }
        .ud-card-main { flex: 1; min-width: 0; }
        .ud-card-title { font-size: 0.8125rem; font-weight: 700; color: var(--text-primary); }
        .ud-card-nums { display: flex; gap: 14px; flex-wrap: wrap; font-size: 0.75rem; color: var(--text-tertiary); margin-top: 3px; }
        .ud-card-nums b { font-variant-numeric: tabular-nums; }
        .ud-card-open { font-size: 0.72rem; color: var(--text-tertiary); flex-shrink: 0; }
        .ud-pos { color: var(--status-success, #34d399); }
        .ud-neg { color: var(--status-danger, #ff6b6b); }
        .ud-overdue { display: inline-flex; align-items: center; gap: 4px; color: #F5A623; font-weight: 600; }
        .ud-summary { display: flex; gap: 18px; flex-wrap: wrap; font-size: 0.85rem; color: var(--text-tertiary); margin-bottom: 14px; }
        .ud-summary b { font-variant-numeric: tabular-nums; }
        .ud-add { display: flex; flex-direction: column; gap: 10px; margin: 12px 0; padding: 13px; border-radius: 11px; border: 1px dashed var(--border-subtle, rgba(255,255,255,0.12)); }
        .ud-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ud-err { font-size: 0.78rem; color: var(--status-danger, #ff6b6b); }
        .ud-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .ud-empty { text-align: center; padding: 22px; color: var(--text-tertiary); font-size: 0.85rem; }
        .ud-debt { margin-top: 10px; padding: 12px 13px; border-radius: 11px; border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); background: rgba(255,255,255,0.015); }
        .ud-debt--overdue { border-color: color-mix(in srgb, #F5A623 45%, transparent); }
        .ud-debt-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ud-debt-person { display: block; font-size: 0.86rem; font-weight: 600; color: var(--text-primary); }
        .ud-debt-meta { display: block; font-size: 0.72rem; color: var(--text-tertiary); margin-top: 2px; }
        .ud-debt-right { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
        .ud-debt-amt { font-size: 0.95rem; font-weight: 700; font-variant-numeric: tabular-nums; }
        .ud-repay { display: flex; gap: 6px; margin-top: 10px; align-items: center; }
        .ud-repay .bg-input { max-width: 130px; }
        .ud-repay .bg-select { max-width: 130px; }
        .ud-repay-btns { display: flex; gap: 7px; margin-top: 10px; }
        .ud-history { margin-top: 14px; }
        .ud-history summary { cursor: pointer; font-size: 0.78rem; color: var(--text-tertiary); }
        .ud-hist-row { display: flex; justify-content: space-between; gap: 10px; padding: 7px 2px; font-size: 0.78rem; color: var(--text-secondary); border-bottom: 1px dashed rgba(255,255,255,0.05); }
        .ud-hist-meta { color: var(--text-tertiary); flex-shrink: 0; }
        .ud-spin { animation: udspin 1s linear infinite; }
        @keyframes udspin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
