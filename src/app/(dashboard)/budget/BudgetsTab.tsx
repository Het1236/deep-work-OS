'use client'

import type { CategoryBudgetStatus } from '@/lib/types'
import { formatINR } from '@/lib/finance'
import { motion } from 'framer-motion'
import { AlertTriangle, Target } from 'lucide-react'

export default function BudgetsTab({ status, onManage }: { status: CategoryBudgetStatus[]; onManage: () => void }) {
  const budgeted = status.filter(s => s.budget > 0)
  const totalBudget = budgeted.reduce((s, c) => s + c.budget, 0)
  const totalSpent = budgeted.reduce((s, c) => s + c.spent, 0)
  const overList = budgeted.filter(s => s.over)

  function barColor(s: CategoryBudgetStatus) {
    if (s.over) return 'var(--status-danger)'
    if (s.pct >= 80) return 'var(--status-warning)'
    return s.color
  }

  if (budgeted.length === 0) {
    return (
      <div className="bg-card bg-empty animate-fade-in">
        <div className="bg-empty-icon"><Target size={32} /></div>
        No budgets set yet. Open <strong>Manage</strong> and give your expense categories a monthly limit.
        <div style={{ marginTop: 16 }}>
          <button className="bg-btn bg-btn--primary" onClick={onManage}>Set budgets</button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {overList.length > 0 && (
        <div className="bg-alert">
          <AlertTriangle size={16} />
          You&apos;ve gone over budget in {overList.length} {overList.length === 1 ? 'category' : 'categories'}: {overList.map(o => o.name).join(', ')}.
        </div>
      )}

      <div className="bg-card" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="bg-card-title">Monthly Budget</div>
        <div className="bg-card-subtitle">{formatINR(totalSpent)} of {formatINR(totalBudget)} spent</div>
        <div className="bg-bar-track" style={{ marginTop: 14, height: 10 }}>
          <div className="bg-bar-fill" style={{
            width: `${totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0}%`,
            background: totalSpent > totalBudget ? 'var(--status-danger)' : 'var(--primary-gradient)',
          }} />
        </div>
      </div>

      <div className="bg-card">
        <div className="bg-card-title">By Category</div>
        <div style={{ marginTop: 8 }}>
          {budgeted.map((s, i) => (
            <div className="bg-budget-row" key={s.categoryId}>
              <div className="bg-budget-head">
                <span className="bg-txn-dot" style={{ background: s.color }} />
                <span className="bg-budget-name">{s.name}</span>
                <span className="bg-budget-figs">{formatINR(s.spent)} / {formatINR(s.budget)}</span>
              </div>
              <div className="bg-bar-track">
                <motion.div className="bg-bar-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, s.pct)}%` }}
                  transition={{ delay: 0.04 * i, duration: 0.5 }}
                  style={{ background: barColor(s) }}
                />
              </div>
              <div className="bg-budget-foot">
                <span style={{ color: s.over ? 'var(--status-danger)' : 'var(--text-tertiary)' }}>
                  {s.over ? `Over by ${formatINR(Math.abs(s.remaining))}` : `${formatINR(s.remaining)} left`}
                </span>
                <span style={{ color: s.over ? 'var(--status-danger)' : 'var(--text-tertiary)' }}>{s.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
