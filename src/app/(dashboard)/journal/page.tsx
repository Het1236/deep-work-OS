'use client'

import { BookOpen, Plus, Heart, Zap, Sun, Save, Loader2, X } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { getJournalEntries, upsertJournalEntry, awardXP, checkAndAwardBadges } from '@/lib/data'
import { useXPToast } from '@/components/XPToast'
import type { JournalEntry } from '@/lib/types'

const energyEmoji = ['', '😴', '😐', '🙂', '😊', '🔥']

export default function JournalPage() {
  const { userId } = useUser()
  const { showXP, showBadge } = useXPToast()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Generate last 14 days
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().split('T')[0]
  })

  // Edit form state
  const [editGratitude1, setEditGratitude1] = useState('')
  const [editGratitude2, setEditGratitude2] = useState('')
  const [editGratitude3, setEditGratitude3] = useState('')
  const [editEnergy, setEditEnergy] = useState(3)
  const [editWins, setEditWins] = useState('')
  const [editNextDay, setEditNextDay] = useState('')
  const [editShutdown, setEditShutdown] = useState(false)

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const data = await getJournalEntries(userId, 14)
    setEntries(data)
    setLoading(false)
  }, [userId])

  useEffect(() => { loadData() }, [loadData])

  const selectedEntry = entries.find(e => e.entry_date === selectedDate) || null

  function startEditing() {
    setEditGratitude1(selectedEntry?.gratitude_1 || '')
    setEditGratitude2(selectedEntry?.gratitude_2 || '')
    setEditGratitude3(selectedEntry?.gratitude_3 || '')
    setEditEnergy(selectedEntry?.energy_score || 3)
    setEditWins(selectedEntry?.wins || '')
    setEditNextDay(selectedEntry?.next_day_start || '')
    setEditShutdown(selectedEntry?.shutdown_done || false)
    setEditing(true)
  }

  async function handleSave() {
    if (!userId) return
    setSaving(true)
    const entryDate = today
    await upsertJournalEntry({
      user_id: userId,
      entry_date: entryDate,
      entry_type: 'daily',
      gratitude_1: editGratitude1 || undefined,
      gratitude_2: editGratitude2 || undefined,
      gratitude_3: editGratitude3 || undefined,
      energy_score: editEnergy,
      wins: editWins || undefined,
      next_day_start: editNextDay || undefined,
      shutdown_done: editShutdown,
    })

    // Award XP for journal entry
    try {
      const result = await awardXP(userId, 'journal_entry', { entryDate })
      showXP(result.xpAwarded, 'Journal Entry')

      // Extra XP for shutdown ritual
      if (editShutdown) {
        const shutdownResult = await awardXP(userId, 'shutdown_ritual', { entryDate })
        showXP(shutdownResult.xpAwarded, 'Shutdown Ritual')
      }

      const newBadges = await checkAndAwardBadges(userId)
      const badgeTitles: Record<string, string> = {
        first_session: 'First Focus', week_warrior: 'Week Warrior',
        '100_hours': 'Centurion', habit_streak_7: 'Habit Master',
        quality_8: 'Flow State', shutdown_30: 'Discipline',
        perfect_week: 'Perfect Week'
      }
      newBadges.forEach(b => showBadge(b, badgeTitles[b] || b))
    } catch (err) {
      console.error('XP award failed', err)
    }

    setSaving(false)
    setEditing(false)
    loadData()
  }

  async function handleNewEntry() {
    setSelectedDate(today)
    startEditing()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div className="journal-page">
      <div className="journal-header animate-fade-in">
        <div>
          <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={22} style={{ color: 'var(--accent)' }} /> Journals
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>Daily reflections & shutdown rituals</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleNewEntry}><Plus size={16} /> Today&apos;s Entry</button>
      </div>

      {/* Day Cards Scroller */}
      <div className="day-scroller animate-fade-in" style={{ animationDelay: '0.05s' }}>
        {last14Days.map((dateStr) => {
          const j = entries.find(e => e.entry_date === dateStr)
          const d = new Date(dateStr + 'T12:00:00')
          const isToday = dateStr === today
          return (
            <button
              key={dateStr}
              className={`day-card ${dateStr === selectedDate ? 'day-card-active' : ''} ${!j && !isToday ? 'day-card-missing' : ''}`}
              onClick={() => { setSelectedDate(dateStr); setEditing(false) }}
            >
              <div className="day-card-weekday">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div className="day-card-num text-mono">{d.getDate()}</div>
              <div className="day-card-energy">{j ? energyEmoji[j.energy_score || 0] : '—'}</div>
              {j?.shutdown_done && <div className="day-card-shutdown">✓</div>}
              {!j && !isToday && <div className="day-card-missing-dot">•</div>}
            </button>
          )
        })}
      </div>

      {/* Editing Form */}
      {editing && (
        <div className="journal-detail card animate-fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
              {new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            <button className="btn btn-ghost" onClick={() => setEditing(false)} style={{ padding: '4px' }}><X size={16} /></button>
          </div>

          <div className="journal-sections">
            {/* Energy */}
            <div className="journal-section">
              <div className="journal-section-header"><Sun size={14} style={{ color: 'var(--status-warning)' }} /><span>Energy Level</span></div>
              <div style={{ display: 'flex', gap: 'var(--space-md)', paddingLeft: 'var(--space-xl)' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setEditEnergy(n)} style={{ fontSize: '1.5rem', background: 'none', border: editEnergy === n ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 'var(--radius-sm)', padding: '4px 8px', cursor: 'pointer' }}>
                    {energyEmoji[n]}
                  </button>
                ))}
              </div>
            </div>

            {/* Gratitude */}
            <div className="journal-section">
              <div className="journal-section-header"><Heart size={14} style={{ color: 'var(--status-danger)' }} /><span>Gratitude</span></div>
              <div style={{ paddingLeft: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                <input className="input" placeholder="1. I'm grateful for..." value={editGratitude1} onChange={e => setEditGratitude1(e.target.value)} />
                <input className="input" placeholder="2. I'm grateful for..." value={editGratitude2} onChange={e => setEditGratitude2(e.target.value)} />
                <input className="input" placeholder="3. I'm grateful for..." value={editGratitude3} onChange={e => setEditGratitude3(e.target.value)} />
              </div>
            </div>

            {/* Wins */}
            <div className="journal-section">
              <div className="journal-section-header"><Zap size={14} style={{ color: 'var(--accent)' }} /><span>Today&apos;s Win</span></div>
              <div style={{ paddingLeft: 'var(--space-xl)' }}>
                <input className="input" placeholder="What was your biggest win today?" value={editWins} onChange={e => setEditWins(e.target.value)} />
              </div>
            </div>

            {/* Tomorrow */}
            <div className="journal-section">
              <div className="journal-section-header"><Sun size={14} style={{ color: 'var(--status-info)' }} /><span>Tomorrow&apos;s #1 Priority</span></div>
              <div style={{ paddingLeft: 'var(--space-xl)' }}>
                <input className="input" placeholder="What's the ONE thing for tomorrow?" value={editNextDay} onChange={e => setEditNextDay(e.target.value)} />
              </div>
            </div>

            {/* Shutdown */}
            <div className="journal-section">
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', paddingLeft: 'var(--space-xl)', cursor: 'pointer' }}>
                <input type="checkbox" checked={editShutdown} onChange={e => setEditShutdown(e.target.checked)} style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Shutdown Ritual Complete ✅</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-xl)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--border-subtle)' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </div>
      )}

      {/* View Mode */}
      {!editing && (
        <div className="journal-detail animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="journal-detail-header">
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              {selectedEntry && (
                <div className="journal-energy">
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Energy</span>
                  <span style={{ fontSize: '1.5rem' }}>{energyEmoji[selectedEntry.energy_score || 0]}</span>
                  <span className="text-mono" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{selectedEntry.energy_score}/5</span>
                </div>
              )}
              {selectedDate === today && (
                <button className="btn btn-ghost btn-sm" onClick={() => startEditing()}>
                  {selectedEntry ? 'Edit' : 'Create Entry'}
                </button>
              )}
            </div>
          </div>

          <div className="journal-sections">
            {selectedEntry ? (
              <>
                {(selectedEntry.gratitude_1 || selectedEntry.gratitude_2 || selectedEntry.gratitude_3) && (
                  <div className="journal-section">
                    <div className="journal-section-header"><Heart size={14} style={{ color: 'var(--status-danger)' }} /><span>Gratitude</span></div>
                    <div className="journal-section-content">
                      {selectedEntry.gratitude_1 && <div className="gratitude-item"><span className="gratitude-num text-mono">1.</span><span>{selectedEntry.gratitude_1}</span></div>}
                      {selectedEntry.gratitude_2 && <div className="gratitude-item"><span className="gratitude-num text-mono">2.</span><span>{selectedEntry.gratitude_2}</span></div>}
                      {selectedEntry.gratitude_3 && <div className="gratitude-item"><span className="gratitude-num text-mono">3.</span><span>{selectedEntry.gratitude_3}</span></div>}
                    </div>
                  </div>
                )}

                {selectedEntry.wins && (
                  <div className="journal-section">
                    <div className="journal-section-header"><Zap size={14} style={{ color: 'var(--accent)' }} /><span>Today&apos;s Win</span></div>
                    <div className="journal-section-content"><p>{selectedEntry.wins}</p></div>
                  </div>
                )}

                <div className="journal-section">
                  <div className="journal-section-header"><Sun size={14} style={{ color: 'var(--status-warning)' }} /><span>Shutdown Ritual</span></div>
                  <div className={`shutdown-status ${selectedEntry.shutdown_done ? 'shutdown-done' : ''}`}>
                    {selectedEntry.shutdown_done ? '✅ Shutdown Complete' : '⏳ Not completed'}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                {selectedDate === today ? 'You have not written a journal entry for today.' : 'No journal entry for this date.'}
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .journal-page { display: flex; flex-direction: column; gap: var(--space-xl); }
        .journal-header { display: flex; align-items: center; justify-content: space-between; }
        .day-scroller { display: flex; gap: var(--space-md); overflow-x: auto; padding-bottom: var(--space-sm); }
        .day-card { display: flex; flex-direction: column; align-items: center; gap: var(--space-xs); padding: var(--space-md) var(--space-lg); background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition-fast); min-width: 72px; font-family: var(--font-sans); }
        .day-card:hover { border-color: var(--border-hover); }
        .day-card-active { border-color: var(--accent); background: var(--accent-subtle); }
        .day-card-missing { opacity: 0.6; }
        .day-card-weekday { font-size: 0.6875rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; }
        .day-card-active .day-card-weekday { color: var(--accent); }
        .day-card-num { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); }
        .day-card-energy { font-size: 1rem; min-height: 24px; display: flex; align-items: center; }
        .day-card-shutdown { font-size: 0.6875rem; color: var(--accent); }
        .day-card-missing-dot { font-size: 1rem; color: var(--text-tertiary); }
        .journal-detail { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--space-2xl); }
        .journal-detail-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-xl); padding-bottom: var(--space-lg); border-bottom: 1px solid var(--border-subtle); }
        .journal-energy { display: flex; align-items: center; gap: var(--space-sm); }
        .journal-sections { display: flex; flex-direction: column; gap: var(--space-xl); }
        .journal-section-header { display: flex; align-items: center; gap: var(--space-sm); font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); margin-bottom: var(--space-md); }
        .journal-section-content { padding-left: var(--space-xl); font-size: 0.875rem; color: var(--text-secondary); line-height: 1.6; }
        .gratitude-item { display: flex; gap: var(--space-sm); margin-bottom: var(--space-xs); }
        .gratitude-num { color: var(--text-tertiary); min-width: 20px; }
        .shutdown-status { padding: var(--space-sm) var(--space-md); border-radius: var(--radius-sm); font-size: 0.8125rem; background: var(--bg-hover); color: var(--text-tertiary); }
        .shutdown-done { background: var(--accent-subtle); color: var(--accent); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
