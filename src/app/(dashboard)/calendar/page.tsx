'use client'

import { Calendar, ChevronLeft, ChevronRight, Plus, Loader2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { getTimeBlocks, createTimeBlock, getProjects, getTasks } from '@/lib/data'
import type { TimeBlock, Project, Task } from '@/lib/types'

const blockTypes: Record<string, { color: string; label: string }> = {
  deep_work: { color: 'var(--accent)', label: 'Deep Work' },
  wig: { color: 'var(--status-info)', label: 'WIG' },
  distraction_break: { color: 'var(--status-warning)', label: 'Break' },
  personal: { color: '#9B9B9B', label: 'Personal' },
  meeting: { color: 'var(--status-danger)', label: 'Meeting' },
}

export default function CalendarPage() {
  const { userId } = useUser()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newBlock, setNewBlock] = useState({ title: '', block_type: 'deep_work', start_hour: '09', end_hour: '11', day: '' })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const today = new Date()
  const todayDate = today.getDate()
  const todayMonth = today.getMonth()
  const todayYear = today.getFullYear()
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [b, p, t] = await Promise.all([
      getTimeBlocks(userId, `${monthStart}T00:00:00`, `${monthEnd}T23:59:59`),
      getProjects(userId),
      getTasks(userId)
    ])
    setBlocks(b)
    setProjects(p)
    setTasks(t)
    setLoading(false)
  }, [userId, monthStart, monthEnd])

  useEffect(() => { loadData() }, [loadData])

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  async function handleAddBlock(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !newBlock.title || !newBlock.day) return
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${newBlock.day.padStart(2, '0')}`
    await createTimeBlock({
      user_id: userId,
      title: newBlock.title,
      block_type: newBlock.block_type,
      start_time: `${dateStr}T${newBlock.start_hour}:00:00`,
      end_time: `${dateStr}T${newBlock.end_hour}:00:00`,
    })
    setShowAdd(false)
    setNewBlock({ title: '', block_type: 'deep_work', start_hour: '09', end_hour: '11', day: '' })
    loadData()
  }

  function getBlocksForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return {
      timeBlocks: blocks.filter(b => b.start_time.startsWith(dateStr)),
      projectDeadlines: projects.filter(p => p.target_date === dateStr),
      dayTasks: tasks.filter(t => t.scheduled_date === dateStr)
    }
  }

  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  return (
    <div className="calendar-page">
      <div className="calendar-header animate-fade-in">
        <div>
          <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={22} style={{ color: 'var(--accent)' }} /> Calendar
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>Time blocking & schedule</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-ghost btn-sm" onClick={prevMonth}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>{monthName}</span>
          <button className="btn btn-ghost btn-sm" onClick={nextMonth}><ChevronRight size={16} /></button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Block</button>
        </div>
      </div>

      {/* Add Block Form */}
      {showAdd && (
        <form className="card animate-fade-in" onSubmit={handleAddBlock} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: '12px', alignItems: 'end' }}>
          <div>
            <label className="field-label">Title</label>
            <input className="input" placeholder="Study Math" value={newBlock.title} onChange={e => setNewBlock(p => ({ ...p, title: e.target.value }))} required />
          </div>
          <div>
            <label className="field-label">Type</label>
            <select className="input" value={newBlock.block_type} onChange={e => setNewBlock(p => ({ ...p, block_type: e.target.value }))}>
              {Object.entries(blockTypes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Day</label>
            <input className="input" type="number" min={1} max={daysInMonth} placeholder="9" value={newBlock.day} onChange={e => setNewBlock(p => ({ ...p, day: e.target.value }))} required />
          </div>
          <div>
            <label className="field-label">Start</label>
            <input className="input" type="text" placeholder="09" value={newBlock.start_hour} onChange={e => setNewBlock(p => ({ ...p, start_hour: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">End</label>
            <input className="input" type="text" placeholder="11" value={newBlock.end_hour} onChange={e => setNewBlock(p => ({ ...p, end_hour: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary btn-sm" type="submit">Save</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>

        </form>
      )}

      {/* Legend */}
      <div className="calendar-legend animate-fade-in" style={{ animationDelay: '0.05s' }}>
        {Object.entries(blockTypes).map(([key, val]) => (
          <div key={key} className="legend-item">
            <div className="legend-dot" style={{ background: val.color }} />
            <span>{val.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0', color: 'var(--text-tertiary)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <div className="calendar-grid card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="cal-header">{d}</div>
          ))}
          {days.map((day, idx) => {
            const dayData = day ? getBlocksForDay(day) : null
            const isToday = day === todayDate && month === todayMonth && year === todayYear
            return (
              <div key={idx} className={`cal-cell ${!day ? 'cal-empty' : ''} ${isToday ? 'cal-today' : ''}`}>
                {day && dayData && (
                  <>
                    <span className={`cal-day text-mono ${isToday ? 'cal-day-today' : ''}`}>{day}</span>
                    <div className="cal-blocks">
                      {/* Project Deadlines */}
                      {dayData.projectDeadlines.map((proj) => (
                        <div key={proj.id} className="cal-block" style={{ background: 'var(--status-danger)', color: 'white', borderLeftColor: 'transparent' }} title={`Deadline: ${proj.title}`}>
                          <span className="cal-block-title">🚀 {proj.title}</span>
                          <span className="cal-block-time text-mono">DUE</span>
                        </div>
                      ))}

                      {/* Scheduled Tasks */}
                      {dayData.dayTasks.map((task) => (
                        <div key={task.id} className="cal-block" style={{ borderLeftColor: 'var(--status-info)' }} title={`Task: ${task.title}`}>
                          <span className="cal-block-title">✓ {task.title}</span>
                        </div>
                      ))}

                      {/* Time Blocks */}
                      {dayData.timeBlocks.map((block) => {
                        const startH = new Date(block.start_time).getHours()
                        const endH = new Date(block.end_time).getHours()
                        return (
                          <div
                            key={block.id}
                            className="cal-block"
                            style={{ borderLeftColor: blockTypes[block.block_type]?.color || 'var(--accent)' }}
                            title={`${block.title} (${startH}:00-${endH}:00)`}
                          >
                            <span className="cal-block-title">{block.title}</span>
                            <span className="cal-block-time text-mono">{String(startH).padStart(2, '0')}:00</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style jsx>{`
        .calendar-page { display: flex; flex-direction: column; gap: var(--space-xl); }
        .calendar-header { display: flex; align-items: center; justify-content: space-between; }
        .field-label { display: block; font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 4px; font-weight: 500; }
        .calendar-legend { display: flex; gap: var(--space-lg); }
        .legend-item { display: flex; align-items: center; gap: var(--space-sm); font-size: 0.75rem; color: var(--text-secondary); }
        .legend-dot { width: 8px; height: 8px; border-radius: var(--radius-full); }
        .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; padding: 0; }
        .cal-header { background: var(--bg-surface); padding: var(--space-sm) var(--space-md); font-size: 0.75rem; font-weight: 600; color: var(--text-tertiary); text-align: center; text-transform: uppercase; }
        .cal-cell { background: var(--bg-elevated); min-height: 100px; padding: var(--space-sm); position: relative; }
        .cal-empty { background: var(--bg-base); }
        .cal-today { background: rgba(76,175,125,0.03); }
        .cal-day { font-size: 0.75rem; color: var(--text-tertiary); display: block; margin-bottom: var(--space-xs); }
        .cal-day-today { color: var(--accent); font-weight: 700; background: var(--accent); color: #0F0F0F; width: 20px; height: 20px; border-radius: var(--radius-full); display: inline-flex; align-items: center; justify-content: center; }
        .cal-blocks { display: flex; flex-direction: column; gap: 2px; }
        .cal-block { font-size: 0.6875rem; padding: 2px 4px; border-radius: 2px; background: var(--bg-surface); border-left: 2px solid transparent; display: flex; justify-content: space-between; }
        .cal-block-title { color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; }
        .cal-block-time { color: var(--text-tertiary); font-size: 0.625rem; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
