'use client'

import { useEffect, useState, useRef } from 'react'
import { useUser } from '@/components/UserContext'
import { createSession, endSession, discardSession, awardXP, checkAndAwardBadges, calculateLevel, getActiveTasks, updateTaskStatus, getProjects } from '@/lib/data'
import { Task } from '@/lib/types'
import { useXPToast } from '@/components/XPToast'
import {
  Timer, Play, Pause, Square, RotateCcw, Volume2, VolumeX, Trash2, Clock, ShieldAlert
} from 'lucide-react'
import { useTimerStore } from '@/stores/timerStore'

export default function FocusTimerPage() {
  const { userId, triggerRefresh } = useUser()
  const { showXP, showBadge } = useXPToast()
  
  const { sessionId, isRunning, elapsed, mode, startTimer, pauseTimer, resumeTimer, stopTimer, setMode, resetTimer } = useTimerStore()
  
  /* ---- Hydration Guard ---- */
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [intensity, setIntensity] = useState(7)
  const [sessionLabel, setSessionLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [deepWorkPct, setDeepWorkPct] = useState(100)
  const [soundOn, setSoundOn] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isWrapUpOpen, setIsWrapUpOpen] = useState(false)
  const [activeTasks, setActiveTasks] = useState<Task[]>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [durationOverride, setDurationOverride] = useState<number | null>(null)

  /* ---- Distractions & Ambient Audio ---- */
  const [distractions, setDistractions] = useState<string[]>([])
  const [newDistraction, setNewDistraction] = useState('')
  const [ambientSound, setAmbientSound] = useState<'none' | 'white' | 'brown' | 'rain'>('none')
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null)
  const [noiseNode, setNoiseNode] = useState<AudioBufferSourceNode | null>(null)
  const [streamAudio, setStreamAudio] = useState<HTMLAudioElement | null>(null)

  const seconds = elapsed

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRunning) {
      interval = setInterval(() => {
        useTimerStore.getState().tick()
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRunning])

  useEffect(() => {
    async function initFromParams() {
      if (!userId) return
      try {
        const tasks = await getActiveTasks(userId)
        setActiveTasks(tasks)
        
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          const tId = params.get('taskId')
          const label = params.get('label')
          
          if (tId) {
            setSelectedTaskIds(new Set([tId]))
            const matchedTask = tasks.find(t => t.id === tId)
            if (matchedTask) {
              setSessionLabel(matchedTask.title)
            } else if (label) {
              setSessionLabel(label)
            }
          } else if (label) {
            setSessionLabel(label)
          }
        }
      } catch (err) {
        console.error('Failed to load active tasks or search parameters', err)
      }
    }
    if (mounted) {
      initFromParams()
    }
  }, [userId, mounted])

  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`

  const circumference = 2 * Math.PI * 140
  const maxSeconds = mode === 'deepwork' ? 5400 : 900
  const progress = Math.min(seconds / maxSeconds, 1)
  const dashOffset = circumference * (1 - progress)

  /* ---- Ambient Sounds Logic ---- */
  const playAmbient = (type: 'none' | 'white' | 'brown' | 'rain') => {
    // Cleanup active
    if (noiseNode) {
      try { noiseNode.stop() } catch {}
      setNoiseNode(null)
    }
    if (audioCtx) {
      try { audioCtx.close() } catch {}
      setAudioCtx(null)
    }
    if (streamAudio) {
      streamAudio.pause()
      setStreamAudio(null)
    }

    if (type === 'none') return

    if (type === 'white' || type === 'brown') {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const bufferSize = 2 * ctx.sampleRate
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const output = noiseBuffer.getChannelData(0)

      if (type === 'white') {
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1
        }
      } else {
        // Brown noise low-pass filtering
        let lastOut = 0.0
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1
          output[i] = (lastOut + (0.02 * white)) / 1.02
          lastOut = output[i]
          output[i] *= 3.5 // Volume boost
        }
      }

      const source = ctx.createBufferSource()
      source.buffer = noiseBuffer
      source.loop = true

      const gainNode = ctx.createGain()
      gainNode.gain.value = soundOn ? 0.08 : 0

      source.connect(gainNode)
      gainNode.connect(ctx.destination)
      source.start()

      setAudioCtx(ctx)
      setNoiseNode(source)
    } else if (type === 'rain') {
      const audio = new Audio('https://www.soundjay.com/nature/sounds/rain-07.mp3')
      audio.loop = true
      audio.volume = soundOn ? 0.25 : 0
      audio.play().catch(e => console.log('Audio autoplay blocked', e))
      setStreamAudio(audio)
    }
  }

  useEffect(() => {
    if (!mounted) return
    playAmbient(ambientSound)
    return () => {
      if (noiseNode) try { noiseNode.stop() } catch {}
      if (audioCtx) try { audioCtx.close() } catch {}
      if (streamAudio) streamAudio.pause()
    }
  }, [ambientSound])

  useEffect(() => {
    if (streamAudio) {
      streamAudio.volume = soundOn ? 0.25 : 0
    }
  }, [soundOn])

  async function handleStart() {
    if (!userId) return
    
    if (mode === 'deepwork') {
      try {
        const session = await createSession({
          user_id: userId,
          started_at: new Date().toISOString(),
          session_date: new Date().toISOString().split('T')[0],
        })
        startTimer(session.id, mode)
        setDistractions([]) // reset session distractions
      } catch (err: any) {
        console.error("Failed to create session", err);
        alert("Failed to start session: " + (err?.message || JSON.stringify(err)));
      }
    } else {
        startTimer('break_session', mode)
    }
  }

  async function handleRequestEnd() {
    pauseTimer()
    if (mode === 'deepwork' && elapsed > 0 && sessionId && sessionId !== 'break_session') {
      setIsWrapUpOpen(true)
      if (userId) {
        const tasks = await getActiveTasks(userId)
        const projects = await getProjects(userId)
        const activeProjectIds = new Set(projects.filter(p => p.status === 'active').map(p => p.id))
        
        const validTasks = tasks.filter(t => !t.project_id || activeProjectIds.has(t.project_id))
        
        const todayStr = new Date().toISOString().split('T')[0]
        validTasks.sort((a, b) => {
          if (a.scheduled_date === todayStr && b.scheduled_date !== todayStr) return -1;
          if (a.scheduled_date !== todayStr && b.scheduled_date === todayStr) return 1;
          return 0;
        })
        
        setActiveTasks(validTasks)
      }
    } else {
      resetTimer()
    }
  }

  async function finalizeSession() {
    setSaving(true)
    const duration = durationOverride ?? Math.floor(seconds / 60)
    
    if (duration > 0 && mode === 'deepwork' && sessionId && userId && sessionId !== 'break_session') {
      try {
        const structuredNotes = JSON.stringify({
          notes: notes || sessionLabel || '',
          distractions: distractions
        })

        await endSession(sessionId, {
          ended_at: new Date().toISOString(),
          duration_minutes: duration,
          intensity_score: intensity,
          notes: structuredNotes,
          deep_work_pct: deepWorkPct,
        })

        // Complete checked tasks
        for (const taskId of selectedTaskIds) {
          await updateTaskStatus(taskId, 'done')
        }

        // Award XP
        const xpAmount = Math.max(5, Math.round((duration / 60) * 10))
        const result = await awardXP(userId, 'session_complete', { duration, intensity }, xpAmount)
        showXP(result.xpAwarded, 'Deep Work Session', result.leveledUp, result.leveledUp ? calculateLevel(result.newTotal).level : undefined)

        const newBadges = await checkAndAwardBadges(userId)
        const badgeTitles: Record<string, string> = {
          first_session: 'First Focus', week_warrior: 'Week Warrior',
          '100_hours': 'Centurion', habit_streak_7: 'Habit Master',
          quality_8: 'Flow State', shutdown_30: 'Discipline',
          perfect_week: 'Perfect Week'
        }
        newBadges.forEach(b => showBadge(b, badgeTitles[b] || b))
      } catch (err) {
        console.error('Failed to save session', err)
      }
      triggerRefresh()
    }

    cleanupWrapUp()
  }

  async function handleDiscard() {
    if (!confirm('Are you sure you want to discard this session? This cannot be undone.')) return
    setSaving(true)
    try {
      if (sessionId && sessionId !== 'break_session') {
        await discardSession(sessionId)
      }
    } catch (err) {
      console.error('Failed to discard session', err)
    }
    cleanupWrapUp()
  }

  function cleanupWrapUp() {
    setIsWrapUpOpen(false)
    setSelectedTaskIds(new Set())
    setNotes('')
    setDeepWorkPct(100)
    setDurationOverride(null)
    setDistractions([])
    resetTimer()
    setSaving(false)
  }

  function handleReset() {
    resetTimer()
  }

  if (!mounted) return null;

  return (
    <div className="timer-page">
      <div className="timer-header animate-fade-in">
        <h1 className="text-heading" style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Timer size={22} style={{ color: 'var(--accent)' }} /> Focus Timer
        </h1>
      </div>

      {/* Mode Toggle */}
      <div className="mode-toggle animate-fade-in" style={{ animationDelay: '0.05s' }}>
        <button
          className={`mode-btn ${mode === 'deepwork' ? 'mode-active' : ''}`}
          onClick={() => { setMode('deepwork'); handleReset() }}
        >
          Deep Work
        </button>
        <button
          className={`mode-btn ${mode === 'break' ? 'mode-active' : ''}`}
          onClick={() => { setMode('break'); handleReset() }}
        >
          Break
        </button>
      </div>

      {/* Circular Timer */}
      <div className="timer-ring-wrapper animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <svg className="timer-ring" viewBox="0 0 300 300">
          <circle cx="150" cy="150" r="140" fill="none" stroke="var(--bg-hover)" strokeWidth="4" />
          <circle
            cx="150" cy="150" r="140" fill="none"
            stroke={mode === 'deepwork' ? 'var(--accent)' : 'var(--status-info)'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 150 150)"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="timer-ring-center">
          <div className="timer-ring-time text-mono">{timeStr}</div>
          <div className="timer-ring-mode">{mode === 'deepwork' ? 'DEEP WORK' : 'BREAK'}</div>
          {isRunning && <div className="timer-ring-live animate-pulse-glow">● ACTIVE</div>}
          {saving && <div className="timer-ring-live" style={{ color: 'var(--status-info)' }}>Saving…</div>}
        </div>
      </div>

      {/* Session Label */}
      <div className="timer-label animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <input
          className="input"
          placeholder="What are you working on?"
          value={sessionLabel}
          onChange={e => setSessionLabel(e.target.value)}
          style={{ textAlign: 'center', maxWidth: '400px' }}
        />
      </div>

      {/* Intensity */}
      <div className="timer-intensity animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Intensity</span>
        <div className="intensity-slider">
          {Array.from({ length: 10 }, (_, i) => (
            <button
              key={i}
              className={`intensity-dot ${i < intensity ? 'intensity-active' : ''}`}
              onClick={() => setIntensity(i + 1)}
            />
          ))}
        </div>
        <span className="text-mono" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.875rem' }}>{intensity}/10</span>
      </div>

      {/* Controls */}
      <div className="timer-controls animate-fade-in" style={{ animationDelay: '0.25s' }}>
        <button className="btn btn-ghost timer-ctrl-btn" onClick={() => setSoundOn(!soundOn)}>
          {soundOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
        <button className="btn btn-ghost timer-ctrl-btn" onClick={handleReset}>
          <RotateCcw size={20} />
        </button>

        {!isRunning ? (
          elapsed > 0 && sessionId ? (
            <button className="btn btn-primary timer-start-btn" onClick={resumeTimer}>
              <Play size={22} /> Resume
            </button>
          ) : (
            <button className="btn btn-primary timer-start-btn" onClick={handleStart}>
              <Play size={22} /> Start
            </button>
          )
        ) : (
          <button className="btn btn-secondary timer-start-btn" onClick={pauseTimer}>
            <Pause size={22} /> Pause
          </button>
        )}

        <button className="btn btn-ghost timer-ctrl-btn" disabled={!isRunning && seconds === 0} onClick={handleRequestEnd}>
          <Square size={20} />
        </button>
      </div>

      {/* Ambient Sound Selector */}
      <div className="ambient-selector animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Ambient Sound:</span>
        <select
          className="input"
          value={ambientSound}
          onChange={e => setAmbientSound(e.target.value as any)}
          style={{ fontSize: '0.75rem', padding: '4px 10px', width: '130px', background: 'var(--bg-elevated)' }}
        >
          <option value="none">None</option>
          <option value="brown">Brown Noise</option>
          <option value="white">White Noise</option>
          <option value="rain">Nature Rain</option>
        </select>
      </div>

      {/* Distraction Shield */}
      {(isRunning || elapsed > 0) && mode === 'deepwork' && (
        <div className="timer-distraction card animate-fade-in" style={{ width: '90%', maxWidth: '400px', padding: '16px', marginTop: '12px' }}>
          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldAlert size={15} style={{ color: 'var(--accent)' }} /> DISTRACTION SHIELD
          </h4>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              className="input"
              placeholder="What distracted you? Enter to log."
              value={newDistraction}
              onChange={e => setNewDistraction(e.target.value)}
              style={{ fontSize: '0.8125rem', padding: '8px' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && newDistraction.trim()) {
                  setDistractions(prev => [...prev, newDistraction.trim()])
                  setNewDistraction('')
                }
              }}
            />
          </div>
          {distractions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {distractions.map((d, i) => (
                <span key={i} className="badge badge-amber" style={{ fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {d}
                  <button onClick={() => setDistractions(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Post-Session Wrap-Up Modal */}
      {isWrapUpOpen && (
        <div className="wrapup-modal-overlay">
          <div className="wrapup-modal animate-fade-in">
            <h2 className="text-xl font-bold mb-4">Session Wrap-up</h2>

            {/* Duration Override */}
            <div className="form-group mb-4">
              <label className="text-sm text-secondary block mb-1" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} /> Adjust Duration (minutes)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={600}
                  value={durationOverride ?? Math.floor(seconds / 60)}
                  onChange={e => setDurationOverride(Math.max(1, Number(e.target.value)))}
                  style={{ width: '100px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  Timer recorded: {Math.floor(seconds / 60)}m
                  {durationOverride !== null && durationOverride !== Math.floor(seconds / 60) && (
                    <span style={{ color: 'var(--status-warning)', marginLeft: '6px' }}>(overridden)</span>
                  )}
                </span>
              </div>
            </div>
            
            <div className="form-group mb-4">
              <label className="text-sm text-secondary block mb-1">What did you mainly focus on?</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Log notes, thoughts, or achievements..."
                value={notes || sessionLabel}
                onChange={e => setNotes(e.target.value)}
                style={{ width: '100%', resize: 'none' }}
              />
            </div>

            <div className="form-group mb-4">
              <label className="text-sm text-secondary block mb-1">Deep Work vs Shallow Work</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', minWidth: '55px' }}>Shallow</span>
                <input
                  type="range" min={0} max={100} value={deepWorkPct}
                  onChange={e => setDeepWorkPct(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', minWidth: '40px' }}>Deep</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--status-warning)' }}>{100 - deepWorkPct}% Shallow</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)' }}>{deepWorkPct}% Deep Work</span>
              </div>
            </div>

            <div className="form-group mb-6">
              <label className="text-sm text-secondary block mb-1">Check off completed tasks</label>
              <div className="wrapup-tasks-list">
                {activeTasks.length > 0 ? activeTasks.map(task => (
                  <label key={task.id} className="task-checkbox-item">
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.has(task.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedTaskIds)
                        if (e.target.checked) newSet.add(task.id)
                        else newSet.delete(task.id)
                        setSelectedTaskIds(newSet)
                      }}
                    />
                    <span className="task-title" style={{ textDecoration: selectedTaskIds.has(task.id) ? 'line-through' : 'none' }}>
                      {task.title} {task.scheduled_date === new Date().toISOString().split('T')[0] && <span className="today-badge">Today</span>}
                    </span>
                  </label>
                )) : <div className="text-secondary text-sm">No active tasks found.</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn btn-ghost" 
                onClick={handleDiscard}
                disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--status-error)', borderColor: 'rgba(239,68,68,0.3)' }}
              >
                <Trash2 size={14} /> Discard
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1 }}
                onClick={() => { setIsWrapUpOpen(false); setDurationOverride(null); resumeTimer(); }}
              >
                Cancel & Resume
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                onClick={finalizeSession}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Finish & Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .timer-page { display: flex; flex-direction: column; align-items: center; gap: var(--space-xl); padding-top: var(--space-xl); }
        .timer-header { text-align: center; }
        .mode-toggle { display: flex; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-full); overflow: hidden; }
        .mode-btn { padding: var(--space-sm) var(--space-2xl); font-size: 0.875rem; font-weight: 500; color: var(--text-secondary); background: none; border: none; cursor: pointer; transition: all var(--transition-fast); font-family: var(--font-sans); }
        .mode-btn:hover { color: var(--text-primary); }
        .mode-active { background: var(--accent); color: #0F0F0F; font-weight: 600; }
        .timer-ring-wrapper { position: relative; width: 300px; height: 300px; }
        .timer-ring { width: 100%; height: 100%; }
        .timer-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .timer-ring-time { font-size: 3rem; font-weight: 700; color: var(--text-primary); letter-spacing: 0.02em; }
        .timer-ring-mode { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em; color: var(--text-tertiary); margin-top: var(--space-xs); }
        .timer-ring-live { font-size: 0.6875rem; font-weight: 700; color: var(--accent); margin-top: var(--space-sm); }
        .timer-label { width: 100%; display: flex; justify-content: center; }
        .timer-intensity { display: flex; align-items: center; gap: var(--space-md); }
        .intensity-slider { display: flex; gap: 8px; }
        .intensity-dot { width: 14px; height: 14px; border-radius: var(--radius-full); background: var(--bg-hover); border: 1px solid var(--border-default); cursor: pointer; transition: all var(--transition-fast); padding: 0; }
        .intensity-dot:hover { border-color: var(--accent); }
        .intensity-active { background: var(--accent); border-color: var(--accent); }
        .timer-controls { display: flex; align-items: center; gap: var(--space-md); }
        .timer-ctrl-btn { width: 48px; height: 48px; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; padding: 0; }
        .timer-start-btn { height: 56px; padding: 0 var(--space-2xl); font-size: 1rem; border-radius: var(--radius-full); gap: var(--space-sm); }
        .wrapup-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center; z-index: 50; }
        .wrapup-modal { background: rgba(22,22,26,0.82); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: var(--space-2xl); width: 90%; max-width: 520px; box-shadow: 0 16px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }
        .wrapup-tasks-list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; background: var(--bg-elevated); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-default); }
        .task-checkbox-item { display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 4px 0; }
        .task-checkbox-item input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent); }
        .task-title { color: var(--text-primary); font-size: 0.9rem; flex: 1; }
        .today-badge { font-size: 0.7rem; color: #0F0F0F; background: var(--status-success); padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-left: 8px; }
      `}</style>
    </div>
  )
}
