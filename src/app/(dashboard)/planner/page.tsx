'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import {
  getPlannerBlocks, createPlannerBlock, updatePlannerBlock,
  deletePlannerBlock, getProjects, getActiveTasks, createTask,
} from '@/lib/data'
import type { PlannerBlock, Project, Task } from '@/lib/types'
import {
  Loader2, Plus, Trash2, X, FolderKanban,
  CheckSquare, ChevronLeft, ChevronRight, Zap, Coffee,
  Users, User,
} from 'lucide-react'
import './planner.css'

/* ─── Constants ─── */
const TOTAL_SLOTS = 36
const HOUR_OFFSET = 6

const BLOCK_TYPES = [
  { key: 'deep_work', label: 'Deep Work', color: '#4CAF7D' },
  { key: 'wig', label: 'WIG', color: '#6C63FF' },
  { key: 'break', label: 'Break', color: '#FF9800' },
  { key: 'personal', label: 'Personal', color: '#E91E63' },
  { key: 'meeting', label: 'Meeting', color: '#00BCD4' },
] as const

function slotLabel(localSlot: number): string {
  const abs = localSlot + HOUR_OFFSET * 2
  const h = Math.floor(abs / 2)
  const m = abs % 2 === 0 ? '00' : '30'
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${ap}`
}
const toDb = (l: number) => l + HOUR_OFFSET * 2
const toLocal = (d: number) => d - HOUR_OFFSET * 2

export default function PlannerPage() {
  const { userId } = useUser()
  const [blocks, setBlocks] = useState<PlannerBlock[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [viewDate, setViewDate] = useState(() => new Date().toISOString().split('T')[0])
  const isToday = viewDate === new Date().toISOString().split('T')[0]

  // Form state
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formType, setFormType] = useState('deep_work')
  const [formProjectId, setFormProjectId] = useState('')
  const [formTaskId, setFormTaskId] = useState('')
  const [formNewTask, setFormNewTask] = useState('')
  const [formSpan, setFormSpan] = useState(1)

  // Edit state
  const [editId, setEditId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState('deep_work')
  const [editProjectId, setEditProjectId] = useState('')
  const [editTaskId, setEditTaskId] = useState('')
  const [editNewTask, setEditNewTask] = useState('')

  // Hover state for merge
  const [hoverMerge, setHoverMerge] = useState<string | null>(null)

  /* ─── Load ─── */
  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [b, p, t] = await Promise.all([
        getPlannerBlocks(userId, viewDate),
        getProjects(userId),
        getActiveTasks(userId),
      ])
      setBlocks(b); setProjects(p); setTasks(t)
    } catch (e: any) { console.error('Planner load error:', e) }
    setLoading(false)
  }, [userId, viewDate])
  useEffect(() => { load() }, [load])

  /* ─── Slot map ─── */
  const occupied = new Map<number, PlannerBlock>()
  blocks.forEach(b => {
    for (let s = toLocal(b.start_slot); s < toLocal(b.end_slot); s++) {
      if (s >= 0 && s < TOTAL_SLOTS) occupied.set(s, b)
    }
  })

  /* ─── Actions ─── */
  function openCreate(slot: number) {
    setActiveSlot(slot)
    setFormTitle(''); setFormType('deep_work')
    setFormProjectId(''); setFormTaskId(''); setFormNewTask(''); setFormSpan(1)
    setEditId(null)
  }

  async function handleCreate() {
    if (!userId || activeSlot === null) return
    try {
      let tid = formTaskId || null
      if (formNewTask.trim() && !tid) {
        const t = await createTask({ user_id: userId, title: formNewTask.trim(), status: 'todo', priority: 5, project_id: formProjectId || undefined })
        tid = t.id
      }
      await createPlannerBlock({
        user_id: userId, block_date: viewDate,
        start_slot: toDb(activeSlot), end_slot: toDb(activeSlot + formSpan),
        title: formTitle || formNewTask || 'Untitled', task_id: tid,
        project_id: formProjectId || null, block_type: formType,
      })
      setActiveSlot(null); load()
    } catch (err: any) {
      console.error('Create error:', err)
      alert('Failed: ' + (err?.message || 'Unknown error'))
    }
  }

  function openEdit(b: PlannerBlock) {
    setEditId(b.id); setEditTitle(b.title); setEditType(b.block_type)
    setEditProjectId(b.project_id || ''); setEditTaskId(b.task_id || ''); setEditNewTask('')
    setActiveSlot(null)
  }

  async function saveEdit() {
    if (!editId || !userId) return
    try {
      let tid = editTaskId || null
      if (editNewTask.trim() && !tid) {
        const t = await createTask({ user_id: userId, title: editNewTask.trim(), status: 'todo', priority: 5, project_id: editProjectId || undefined })
        tid = t.id
      }
      await updatePlannerBlock(editId, { title: editTitle || 'Untitled', block_type: editType as any, project_id: editProjectId || null, task_id: tid })
      setEditId(null); load()
    } catch (err: any) { alert('Save failed: ' + (err?.message || '')) }
  }

  async function handleDelete(id: string) {
    try {
      await deletePlannerBlock(id)
      if (editId === id) setEditId(null)
      load()
    } catch (err: any) { alert('Delete failed: ' + (err?.message || '')) }
  }

  async function handleMerge(blockA: PlannerBlock, blockB: PlannerBlock) {
    try {
      await updatePlannerBlock(blockA.id, { end_slot: blockB.end_slot, title: blockA.title || blockB.title })
      await deletePlannerBlock(blockB.id)
      load()
    } catch (err: any) { alert('Merge failed: ' + (err?.message || '')) }
  }

  function shiftDate(d: number) {
    const dt = new Date(viewDate + 'T00:00:00')
    dt.setDate(dt.getDate() + d)
    setViewDate(dt.toISOString().split('T')[0])
  }

  const dateLabel = new Date(viewDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const now = new Date()
  const curSlot = (now.getHours() - HOUR_OFFSET) * 2 + (now.getMinutes() >= 30 ? 1 : 0)
  const totalMin = blocks.reduce((a, b) => a + (b.end_slot - b.start_slot) * 30, 0)
  const deepMin = blocks.filter(b => b.block_type === 'deep_work' || b.block_type === 'wig').reduce((a, b) => a + (b.end_slot - b.start_slot) * 30, 0)

  if (loading) return (
    <div className="pl-load"><Loader2 size={24} className="pl-spin" /></div>
  )

  /* ─── Render the slot cards ─── */
  const cards: React.ReactNode[] = []
  let i = 0
  while (i < TOTAL_SLOTS) {
    const block = occupied.get(i)

    if (block && toLocal(block.start_slot) === i) {
      // ═══ FILLED BLOCK CARD ═══
      const span = block.end_slot - block.start_slot
      const localEnd = toLocal(block.end_slot)
      const ti = BLOCK_TYPES.find(t => t.key === block.block_type) || BLOCK_TYPES[0]
      const proj = projects.find(p => p.id === block.project_id)
      const task = tasks.find(t => t.id === block.task_id)
      const isCur = isToday && curSlot >= i && curSlot < localEnd
      const isEd = editId === block.id

      cards.push(
        <div key={`b-${block.id}`}
          className={`slot-card filled ${isCur ? 'now' : ''}`}
          style={{ '--bc': ti.color } as React.CSSProperties}
        >
          <div className="slot-header">
            <span className="slot-range">{slotLabel(i)} — {slotLabel(localEnd)}</span>
            <span className="slot-dur">{span * 30}m</span>
            {!isEd && (
              <button className="slot-del" onClick={() => handleDelete(block.id)}>
                <Trash2 size={12}/>
              </button>
            )}
          </div>

          {isEd ? (
            <div className="slot-form">
              <input className="sf-input" value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Title..." autoFocus />
              <div className="sf-chips">
                {BLOCK_TYPES.map(bt => (
                  <button key={bt.key}
                    className={`sf-chip ${editType === bt.key ? 'on' : ''}`}
                    style={{ '--cc': bt.color } as React.CSSProperties}
                    onClick={() => setEditType(bt.key)}>{bt.label}</button>
                ))}
              </div>
              <select className="sf-sel" value={editProjectId}
                onChange={e => setEditProjectId(e.target.value)}>
                <option value="">No Project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <select className="sf-sel" value={editTaskId}
                onChange={e => { setEditTaskId(e.target.value); setEditNewTask('') }}>
                <option value="">No Task</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <input className="sf-input" placeholder="Or create new task..."
                value={editNewTask}
                onChange={e => { setEditNewTask(e.target.value); setEditTaskId('') }} />
              <div className="sf-btns">
                <button className="sf-save" onClick={saveEdit}>Save</button>
                <button className="sf-cancel" onClick={() => setEditId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="slot-body" onClick={() => openEdit(block)}>
              <div className="slot-title">{block.title || 'Untitled'}</div>
              <div className="slot-tags">
                <span className="slot-tag" style={{ color: ti.color }}>{ti.label}</span>
                {proj && <span className="slot-tag"><FolderKanban size={10}/> {proj.title}</span>}
                {task && <span className="slot-tag"><CheckSquare size={10}/> {task.title}</span>}
              </div>
            </div>
          )}
        </div>
      )

      // Merge zone between adjacent filled blocks
      const nextBlock = occupied.get(localEnd)
      if (nextBlock && toLocal(nextBlock.start_slot) === localEnd) {
        const mid = `${block.id}-${nextBlock.id}`
        cards.push(
          <div key={`m-${mid}`} className="merge-zone"
            onMouseEnter={() => setHoverMerge(mid)}
            onMouseLeave={() => setHoverMerge(null)}
            onClick={() => handleMerge(block, nextBlock)}
          >
            <div className={`merge-line ${hoverMerge === mid ? 'vis' : ''}`}>
              <span className="merge-btn"><Plus size={10}/></span>
            </div>
          </div>
        )
      }
      i = localEnd; continue
    }

    if (block) { i++; continue }

    // ═══ EMPTY SLOT CARD ═══
    const isCurEmpty = isToday && i === curSlot
    const isCreating = activeSlot === i
    const slotIdx = i // capture for closures

    cards.push(
      <div key={`e-${slotIdx}`}
        className={`slot-card empty ${isCurEmpty ? 'now-empty' : ''}`}
      >
        <div className="slot-header">
          <span className="slot-range">{slotLabel(slotIdx)} — {slotLabel(slotIdx + 1)}</span>
          <span className="slot-dur">30m</span>
        </div>

        {isCreating ? (
          <div className="slot-form">
            <input className="sf-input" value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="Block title..." autoFocus />
            <div className="sf-chips">
              {BLOCK_TYPES.map(bt => (
                <button key={bt.key}
                  className={`sf-chip ${formType === bt.key ? 'on' : ''}`}
                  style={{ '--cc': bt.color } as React.CSSProperties}
                  onClick={() => setFormType(bt.key)}>{bt.label}</button>
              ))}
            </div>
            <div className="sf-dur-row">
              <span className="sf-dur-label">DURATION</span>
              <select className="sf-sel" value={formSpan}
                onChange={e => setFormSpan(Number(e.target.value))}>
                <option value={1}>30 min</option>
                <option value={2}>1 hour</option>
                <option value={3}>1.5 hrs</option>
                <option value={4}>2 hours</option>
                <option value={5}>2.5 hrs</option>
                <option value={6}>3 hours</option>
              </select>
            </div>
            <select className="sf-sel" value={formProjectId}
              onChange={e => setFormProjectId(e.target.value)}>
              <option value="">No Project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <select className="sf-sel" value={formTaskId}
              onChange={e => { setFormTaskId(e.target.value); setFormNewTask('') }}>
              <option value="">No Task (optional)</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <input className="sf-input" placeholder="Or create new task..."
              value={formNewTask}
              onChange={e => { setFormNewTask(e.target.value); setFormTaskId('') }} />
            <div className="sf-btns">
              <button className="sf-save" onClick={handleCreate}>Create Block</button>
              <button className="sf-cancel" onClick={() => setActiveSlot(null)}>
                <X size={12}/> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="slot-add" onClick={() => openCreate(slotIdx)}>
            <Plus size={16}/><span>Add Block</span>
          </div>
        )}
      </div>
    )
    i++
  }

  return (
    <div className="pl">
      {/* Header */}
      <div className="pl-hdr animate-fade-in">
        <div>
          <div className="pl-lbl">DAILY PLANNER</div>
          <h1 className="pl-ttl">Time Blocks</h1>
        </div>
        <div className="pl-nav">
          <button className="nav-btn" onClick={() => shiftDate(-1)}><ChevronLeft size={16}/></button>
          <div className="nav-center">
            <span className="nav-date">{dateLabel}</span>
            {isToday && <span className="nav-badge">TODAY</span>}
          </div>
          <button className="nav-btn" onClick={() => shiftDate(1)}><ChevronRight size={16}/></button>
          {!isToday && (
            <button className="nav-today" onClick={() => setViewDate(new Date().toISOString().split('T')[0])}>
              Today
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="pl-stats animate-fade-in">
        <div className="st">
          <span className="st-v">{blocks.length}</span>
          <span className="st-l">BLOCKS</span>
        </div>
        <div className="st">
          <span className="st-v">{Math.floor(totalMin/60)}h {totalMin%60}m</span>
          <span className="st-l">PLANNED</span>
        </div>
        <div className="st">
          <span className="st-v" style={{color:'var(--accent)'}}>{Math.floor(deepMin/60)}h {deepMin%60}m</span>
          <span className="st-l">DEEP WORK</span>
        </div>
        <div className="st">
          <span className="st-v">{Math.round(totalMin/(TOTAL_SLOTS*30)*100)}%</span>
          <span className="st-l">COVERAGE</span>
        </div>
      </div>

      {/* Cards */}
      <div className="pl-cards animate-fade-in">
        {cards}
      </div>
    </div>
  )
}
