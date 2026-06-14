// Pure, Supabase-free helpers for the budget tracker.
import type { Transaction, FinanceAccount, RecurringFrequency } from '@/lib/types'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// INR formatting, e.g. 123456.5 -> "₹1,23,457" (rounded) ; withPaise keeps 2 dp
export function formatINR(amount: number, withPaise = false): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: withPaise ? 2 : 0,
    minimumFractionDigits: withPaise ? 2 : 0,
  }).format(amount || 0)
}

// First/last day (YYYY-MM-DD) of the month containing `ref` (default: today)
export function monthRange(ref: Date = new Date()): { start: string; end: string } {
  const y = ref.getFullYear(), m = ref.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(start), end: fmt(end) }
}

// Running balance of one account given all of the user's transactions.
export function accountBalance(account: FinanceAccount, txns: Transaction[]): number {
  let bal = Number(account.opening_balance) || 0
  for (const t of txns) {
    const amt = Number(t.amount) || 0
    if (t.type === 'income' && t.account_id === account.id) bal += amt
    else if (t.type === 'expense' && t.account_id === account.id) bal -= amt
    else if (t.type === 'transfer') {
      if (t.account_id === account.id) bal -= amt
      if (t.to_account_id === account.id) bal += amt
    }
  }
  return bal
}

// Whole days from today until `dateStr` (YYYY-MM-DD); negative = overdue
export function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

// Advance a YYYY-MM-DD date by one period of the given frequency.
export function addPeriod(dateStr: string, freq: RecurringFrequency): string {
  const d = new Date(dateStr + 'T00:00:00')
  if (freq === 'daily') d.setDate(d.getDate() + 1)
  else if (freq === 'weekly') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  return ymd(d)
}

// "2026-05" key for the month containing ref
export function monthKey(ref: Date = new Date()): string {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`
}

// "May 2026" label
export function monthLabel(ref: Date = new Date()): string {
  return ref.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// Returns a new Date shifted by `delta` whole months (day pinned to 1 to avoid overflow)
export function shiftMonth(ref: Date, delta: number): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + delta, 1)
}

export type BalEffect = { walletName: string; before: number; after: number }

// Per-transaction wallet balance before/after, computed by replaying all transactions
// chronologically from each wallet's opening balance.
export function computeRunningBalances(accounts: FinanceAccount[], txns: Transaction[]): Map<string, BalEffect[]> {
  const bal = new Map<string, number>()
  const name = new Map<string, string>()
  for (const a of accounts) { bal.set(a.id, Number(a.opening_balance) || 0); name.set(a.id, a.name) }

  const sorted = [...txns].sort((a, b) =>
    a.txn_date < b.txn_date ? -1 : a.txn_date > b.txn_date ? 1 : (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)
  )

  const out = new Map<string, BalEffect[]>()
  const applyOut = (effects: BalEffect[], accId: string | null, amt: number) => {
    if (!accId || !bal.has(accId)) return
    const before = bal.get(accId)!; const after = before - amt
    bal.set(accId, after); effects.push({ walletName: name.get(accId) || '', before, after })
  }
  const applyIn = (effects: BalEffect[], accId: string | null, amt: number) => {
    if (!accId || !bal.has(accId)) return
    const before = bal.get(accId)!; const after = before + amt
    bal.set(accId, after); effects.push({ walletName: name.get(accId) || '', before, after })
  }

  for (const t of sorted) {
    const amt = Number(t.amount) || 0
    const effects: BalEffect[] = []
    if (t.type === 'income') applyIn(effects, t.account_id, amt)
    else if (t.type === 'expense') applyOut(effects, t.account_id, amt)
    else if (t.type === 'transfer') { applyOut(effects, t.account_id, amt); applyIn(effects, t.to_account_id, amt) }
    out.set(t.id, effects)
  }
  return out
}
