'use client'

import { useState } from 'react'
import type { FinanceAccount, FinanceCategory } from '@/lib/types'
import {
  createAccount, updateAccount, deleteAccount,
  createCategory, updateCategory, deleteCategory,
} from '@/lib/data'
import { X, Plus, Trash2, Check } from 'lucide-react'

const PALETTE = ['#96fac2', '#5B9BD5', '#F5A623', '#E85D5D', '#9B7EDE', '#50b380', '#E89B5D', '#E85D9B', '#5DC9E8', '#888888']
const ACCOUNT_TYPES: FinanceAccount['type'][] = ['cash', 'upi', 'bank', 'wallet', 'other']

export default function ManageDrawer({
  open, onClose, userId, categories, accounts, onChanged,
}: {
  open: boolean
  onClose: () => void
  userId: string
  categories: FinanceCategory[]
  accounts: FinanceAccount[]
  onChanged: () => void
}) {
  // wallet form
  const [wName, setWName] = useState('')
  const [wType, setWType] = useState<FinanceAccount['type']>('cash')
  const [wOpening, setWOpening] = useState('')
  const [wColor, setWColor] = useState(PALETTE[0])
  // category form
  const [cName, setCName] = useState('')
  const [cKind, setCKind] = useState<'expense' | 'income'>('expense')
  const [cColor, setCColor] = useState(PALETTE[3])
  const [busy, setBusy] = useState(false)

  if (!open) return null

  async function addWallet() {
    if (!wName.trim()) return
    setBusy(true)
    try {
      await createAccount({
        user_id: userId, name: wName.trim(), type: wType,
        opening_balance: parseFloat(wOpening) || 0, color: wColor, icon: null,
        is_active: true, sort_order: accounts.length,
      })
      setWName(''); setWOpening(''); onChanged()
    } finally { setBusy(false) }
  }

  async function addCategory() {
    if (!cName.trim()) return
    setBusy(true)
    try {
      await createCategory({
        user_id: userId, name: cName.trim(), kind: cKind, color: cColor,
        icon: null, monthly_budget: null, sort_order: categories.length, is_archived: false,
      })
      setCName(''); onChanged()
    } finally { setBusy(false) }
  }

  const expenseCats = categories.filter(c => c.kind === 'expense')
  const incomeCats = categories.filter(c => c.kind === 'income')

  return (
    <div className="bg-overlay" style={{ padding: 0, justifyContent: 'flex-end' }} onClick={onClose}>
      <div className="bg-drawer" onClick={e => e.stopPropagation()}>
        <div className="bg-drawer-head">
          <div className="bg-modal-title">Manage Wallets & Categories</div>
          <button className="bg-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Wallets */}
        <div className="bg-manage-section">
          <div className="bg-section-label">Wallets</div>
          {accounts.map(a => (
            <div className="bg-manage-row" key={a.id}>
              <span className="bg-color-swatch" style={{ background: a.color || '#888' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{a.name}</div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>{a.type} · opens at ₹{a.opening_balance}</div>
              </div>
              <input
                className="bg-input" type="number" step="0.01" defaultValue={a.opening_balance}
                style={{ width: 90 }} title="Opening balance"
                onBlur={async e => {
                  const v = parseFloat(e.target.value)
                  if (!Number.isNaN(v) && v !== Number(a.opening_balance)) { await updateAccount(a.id, { opening_balance: v }); onChanged() }
                }}
              />
              <button className="bg-icon-btn" title="Remove wallet" onClick={async () => { await deleteAccount(a.id); onChanged() }}><Trash2 size={14} /></button>
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <div className="bg-row-2">
              <input className="bg-input" placeholder="Wallet name" value={wName} onChange={e => setWName(e.target.value)} />
              <select className="bg-select" value={wType} onChange={e => setWType(e.target.value as FinanceAccount['type'])}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <input className="bg-input" type="number" step="0.01" placeholder="Opening balance (₹)" value={wOpening} onChange={e => setWOpening(e.target.value)} />
            <div className="bg-palette">
              {PALETTE.map(p => (
                <span key={p} className={`bg-palette-dot${wColor === p ? ' bg-palette-dot--active' : ''}`} style={{ background: p }} onClick={() => setWColor(p)} />
              ))}
            </div>
            <button className="bg-btn bg-btn--primary" onClick={addWallet} disabled={busy}><Plus size={14} /> Add wallet</button>
          </div>
        </div>

        {/* Categories */}
        <div className="bg-manage-section">
          <div className="bg-section-label">Expense categories</div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>Set a monthly budget (₹) per category — leave blank for none.</div>
          {expenseCats.map(c => (
            <div className="bg-manage-row" key={c.id}>
              <span className="bg-color-swatch" style={{ background: c.color || '#888' }} />
              <div style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{c.name}</div>
              <input
                className="bg-input bg-budget-set" type="number" min="0" step="1"
                placeholder="Budget" defaultValue={c.monthly_budget ?? ''} title="Monthly budget (₹)"
                onBlur={async e => {
                  const raw = e.target.value.trim()
                  const v = raw === '' ? null : parseFloat(raw)
                  if (v !== null && Number.isNaN(v)) return
                  if (v !== (c.monthly_budget ?? null)) { await updateCategory(c.id, { monthly_budget: v }); onChanged() }
                }}
              />
              <button className="bg-icon-btn" title="Remove" onClick={async () => { await deleteCategory(c.id); onChanged() }}><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="bg-section-label" style={{ marginTop: 16 }}>Income categories</div>
          {incomeCats.map(c => (
            <div className="bg-manage-row" key={c.id}>
              <span className="bg-color-swatch" style={{ background: c.color || '#888' }} />
              <div style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{c.name}</div>
              <button className="bg-icon-btn" title="Remove" onClick={async () => { await deleteCategory(c.id); onChanged() }}><Trash2 size={14} /></button>
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <div className="bg-row-2">
              <input className="bg-input" placeholder="Category name" value={cName} onChange={e => setCName(e.target.value)} />
              <div className="bg-seg">
                <button className={`bg-seg-btn${cKind === 'expense' ? ' bg-seg-btn--active' : ''}`} onClick={() => setCKind('expense')}>Expense</button>
                <button className={`bg-seg-btn${cKind === 'income' ? ' bg-seg-btn--active' : ''}`} onClick={() => setCKind('income')}>Income</button>
              </div>
            </div>
            <div className="bg-palette">
              {PALETTE.map(p => (
                <span key={p} className={`bg-palette-dot${cColor === p ? ' bg-palette-dot--active' : ''}`} style={{ background: p }} onClick={() => setCColor(p)} />
              ))}
            </div>
            <button className="bg-btn bg-btn--primary" onClick={addCategory} disabled={busy}><Check size={14} /> Add category</button>
          </div>
        </div>
      </div>
    </div>
  )
}
