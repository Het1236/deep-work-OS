'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { getHabits, getHabitLogs, toggleHabitLog, createHabit, awardXP } from '@/lib/data'
import type { Habit, HabitLog } from '@/lib/types'
import { useXPToast } from '@/components/XPToast'
import {
  CheckCircle2, Circle, Flame, Plus, Sun, Cloud, Moon, X, Loader2
} from 'lucide-react'

const timeIcons: Record<string, React.ElementType> = {
  morning: Sun,
  afternoon: Cloud,
  evening: Moon,
}

const timeLabels: Record<string, string> = {
  morning: 'Morning Rituals',
  afternoon: 'Afternoon Power',
  evening: 'Evening Wind-Down',
}

function ContributionGrid({ habitId, logs }: { habitId: string; logs: HabitLog[] }) {
  const cells = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    const dateStr = d.toISOString().split('T')[0]
    const log = logs.find(l => l.habit_id === habitId && l.log_date === dateStr)
    return { date: dateStr, done: log?.completed ?? false }
  })

  return (
    <div className="contrib-grid">
      {cells.map((cell, i) => (
        <div
          key={i}
          className={`contrib-cell ${cell.done ? 'contrib-done' : ''}`}
          title={cell.date}
        />
      ))}
      <style jsx>{`
        .contrib-grid { display: flex; flex-wrap: wrap; gap: 3px; }
        .contrib-cell { width: 10px; height: 10px; border-radius: 2px; background: var(--bg-hover); transition: background var(--transition-fast); }
        .contrib-done { background: var(--accent); }
      `}</style>
    </div>
  )
}

function getStreak(habitId: string, logs: HabitLog[]): number {
  let streak = 0
  const habitLogs = logs.filter(l => l.habit_id === habitId && l.completed)
  const dates = new Set(habitLogs.map(l => l.log_date))
  const d = new Date()
  for (let i = 0; i < 60; i++) {
    const dateStr = d.toISOString().split('T')[0]
    if (dates.has(dateStr)) {
      streak++
    } else if (i > 0) {
      break
    }
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export default function HabitsPage() {
  const { userId } = useUser()
  const { showXP } = useXPToast()
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTime, setNewTime] = useState('morning')
  const [newTag, setNewTag] = useState('')

  const today = new Date().toISOString().split('T')[0]

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const [h, l] = await Promise.all([
      getHabits(userId),
      getHabitLogs(userId, thirtyDaysAgo.toISOString().split('T')[0], today),
    ])
    setHabits(h)
    setLogs(l)
    setLoading(false)
  }, [userId, today])

  useEffect(() => { loadData() }, [loadData])

  async function handleToggle(habitId: string, currentlyDone: boolean) {
    if (!userId) return
    // Optimistic update
    setLogs(prev => {
      const existing = prev.find(l => l.habit_id === habitId && l.log_date === today)
      if (existing) {
        return prev.map(l => l.id === existing.id ? { ...l, completed: !currentlyDone } : l)
      }
      return [...prev, { id: crypto.randomUUID(), habit_id: habitId, user_id: userId, log_date: today, completed: !currentlyDone, note: null }]
    })
    await toggleHabitLog(userId, habitId, today, !currentlyDone)

    // Award XP only when completing (not unchecking)
    if (!currentlyDone) {
      try {
        const result = await awardXP(userId, 'habit_complete', { habitId })
        showXP(result.xpAwarded, 'Habit Complete')
      } catch (err) {
        console.error('XP award failed', err)
      }
    }
  }

  async function handleAddHabit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !newName.trim()) return
    await createHabit({
      user_id: userId,
      name: newName.trim(),
      time_of_day: newTime,
      identity_tag: newTag || undefined,
    })
    setNewName('')
    setNewTag('')
    setShowAdd(false)
    loadData()
  }

  function isTodayDone(habitId: string) {
    return logs.some(l => l.habit_id === habitId && l.log_date === today && l.completed)
  }

  const completed = habits.filter(h => isTodayDone(h.id)).length
  const total = habits.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  const grouped = {
    morning: habits.filter(h => h.time_of_day === 'morning'),
    afternoon: habits.filter(h => h.time_of_day === 'afternoon'),
    evening: habits.filter(h => h.time_of_day === 'evening'),
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div className="habits-page">
      {/* Header */}
      <div className="habits-header animate-fade-in">
        <div>
          <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={22} style={{ color: 'var(--accent)' }} /> Habit Tracker
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> New Habit
        </button>
      </div>

      {/* Add Habit Modal */}
      {showAdd && (
        <div className="card animate-fade-in" style={{ border: '1px solid var(--accent)', borderColor: 'rgba(76,175,125,0.3)' }}>
          <form onSubmit={handleAddHabit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>New Habit</span>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)} style={{ padding: '4px' }}>
                <X size={16} />
              </button>
            </div>
            <input className="input" placeholder="Habit name (e.g. Morning meditation)" value={newName} onChange={e => setNewName(e.target.value)} required autoFocus />
            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <select className="input" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ flex: 1 }}>
                <option value="morning">🌅 Morning</option>
                <option value="afternoon">☀️ Afternoon</option>
                <option value="evening">🌙 Evening</option>
              </select>
              <input className="input" placeholder="Identity tag (optional)" value={newTag} onChange={e => setNewTag(e.target.value)} style={{ flex: 1 }} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>Add Habit</button>
          </form>
        </div>
      )}

      {/* Progress Overview */}
      <div className="habits-overview card animate-fade-in" style={{ animationDelay: '0.05s' }}>
        <div className="habits-progress-row">
          <div>
            <span className="text-mono" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {completed}/{total}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginLeft: '8px' }}>completed today</span>
          </div>
          <span className="badge badge-green" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>{pct}%</span>
        </div>
        <div className="progress-bar" style={{ marginTop: '12px', height: '6px' }}>
          <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Empty State */}
      {habits.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--text-tertiary)' }}>
          <CheckCircle2 size={40} style={{ margin: '0 auto var(--space-md)', opacity: 0.3 }} />
          <p style={{ fontSize: '0.9375rem', fontWeight: 500 }}>No habits yet</p>
          <p style={{ fontSize: '0.8125rem', marginTop: '4px' }}>Click &quot;New Habit&quot; to start building your routine</p>
        </div>
      )}

      {/* Habit Sections */}
      {(Object.keys(grouped) as Array<keyof typeof grouped>).map((timeOfDay, sectionIdx) => {
        const Icon = timeIcons[timeOfDay]
        const sectionHabits = grouped[timeOfDay]
        if (sectionHabits.length === 0) return null

        return (
          <div key={timeOfDay} className="habit-section animate-fade-in" style={{ animationDelay: `${0.1 + sectionIdx * 0.05}s` }}>
            <div className="habit-section-header">
              <Icon size={16} />
              <span>{timeLabels[timeOfDay]}</span>
            </div>
            <div className="habit-cards">
              {sectionHabits.map(habit => {
                const done = isTodayDone(habit.id)
                const streak = getStreak(habit.id, logs)
                return (
                  <div key={habit.id} className={`habit-card ${done ? 'habit-card-done' : ''}`}>
                    <div className="habit-card-top">
                      <button className="habit-check" onClick={() => handleToggle(habit.id, done)}>
                        {done ? (
                          <CheckCircle2 size={22} style={{ color: 'var(--accent)' }} />
                        ) : (
                          <Circle size={22} style={{ color: 'var(--text-tertiary)' }} />
                        )}
                      </button>
                      <div className="habit-card-info">
                        <div className="habit-card-name">{habit.name}</div>
                        {habit.identity_tag && <div className="habit-card-tag">{habit.identity_tag}</div>}
                      </div>
                      <div className="habit-card-streak">
                        <Flame size={14} style={{ color: streak >= 7 ? 'var(--status-warning)' : 'var(--text-tertiary)' }} />
                        <span className="text-mono">{streak}d</span>
                      </div>
                    </div>
                    <div className="habit-card-grid">
                      <ContributionGrid habitId={habit.id} logs={logs} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <style jsx>{`
        .habits-page { display: flex; flex-direction: column; gap: var(--space-xl); }
        .habits-header { display: flex; align-items: center; justify-content: space-between; }
        .habits-progress-row { display: flex; align-items: center; justify-content: space-between; }
        .habit-section-header { display: flex; align-items: center; gap: var(--space-sm); font-size: 0.8125rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-md); }
        .habit-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--space-md); }
        .habit-card { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--space-lg); transition: all var(--transition-fast); }
        .habit-card:hover { border-color: var(--border-hover); }
        .habit-card-done { border-color: rgba(76,175,125,0.15); background: rgba(76,175,125,0.02); }
        .habit-card-top { display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-md); }
        .habit-check { background: none; border: none; cursor: pointer; padding: 0; display: flex; }
        .habit-card-info { flex: 1; }
        .habit-card-name { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
        .habit-card-tag { font-size: 0.75rem; color: var(--text-tertiary); margin-top: 2px; }
        .habit-card-streak { display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--text-secondary); }
        .habit-card-grid { padding-top: var(--space-sm); border-top: 1px solid var(--border-subtle); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
