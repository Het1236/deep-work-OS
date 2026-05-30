'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { seedFinanceDefaults, getBudgetOverview, getCategories, getAccounts } from '@/lib/data'
import type { BudgetOverview, FinanceCategory, FinanceAccount } from '@/lib/types'
import { formatINR } from '@/lib/finance'
import { motion } from 'framer-motion'
import { Loader2, Wallet, TrendingUp, TrendingDown, Scale } from 'lucide-react'
import OverviewTab from './OverviewTab'
import TransactionsTab from './TransactionsTab'
import './budget.css'

type Tab = 'overview' | 'transactions'

export default function BudgetPage() {
  const { userId, lastUpdate, triggerRefresh } = useUser()
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<BudgetOverview | null>(null)
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    await seedFinanceDefaults(userId)
    const [ov, cats, accts] = await Promise.all([
      getBudgetOverview(userId), getCategories(userId), getAccounts(userId),
    ])
    setOverview(ov); setCategories(cats); setAccounts(accts); setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, lastUpdate])

  useEffect(() => { load() }, [load])

  if (loading || !overview) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const stats = [
    { label: 'Total Balance', value: overview.totalBalance, icon: Wallet, color: 'var(--accent)' },
    { label: 'Income (this month)', value: overview.monthIncome, icon: TrendingUp, color: 'var(--status-success)' },
    { label: 'Spent (this month)', value: overview.monthExpense, icon: TrendingDown, color: 'var(--status-danger)' },
    { label: 'Net (this month)', value: overview.monthNet, icon: Scale, color: overview.monthNet >= 0 ? 'var(--status-success)' : 'var(--status-danger)' },
  ]

  return (
    <div className="bg-page">
      <div className="bg-header animate-fade-in">
        <div>
          <div className="text-subheading">MONEY PROTOCOL</div>
          <h1 className="text-display">Budget Tracker</h1>
        </div>
      </div>

      <div className="bg-stat-grid">
        {stats.map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div
              className="bg-stat bg-card"
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.35 }}
            >
              <div className="bg-stat-icon" style={{ color: s.color }}><Icon size={18} /></div>
              <div className="bg-stat-label">{s.label}</div>
              <div className="bg-stat-value" style={{ color: s.color }}>{formatINR(s.value)}</div>
            </motion.div>
          )
        })}
      </div>

      <div className="bg-tabs">
        <button className={`bg-tab${tab === 'overview' ? ' bg-tab--active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`bg-tab${tab === 'transactions' ? ' bg-tab--active' : ''}`} onClick={() => setTab('transactions')}>Transactions</button>
      </div>

      {tab === 'overview'
        ? <OverviewTab overview={overview} />
        : <TransactionsTab userId={userId!} categories={categories} accounts={accounts} onChanged={() => { load(); triggerRefresh() }} />}
    </div>
  )
}
