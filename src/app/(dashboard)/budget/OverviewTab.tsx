'use client'

import type { BudgetOverview } from '@/lib/types'
import { formatINR } from '@/lib/finance'
import { PieChartIcon, Inbox } from 'lucide-react'
import {
  PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const moneyTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(15,15,15,0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '10px 14px', fontSize: '0.75rem',
      backdropFilter: 'blur(12px)',
    }}>
      {label && <div style={{ color: '#888', marginBottom: 4 }}>{label}</div>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.payload?.color, display: 'inline-block' }} />
          <span style={{ color: '#aaa' }}>{p.name}:</span>
          <span style={{ color: '#eee', fontWeight: 700 }}>{formatINR(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

export default function OverviewTab({ overview }: { overview: BudgetOverview }) {
  const { accounts, categorySpend, dailySeries, recentTransactions, monthExpense } = overview

  const dailyData = dailySeries.map(d => ({
    day: d.date.slice(8), // DD
    Income: d.income,
    Expense: d.expense,
  }))

  const hasMonthData = categorySpend.length > 0 || dailySeries.length > 0

  return (
    <div className="animate-fade-in">
      {/* Wallet chips */}
      {accounts.length > 0 && (
        <div className="bg-wallets">
          {accounts.map(a => (
            <div className="bg-wallet-chip" key={a.id}>
              <span className="bg-wallet-dot" style={{ background: a.color || '#888' }} />
              <div>
                <div className="bg-wallet-name">{a.name}</div>
                <div className="bg-wallet-bal">{formatINR(a.balance)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!hasMonthData && (
        <div className="bg-card bg-empty">
          <div className="bg-empty-icon"><Inbox size={32} /></div>
          No activity this month yet — add a transaction to see your charts come alive.
        </div>
      )}

      {hasMonthData && (
        <div className="bg-grid-2">
          {/* Spending by category donut */}
          <div className="bg-card">
            <div className="bg-card-title">Spending by Category</div>
            <div className="bg-card-subtitle">This month</div>
            {categorySpend.length === 0 ? (
              <div className="bg-empty"><PieChartIcon size={28} className="bg-empty-icon" /><br />No expenses logged yet.</div>
            ) : (
              <div className="bg-donut-wrap" style={{ marginTop: 8 }}>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={categorySpend}
                      dataKey="total"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {categorySpend.map((c) => <Cell key={c.categoryId} fill={c.color} />)}
                    </Pie>
                    <Tooltip content={moneyTooltip} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="bg-donut-center">
                  <div className="bg-donut-center-label">Spent</div>
                  <div className="bg-donut-center-value">{formatINR(monthExpense)}</div>
                </div>
              </div>
            )}
            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              {categorySpend.slice(0, 8).map(c => (
                <span key={c.categoryId} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                  {c.name}
                </span>
              ))}
            </div>
          </div>

          {/* Daily flow area chart */}
          <div className="bg-card">
            <div className="bg-card-title">Daily Cash Flow</div>
            <div className="bg-card-subtitle">Income vs spending this month</div>
            {dailyData.length === 0 ? (
              <div className="bg-empty">No daily activity yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={dailyData} margin={{ top: 12, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4CAF7D" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#4CAF7D" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E85D5D" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#E85D5D" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={moneyTooltip} />
                  <Area type="monotone" dataKey="Income" stroke="#4CAF7D" strokeWidth={2} fill="url(#gInc)" />
                  <Area type="monotone" dataKey="Expense" stroke="#E85D5D" strokeWidth={2} fill="url(#gExp)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div className="bg-card">
        <div className="bg-card-title">Recent Transactions</div>
        <div className="bg-card-subtitle">Latest activity this month</div>
        {recentTransactions.length === 0 ? (
          <div className="bg-empty">Nothing logged yet this month.</div>
        ) : (
          <div className="bg-txn-list" style={{ marginTop: 8 }}>
            {recentTransactions.map(t => {
              const isIncome = t.type === 'income'
              const sign = isIncome ? '+' : t.type === 'expense' ? '−' : ''
              return (
                <div className="bg-txn-row" key={t.id}>
                  <div className="bg-txn-main">
                    <div className="bg-txn-title">{t.note || (isIncome ? 'Income' : t.type === 'transfer' ? 'Transfer' : 'Expense')}</div>
                    <div className="bg-txn-meta">{t.txn_date}</div>
                  </div>
                  <div className={`bg-txn-amount ${isIncome ? 'amt-pos' : t.type === 'expense' ? 'amt-neg' : ''}`}>
                    {sign}{formatINR(t.amount)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
