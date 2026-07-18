'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { FinanceAccount, FinanceCategory, Transaction } from '@/lib/types'
import { getTransactions, deleteTransaction, getDebts } from '@/lib/data'
import { formatINR, monthRange, monthLabel, computeRunningBalances, type BalEffect } from '@/lib/finance'
import { Plus, Settings2, Pencil, Trash2, Inbox, Repeat, FileDown, FileText, ChevronDown } from 'lucide-react'
import TransactionModal from './TransactionModal'
import ManageDrawer from './ManageDrawer'
import RecurringDrawer from './RecurringDrawer'
import { exportTransactionsCSV, exportTransactionsPDF } from './exportUtils'

export default function TransactionsTab({
  userId, categories, accounts, refMonth, onChanged,
}: {
  userId: string
  categories: FinanceCategory[]
  accounts: FinanceAccount[]
  refMonth: Date
  onChanged: () => void
}) {
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<'' | 'income' | 'expense' | 'transfer'>('')
  const [catFilter, setCatFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [balMap, setBalMap] = useState<Map<string, BalEffect[]>>(new Map())

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const acctMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const label = monthLabel(refMonth)

  const load = useCallback(async () => {
    setLoading(true)
    const { start, end } = monthRange(refMonth)
    const [rows, allRows] = await Promise.all([
      getTransactions(userId, { start, end, type: typeFilter || undefined, categoryId: catFilter || undefined }),
      getTransactions(userId), // all-time, for running balance
    ])
    setTxns(rows)
    setBalMap(computeRunningBalances(accounts, allRows))
    setLoading(false)
  }, [userId, typeFilter, catFilter, refMonth, accounts])

  useEffect(() => { load() }, [load])

  function refreshAll() {
    load()
    onChanged()
  }

  async function handleDelete(id: string) {
    await deleteTransaction(id)
    refreshAll()
  }

  return (
    <div className="animate-fade-in">
      <div className="bg-toolbar">
        <button className="bg-btn bg-btn--primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={15} /> Add Transaction
        </button>
        <select className="bg-select" style={{ width: 'auto' }} value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}>
          <option value="">All types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
        <select className="bg-select" style={{ width: 'auto' }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="bg-spacer" />
        <button className="bg-btn" onClick={() => setRecurringOpen(true)}><Repeat size={15} /> Recurring</button>
        <button className="bg-btn" onClick={() => exportTransactionsCSV(txns, { catMap, acctMap }, label)} disabled={txns.length === 0} title="Export CSV"><FileDown size={15} /> CSV</button>
        <button className="bg-btn" onClick={async () => exportTransactionsPDF(txns, { catMap, acctMap }, label, await getDebts(userId))} disabled={txns.length === 0} title="Export PDF"><FileText size={15} /> PDF</button>
        <button className="bg-btn" onClick={() => setDrawerOpen(true)}><Settings2 size={15} /> Manage</button>
      </div>

      <div className="bg-card">
        <div className="bg-card-title">{label} · Transactions</div>
        {loading ? (
          <div className="bg-empty">Loading…</div>
        ) : txns.length === 0 ? (
          <div className="bg-empty">
            <div className="bg-empty-icon"><Inbox size={32} /></div>
            No transactions yet — add your first to start tracking.
          </div>
        ) : (
          <div className="bg-txn-list" style={{ marginTop: 8 }}>
            {txns.map(t => {
              const cat = t.category_id ? catMap.get(t.category_id) : null
              const acct = t.account_id ? acctMap.get(t.account_id) : null
              const toAcct = t.to_account_id ? acctMap.get(t.to_account_id) : null
              const isIncome = t.type === 'income'
              const isExpense = t.type === 'expense'
              const isDebt = t.type === 'lend' || t.type === 'borrow' || t.type === 'repayment'
              // Debt rows: money out (account_id) shows −, money in (to_account_id) shows +.
              const debtOut = isDebt && !!t.account_id
              const sign = isIncome ? '+' : isExpense ? '−' : isDebt ? (debtOut ? '−' : '+') : ''
              const isGoal = !!t.goal_id
              const goalWallet = acct?.name || toAcct?.name
              const dotColor = cat?.color || (isGoal ? '#4CAF7D' : isDebt ? '#F5A623' : t.type === 'transfer' ? '#5B9BD5' : '#888')
              const title = isGoal
                ? (t.note || 'Savings')
                : t.type === 'lend'
                  ? `💸 Lent to ${t.person || '?'}`
                  : t.type === 'borrow'
                    ? `💸 Borrowed from ${t.person || '?'}`
                    : t.type === 'repayment'
                      ? (debtOut ? `💸 Repaid ${t.person || '?'}` : `💸 ${t.person || '?'} repaid you`)
                      : t.type === 'transfer'
                        ? `Transfer${acct ? ` from ${acct.name}` : ''}${toAcct ? ` → ${toAcct.name}` : ''}`
                        : (cat?.name || (isIncome ? 'Income' : 'Expense'))
              const meta = isGoal
                ? [t.txn_date, goalWallet].filter(Boolean).join(' · ')
                : isDebt
                  ? [t.txn_date, t.note, (acct || toAcct)?.name, t.type !== 'repayment' && t.is_settled ? '✓ settled' : null].filter(Boolean).join(' · ')
                  : [t.txn_date, t.note, t.type !== 'transfer' && acct ? acct.name : null].filter(Boolean).join(' · ')
              const expanded = expandedId === t.id
              const effects = balMap.get(t.id) || []
              return (
                <div key={t.id}>
                  <div className="bg-txn-row" style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expanded ? null : t.id)}>
                    <span className="bg-txn-dot" style={{ background: dotColor }} />
                    <div className="bg-txn-main">
                      <div className="bg-txn-title">{title}</div>
                      <div className="bg-txn-meta">{meta}</div>
                    </div>
                    <div className={`bg-txn-amount ${isIncome || (isDebt && !debtOut) ? 'amt-pos' : isExpense || debtOut ? 'amt-neg' : ''}`}>
                      {sign}{formatINR(t.amount)}
                    </div>
                    <div className="bg-txn-actions">
                      <ChevronDown size={14} style={{ color: 'var(--text-tertiary)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      <button className="bg-icon-btn" title="Edit" onClick={e => { e.stopPropagation(); setEditing(t); setModalOpen(true) }}><Pencil size={14} /></button>
                      <button className="bg-icon-btn" title="Delete" onClick={e => { e.stopPropagation(); handleDelete(t.id) }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ padding: '6px 4px 12px 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {effects.length === 0 ? (
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>No wallet movement recorded.</div>
                      ) : effects.map((e, i) => (
                        <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.walletName}</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>{formatINR(e.before)}</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                          <span className="text-mono" style={{ color: e.after >= 0 ? 'var(--text-primary)' : 'var(--status-danger)', fontWeight: 700 }}>{formatINR(e.after)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        userId={userId}
        categories={categories}
        accounts={accounts}
        editing={editing}
        onSaved={refreshAll}
      />
      <ManageDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userId={userId}
        categories={categories}
        accounts={accounts}
        onChanged={onChanged}
      />
      <RecurringDrawer
        open={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        userId={userId}
        categories={categories}
        accounts={accounts}
        onChanged={refreshAll}
      />
    </div>
  )
}
