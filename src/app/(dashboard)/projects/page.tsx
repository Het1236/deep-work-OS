'use client'

import { FolderKanban, Plus, ArrowUpRight, Loader2, X, CheckCircle2, Calendar, Trash2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import {
  getProjects, createProject, createTask, updateProjectStatus,
  updateProject, updateTaskStatus, deleteTask,
  getTasks
} from '@/lib/data'
import type { Project, Task } from '@/lib/types'

const statusConfig: Record<string, { label: string; badgeClass: string }> = {
  active: { label: 'Active', badgeClass: 'badge-green' },
  upcoming: { label: 'Upcoming', badgeClass: 'badge-blue' },
  done: { label: 'Done', badgeClass: 'badge-amber' },
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export default function ProjectsPage() {
  const { userId } = useUser()
  const [projects, setProjects] = useState<Project[]>([])
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [quickCapture, setQuickCapture] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  // Daily task quick-add
  const [dailyTaskInput, setDailyTaskInput] = useState('')

  // Variables for editing Project/Tasks
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editTargetDate, setEditTargetDate] = useState('')
  const [editImpact, setEditImpact] = useState(5)
  const [editConfidence, setEditConfidence] = useState(5)
  const [editEase, setEditEase] = useState(5)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  // Add form
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newStatus, setNewStatus] = useState('upcoming')
  const [newImpact, setNewImpact] = useState(5)
  const [newConfidence, setNewConfidence] = useState(5)
  const [newEase, setNewEase] = useState(5)

  const today = todayStr()

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [p, t] = await Promise.all([
      getProjects(userId),
      getTasks(userId),
    ])
    setProjects(p)
    setAllTasks(t)
    if (selectedProject) {
      const refreshed = p.find(proj => proj.id === selectedProject.id)
      if (refreshed) setSelectedProject(refreshed)
    }
    setLoading(false)
  }, [userId, today, selectedProject])

  useEffect(() => { loadData() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derived: today's tasks = tasks scheduled today OR unscheduled active tasks
  const dailyTasks = allTasks.filter(t =>
    t.scheduled_date === today || (!t.scheduled_date && t.status !== 'done')
  )

  // ─── Handlers ──────────────────────

  function openEditModal(project: Project) {
    setSelectedProject(project)
    setEditTitle(project.title)
    setEditDesc(project.description || '')
    setEditTargetDate(project.target_date || '')
    setEditImpact(project.ice_impact || 5)
    setEditConfidence(project.ice_confidence || 5)
    setEditEase(project.ice_ease || 5)
  }

  async function handleSaveProjectDetails() {
    if (!selectedProject) return
    await updateProject(selectedProject.id, {
      title: editTitle,
      description: editDesc || null,
      target_date: editTargetDate || null,
      ice_impact: editImpact,
      ice_confidence: editConfidence,
      ice_ease: editEase
    })
    setSelectedProject(null)
    loadData()
  }

  async function handleAddTask(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && newTaskTitle.trim() && userId && selectedProject) {
      e.preventDefault()
      await createTask({
        user_id: userId,
        project_id: selectedProject.id,
        title: newTaskTitle.trim(),
        status: 'todo',
        priority: 1
      })
      setNewTaskTitle('')
      loadData()
    }
  }

  async function handleToggleTask(task: Task) {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    await updateTaskStatus(task.id, newStatus)
    loadData()
  }

  async function handleRemoveTask(taskId: string) {
    await deleteTask(taskId)
    loadData()
  }

  async function handleAddDailyTask(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && dailyTaskInput.trim() && userId) {
      e.preventDefault()
      await createTask({
        user_id: userId,
        title: dailyTaskInput.trim(),
        status: 'todo',
        scheduled_date: today,
        priority: 1,
      })
      setDailyTaskInput('')
      loadData()
    }
  }

  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !newTitle.trim()) return
    await createProject({
      user_id: userId,
      title: newTitle.trim(),
      description: newDesc || undefined,
      status: newStatus,
      ice_impact: newImpact,
      ice_confidence: newConfidence,
      ice_ease: newEase,
    })
    setNewTitle(''); setNewDesc(''); setNewStatus('upcoming')
    setNewImpact(5); setNewConfidence(5); setNewEase(5)
    setShowAdd(false)
    loadData()
  }

  async function handleQuickCapture(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && quickCapture.trim() && userId) {
      await createProject({
        user_id: userId,
        title: quickCapture.trim(),
        status: 'upcoming',
      })
      setQuickCapture('')
      loadData()
    }
  }

  async function handleDrop(e: React.DragEvent, status: string) {
    e.preventDefault()
    const projectId = e.dataTransfer.getData('projectId')
    if (!projectId) return
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: status as Project['status'] } : p))
    try {
      await updateProjectStatus(projectId, status)
    } catch (err) {
      console.error(err)
      loadData()
    }
  }

  // Find project name for a task
  function getProjectName(projectId: string | null): string | null {
    if (!projectId) return null
    const project = projects.find(p => p.id === projectId)
    return project?.title || null
  }

  const columns = ['active', 'upcoming', 'done'] as const

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div className="projects-page">
      <div className="projects-header animate-fade-in">
        <div>
          <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderKanban size={22} style={{ color: 'var(--accent)' }} /> Projects
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            WIP Limit: 3 active projects max
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={16} /> New Project</button>
      </div>

      {/* ═══ DAILY TASKS PANEL ═══ */}
      <div className="card animate-fade-in daily-tasks-panel" style={{ animationDelay: '0.03s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Today&apos;s Tasks</span>
            <span className="text-mono" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: '999px' }}>
              {dailyTasks.filter(t => t.status === 'done').length}/{dailyTasks.length}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto' }}>
          {dailyTasks.map(task => (
            <div key={task.id} className="daily-task-row">
              <input
                type="checkbox"
                checked={task.status === 'done'}
                onChange={() => handleToggleTask(task)}
                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span style={{
                fontSize: '0.8125rem', flex: 1,
                textDecoration: task.status === 'done' ? 'line-through' : 'none',
                color: task.status === 'done' ? 'var(--text-tertiary)' : 'var(--text-primary)'
              }}>
                {task.title}
              </span>
              {task.project_id && (
                <span style={{ fontSize: '0.6875rem', color: 'var(--accent)', opacity: 0.7 }}>
                  {getProjectName(task.project_id)}
                </span>
              )}
              <button className="btn btn-ghost" style={{ padding: '2px', color: 'var(--status-danger)', opacity: 0.5 }} onClick={() => handleRemoveTask(task.id)}>
                <X size={12} />
              </button>
            </div>
          ))}
          {dailyTasks.length === 0 && (
            <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
              No tasks for today. Add one below!
            </div>
          )}
        </div>

        <input
          className="input"
          placeholder="+ Add a daily task and press Enter..."
          value={dailyTaskInput}
          onChange={e => setDailyTaskInput(e.target.value)}
          onKeyDown={handleAddDailyTask}
          style={{ marginTop: 'var(--space-sm)', background: 'var(--bg-base)' }}
        />
      </div>



      {/* Add Project Form */}
      {showAdd && (
        <div className="card animate-fade-in" style={{ border: '1px solid rgba(76,175,125,0.3)' }}>
          <form onSubmit={handleAddProject} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>New Project</span>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)} style={{ padding: '4px' }}><X size={16} /></button>
            </div>
            <input className="input" placeholder="Project title" value={newTitle} onChange={e => setNewTitle(e.target.value)} required autoFocus />
            <input className="input" placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <select className="input" value={newStatus} onChange={e => setNewStatus(e.target.value)} style={{ flex: 1 }}>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
              </select>
              <div style={{ flex: 2, display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>ICE:</span>
                <input className="input" type="number" min="1" max="10" value={newImpact} onChange={e => setNewImpact(+e.target.value)} style={{ width: '60px' }} title="Impact" />
                <input className="input" type="number" min="1" max="10" value={newConfidence} onChange={e => setNewConfidence(+e.target.value)} style={{ width: '60px' }} title="Confidence" />
                <input className="input" type="number" min="1" max="10" value={newEase} onChange={e => setNewEase(+e.target.value)} style={{ width: '60px' }} title="Ease" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>Create Project</button>
          </form>
        </div>
      )}

      {/* Quick Capture */}
      {!showAdd && (
        <div className="quick-capture card animate-fade-in" style={{ animationDelay: '0.05s' }}>
          <input
            className="input"
            placeholder="⚡ Quick capture: type a project idea and press Enter..."
            style={{ background: 'var(--bg-base)' }}
            value={quickCapture}
            onChange={e => setQuickCapture(e.target.value)}
            onKeyDown={handleQuickCapture}
          />
        </div>
      )}

      {/* Edit Project Modal */}
      {selectedProject && (
        <div className="modal-backdrop">
          <div className="modal-content card animate-fade-in" style={{ width: '500px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <span style={{ fontWeight: 600, fontSize: '1.25rem' }}>Edit Project</span>
              <button className="btn btn-ghost" onClick={() => setSelectedProject(null)}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div>
                <label className="field-label" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Title</label>
                <input className="input" value={editTitle} onChange={e => setEditTitle(e.target.value)} required />
              </div>
              <div>
                <label className="field-label" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Description</label>
                <textarea className="input" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div>
                  <label className="field-label" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Target Date (Deadline)</label>
                  <input className="input" type="date" value={editTargetDate} onChange={e => setEditTargetDate(e.target.value)} />
                </div>
                <div>
                  <label className="field-label" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>ICE Scoring</label>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <input className="input" type="number" min="1" max="10" value={editImpact} onChange={e => setEditImpact(+e.target.value)} title="Impact" />
                    <input className="input" type="number" min="1" max="10" value={editConfidence} onChange={e => setEditConfidence(+e.target.value)} title="Confidence" />
                    <input className="input" type="number" min="1" max="10" value={editEase} onChange={e => setEditEase(+e.target.value)} title="Ease" />
                  </div>
                </div>
              </div>

              <div style={{ padding: 'var(--space-lg) 0', borderTop: '1px solid var(--border-subtle)' }}>
                <h4 style={{ fontSize: '0.875rem', marginBottom: 'var(--space-sm)', fontWeight: 600 }}>Project Tasks</h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)' }}>
                  {(selectedProject.tasks || []).map(task => (
                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-base)', padding: '6px 8px', borderRadius: '4px' }}>
                      <input type="checkbox" checked={task.status === 'done'} onChange={() => handleToggleTask(task)} style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                      <span style={{ fontSize: '0.8125rem', flex: 1, textDecoration: task.status === 'done' ? 'line-through' : 'none', color: task.status === 'done' ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{task.title}</span>
                      <button className="btn btn-ghost" style={{ padding: '2px', color: 'var(--status-danger)' }} onClick={() => handleRemoveTask(task.id)}><X size={14} /></button>
                    </div>
                  ))}
                  {(selectedProject.tasks || []).length === 0 && <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>No tasks assigned.</span>}
                </div>

                <input className="input" placeholder="+ Add a task and press Enter" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={handleAddTask} />
              </div>

              <button className="btn btn-primary" onClick={handleSaveProjectDetails} style={{ alignSelf: 'flex-start' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="kanban animate-fade-in" style={{ animationDelay: '0.1s' }}>
        {columns.map(col => {
          const colProjects = projects.filter(p => p.status === col)
          const config = statusConfig[col]
          return (
            <div
              key={col}
              className="kanban-col"
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={(e) => handleDrop(e, col)}
            >
              <div className="kanban-col-header">
                <span className={`badge ${config.badgeClass}`}>{config.label}</span>
                <span className="text-mono" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{colProjects.length}</span>
              </div>
              <div className="kanban-cards">
                {colProjects.length === 0 && (
                  <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8125rem', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                    No projects
                  </div>
                )}
                {colProjects.map(project => {
                  const tasks = project.tasks || []
                  const tasksDone = tasks.filter(t => t.status === 'done').length
                  const tasksTotal = tasks.length
                  const pct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0
                  const iceScore = project.ice_score || 0
                  return (
                    <div
                      key={project.id}
                      className="project-card"
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('projectId', project.id); e.dataTransfer.effectAllowed = 'move' }}
                      onClick={() => openEditModal(project)}
                    >
                      <div className="project-card-top">
                        <span className="project-card-title">{project.title}</span>
                        <ArrowUpRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      </div>
                      {project.description && <p className="project-card-desc">{project.description}</p>}

                      {/* ICE Score */}
                      {(project.ice_impact || project.ice_confidence || project.ice_ease) && (
                        <div className="ice-row">
                          <span className="ice-label">ICE</span>
                          <div className="ice-bars">
                            <div className="ice-bar" title={`Impact: ${project.ice_impact}`}>
                              <div className="ice-fill" style={{ width: `${(project.ice_impact || 0) * 10}%` }} />
                            </div>
                            <div className="ice-bar" title={`Confidence: ${project.ice_confidence}`}>
                              <div className="ice-fill" style={{ width: `${(project.ice_confidence || 0) * 10}%`, background: 'var(--status-info)' }} />
                            </div>
                            <div className="ice-bar" title={`Ease: ${project.ice_ease}`}>
                              <div className="ice-fill" style={{ width: `${(project.ice_ease || 0) * 10}%`, background: 'var(--status-warning)' }} />
                            </div>
                          </div>
                          <span className="text-mono ice-score">{iceScore.toFixed ? iceScore.toFixed(1) : iceScore}</span>
                        </div>
                      )}

                      {/* Task Progress */}
                      {tasksTotal > 0 && (
                        <div style={{ marginTop: '12px' }}>
                          <div className="progress-bar">
                            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>{tasksDone}/{tasksTotal} tasks</span>
                            <span className="text-mono" style={{ fontSize: '0.6875rem', color: 'var(--accent)' }}>{pct}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <style jsx>{`
        .projects-page { display: flex; flex-direction: column; gap: var(--space-xl); }
        .projects-header { display: flex; align-items: center; justify-content: space-between; }
        .kanban { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-lg); }
        .kanban-col-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-md); padding: var(--space-sm) 0; }
        .kanban-cards { display: flex; flex-direction: column; gap: var(--space-md); }
        .project-card { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: var(--space-lg); transition: all var(--transition-fast); cursor: pointer; }
        .project-card:hover { border-color: var(--border-hover); transform: translateY(-1px); }
        .project-card-top { display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-sm); }
        .project-card-title { flex: 1; font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
        .project-card-desc { font-size: 0.8125rem; color: var(--text-tertiary); margin-bottom: var(--space-md); line-height: 1.4; }
        .ice-row { display: flex; align-items: center; gap: var(--space-sm); }
        .ice-label { font-size: 0.6875rem; font-weight: 600; color: var(--text-tertiary); }
        .ice-bars { flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .ice-bar { height: 3px; background: var(--bg-hover); border-radius: var(--radius-full); overflow: hidden; }
        .ice-fill { height: 100%; background: var(--accent); border-radius: var(--radius-full); }
        .ice-score { font-size: 0.75rem; font-weight: 700; color: var(--accent); }
        .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(2px); }

        /* Daily Tasks */
        .daily-task-row {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 8px; border-radius: 4px;
          background: var(--bg-base);
          transition: background 0.15s;
        }
        .daily-task-row:hover { background: var(--bg-hover); }

        /* Time Block Scheduler */
        .tb-timeline {
          display: flex; flex-direction: column; gap: 0;
          max-height: 500px; overflow-y: auto;
          border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
        }
        .tb-slot-row {
          display: flex; align-items: stretch; min-height: 32px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .tb-slot-row:last-child { border-bottom: none; }
        .tb-time {
          width: 52px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          font-size: 0.6875rem; color: var(--text-tertiary);
          background: var(--bg-surface); border-right: 1px solid var(--border-subtle);
        }
        .tb-slot-empty {
          flex: 1; cursor: pointer; display: flex; align-items: center; padding: 0 var(--space-md);
          transition: background 0.15s;
        }
        .tb-slot-empty:hover {
          background: rgba(76,175,125,0.05);
        }
        .tb-slot-empty:hover .tb-plus-icon { opacity: 0.5 !important; }
        .tb-block-filled {
          flex: 1; display: flex; flex-direction: column; justify-content: center;
          padding: 4px var(--space-md);
          background: var(--bg-elevated);
        }
        .tb-create-form {
          flex: 1; display: flex; align-items: center; gap: 6px;
          padding: 4px var(--space-sm);
          background: var(--bg-elevated);
        }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
