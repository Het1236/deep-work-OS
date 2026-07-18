'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import {
  seedFinanceDefaults, getBudgetOverview, getCategories, getAccounts,
  getBudgetStatus, getSavingsGoals, getMonthlyTrends, processDueRecurring,
} from '@/lib/data'
import type {
  BudgetOverview, FinanceCategory, FinanceAccount, CategoryBudgetStatus, SavingsGoalStatus, MonthlyTrend,
} from '@/lib/types'
import { formatINR, monthLabel, shiftMonth } from '@/lib/finance'
import { motion } from 'framer-motion'
import { Loader2, Wallet, TrendingUp, TrendingDown, Scale, ChevronLeft, ChevronRight } from 'lucide-react'
import OverviewTab from './OverviewTab'
import TransactionsTab from './TransactionsTab'
import UdhaarCard from './UdhaarCard'
import BudgetsTab from './BudgetsTab'
import GoalsTab from './GoalsTab'
import './budget.css'

type Tab = 'overview' | 'transactions' | 'budgets' | 'goals'

const isCurrentMonth = (d: Date) => {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export default function BudgetPage() {
  const { userId, lastUpdate, triggerRefresh } = useUser()
  const [tab, setTab] = useState<Tab>('overview')
  const [refMonth, setRefMonth] = useState<Date>(() => new Date())
  const [overview, setOverview] = useState<BudgetOverview | null>(null)
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [budgetStatus, setBudgetStatus] = useState<CategoryBudgetStatus[]>([])
  const [goals, setGoals] = useState<SavingsGoalStatus[]>([])
  const [trends, setTrends] = useState<MonthlyTrend[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    await seedFinanceDefaults(userId)
    await processDueRecurring(userId)
    const [ov, cats, accts, status, gls, trd] = await Promise.all([
      getBudgetOverview(userId, refMonth), getCategories(userId), getAccounts(userId),
      getBudgetStatus(userId, refMonth), getSavingsGoals(userId), getMonthlyTrends(userId, 6, refMonth),
    ])
    setOverview(ov); setCategories(cats); setAccounts(accts)
    setBudgetStatus(status); setGoals(gls); setTrends(trd); setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, lastUpdate, refMonth])

  useEffect(() => { load() }, [load])

  if (loading || !overview) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const atCurrent = isCurrentMonth(refMonth)
  const stats = [
    { label: 'Total Balance', value: overview.totalBalance, icon: Wallet, color: 'var(--accent)' },
    { label: 'Income', value: overview.monthIncome, icon: TrendingUp, color: 'var(--status-success)' },
    { label: 'Spent on you', value: overview.monthExpense, icon: TrendingDown, color: 'var(--status-danger)' },
    { label: 'Net', value: overview.monthNet, icon: Scale, color: overview.monthNet >= 0 ? 'var(--status-success)' : 'var(--status-danger)' },
  ]

  return (
    <div className="bg-page">
      <div className="bg-header animate-fade-in">
        <div>
          <div className="text-subheading">MONEY PROTOCOL</div>
          <h1 className="text-display">Budget Tracker</h1>
        </div>
        <div className="bg-month-switcher">
          <button className="bg-icon-btn" title="Previous month" onClick={() => setRefMonth(m => shiftMonth(m, -1))}><ChevronLeft size={18} /></button>
          <span className="bg-month-label">{monthLabel(refMonth)}</span>
          <button className="bg-icon-btn" title="Next month" onClick={() => setRefMonth(m => shiftMonth(m, 1))} disabled={atCurrent}><ChevronRight size={18} /></button>
          {!atCurrent && <button className="bg-btn bg-btn--sm" onClick={() => setRefMonth(new Date())}>Today</button>}
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

      <UdhaarCard userId={userId!} accounts={accounts} onChanged={() => { load(); triggerRefresh() }} />

      <div className="bg-tabs">
        <button className={`bg-tab${tab === 'overview' ? ' bg-tab--active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`bg-tab${tab === 'transactions' ? ' bg-tab--active' : ''}`} onClick={() => setTab('transactions')}>Transactions</button>
        <button className={`bg-tab${tab === 'budgets' ? ' bg-tab--active' : ''}`} onClick={() => setTab('budgets')}>Budgets</button>
        <button className={`bg-tab${tab === 'goals' ? ' bg-tab--active' : ''}`} onClick={() => setTab('goals')}>Goals</button>
      </div>

      {tab === 'overview' && <OverviewTab overview={overview} trends={trends} userId={userId!} onChanged={() => { load(); triggerRefresh() }} />}
      {tab === 'transactions' && <TransactionsTab userId={userId!} categories={categories} accounts={accounts} refMonth={refMonth} onChanged={() => { load(); triggerRefresh() }} />}
      {tab === 'budgets' && <BudgetsTab status={budgetStatus} onManage={() => setTab('transactions')} />}
      {tab === 'goals' && <GoalsTab userId={userId!} goals={goals} accounts={accounts} onChanged={() => { load(); triggerRefresh() }} />}
    </div>
  )
}
