'use client'

import { useState } from 'react'
import type { SavingsGoalStatus } from '@/lib/types'
import { deleteSavingsGoal } from '@/lib/data'
import { formatINR } from '@/lib/finance'
import { motion } from 'framer-motion'
import { Plus, PiggyBank, Pencil, Trash2, Check } from 'lucide-react'
import GoalModal from './GoalModal'
import ContributeModal from './ContributeModal'

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 24
  const c = 2 * Math.PI * r
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--bg-input)" strokeWidth="5" />
      <circle
        cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, pct)) / 100}
        transform="rotate(-90 28 28)" style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  )
}

function countdown(daysLeft: number | null): string {
  if (daysLeft === null) return 'No deadline'
  if (daysLeft === 0) return 'Due today'
  if (daysLeft < 0) return `Overdue by ${Math.abs(daysLeft)}d`
  return `${daysLeft} days left`
}

export default function GoalsTab({
  userId, goals, onChanged,
}: {
  userId: string
  goals: SavingsGoalStatus[]
  onChanged: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SavingsGoalStatus | null>(null)
  const [contributeFor, setContributeFor] = useState<SavingsGoalStatus | null>(null)

  async function handleDelete(g: SavingsGoalStatus) {
    await deleteSavingsGoal(g.id)
    onChanged()
  }

  return (
    <div className="animate-fade-in">
      <div className="bg-toolbar">
        <button className="bg-btn bg-btn--primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={15} /> New Goal
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="bg-card bg-empty">
          <div className="bg-empty-icon"><PiggyBank size={32} /></div>
          No savings goals yet. Set one — like &ldquo;₹5,000 for a trip&rdquo; — and start stacking up.
        </div>
      ) : (
        <div className="bg-goal-grid">
          {goals.map((g, i) => {
            const ringColor = g.is_achieved ? 'var(--status-success)' : (g.color || 'var(--accent)')
            return (
              <motion.div
                className="bg-card bg-goal-card"
                key={g.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.35 }}
              >
                <div className="bg-goal-top">
                  <div className="bg-goal-ring">
                    <Ring pct={g.pct} color={ringColor} />
                    <div className="bg-goal-ring-pct">{g.pct}%</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="bg-goal-name">{g.name}</div>
                    <div className="bg-goal-sub">{countdown(g.daysLeft)}</div>
                  </div>
                  {g.is_achieved && <span className="bg-goal-badge"><Check size={10} style={{ verticalAlign: 'middle' }} /> Done</span>}
                </div>

                <div className="bg-goal-figs">
                  <span>{formatINR(g.saved)}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>of {formatINR(g.target_amount)}</span>
                </div>
                <div className="bg-bar-track">
                  <motion.div className="bg-bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${g.pct}%` }}
                    transition={{ delay: 0.04 * i + 0.1, duration: 0.5 }}
                    style={{ background: g.is_achieved ? 'var(--status-success)' : (g.color || 'var(--primary-gradient)') }}
                  />
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                  {g.remaining > 0 ? `${formatINR(g.remaining)} to go` : 'Fully funded 🎉'}
                </div>

                <div className="bg-goal-actions">
                  <button className="bg-btn bg-btn--primary bg-btn--sm bg-btn--full" onClick={() => setContributeFor(g)} disabled={g.remaining <= 0}>
                    <Plus size={13} /> Add money
                  </button>
                  <button className="bg-icon-btn" title="Edit" onClick={() => { setEditing(g); setModalOpen(true) }}><Pencil size={14} /></button>
                  <button className="bg-icon-btn" title="Delete" onClick={() => handleDelete(g)}><Trash2 size={14} /></button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      <GoalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        userId={userId}
        editing={editing}
        sortOrder={goals.length}
        onSaved={onChanged}
      />
      <ContributeModal
        open={!!contributeFor}
        onClose={() => setContributeFor(null)}
        userId={userId}
        goal={contributeFor}
        onSaved={onChanged}
      />
    </div>
  )
}
