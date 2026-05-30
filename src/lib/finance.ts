// Pure, Supabase-free helpers for the budget tracker.
import type { Transaction, FinanceAccount } from '@/lib/types'

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
