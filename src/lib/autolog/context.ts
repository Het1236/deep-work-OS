import type { Admin } from './auth'
import type { FinanceAccount, Transaction } from '@/lib/types'
import type { CategoryLite, RuleLite, OpenLent } from './classify'
import { computeDebtStatuses } from '@/lib/finance'

export type LedgerContext = {
  wallets: FinanceAccount[]
  categories: (CategoryLite & { sort_order: number })[]
  rules: RuleLite[]
  txns: Transaction[]
  openLent: OpenLent[]
}

export async function loadLedgerContext(admin: Admin, userId: string): Promise<LedgerContext> {
  const [w, c, r, t] = await Promise.all([
    admin.from('finance_accounts').select('*').eq('user_id', userId).eq('is_active', true).order('sort_order'),
    admin.from('finance_categories').select('id,name,kind,sort_order').eq('user_id', userId).eq('is_archived', false).order('sort_order'),
    admin.from('merchant_rules').select('match,category_id').eq('user_id', userId),
    admin.from('transactions').select('*').eq('user_id', userId),
  ])
  const txns = (t.data || []) as Transaction[]
  const openLent = computeDebtStatuses(txns)
    .filter(d => d.direction === 'lent' && d.outstanding > 0)
    .map(d => ({ txId: d.tx.id, person: d.person, outstanding: d.outstanding }))
  return {
    wallets: (w.data || []) as FinanceAccount[],
    categories: (c.data || []) as LedgerContext['categories'],
    rules: (r.data || []) as RuleLite[],
    txns, openLent,
  }
}
