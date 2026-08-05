'use client'

// Full-screen gym logger. Deliberately outside .ft-wrap: the dashboard CSS is
// desktop-first (920px cap, hover states, 44px cells) and a set-logging row
// needs the opposite — full-bleed, 56px+ targets, no hover, thumb-reachable.
//
// The localStorage draft is load-bearing, not a nicety: college gym wifi drops,
// and a dropped connection mid-workout must never cost the user their sets.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, Plus, Check, Timer, Trash2, ChevronDown, ChevronUp, Info,
  Search, Loader2, Trophy, ArrowLeft, Video,
} from 'lucide-react'
import DemoModal from '../components/DemoModal'
import { useUser } from '@/components/UserContext'
import {
  getActiveProgram, getExercises, saveSession, getLastSetsForExercise,
} from '@/lib/fitness/data'
import { epley1RM, formatDuration } from '@/lib/fitness/stats'
import type {
  Exercise, Program, ProgramDay, SessionDraft, DraftExercise, DraftSet, MetricType, WorkoutSet,
} from '@/lib/types'

const DRAFT_KEY = 'lifeos.fitness.session.draft'
const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function todayDow(): number {
  return (new Date().getDay() + 6) % 7   // 0 = Monday
}

function newSet(prev?: DraftSet): DraftSet {
  return {
    key: Math.random().toString(36).slice(2),
    weight_kg: prev?.weight_kg ?? null,
    reps: null,
    hold_seconds: prev?.hold_seconds ?? null,
    duration_seconds: null,
    distance_km: null,
    rpe: null,
    is_warmup: false,
    done: false,
  }
}

function draftFromProgramDay(day: ProgramDay): SessionDraft {
  return {
    title: day.title,
    startedAt: new Date().toISOString(),
    programDayId: day.id,
    exercises: (day.program_exercises || []).map(pe => {
      const ex = pe.exercises
      const base: DraftExercise = {
        key: Math.random().toString(36).slice(2),
        exercise_id: pe.exercise_id,
        name: ex?.name || 'Exercise',
        metric_type: (ex?.metric_type || 'weight_reps') as MetricType,
        primary_muscle: ex?.primary_muscle || 'Other',
        form_cues: ex?.form_cues || [],
        is_isometric: ex?.is_isometric || false,
        rest_seconds: pe.rest_seconds,
        target_sets: pe.target_sets,
        target_reps_min: pe.target_reps_min,
        target_reps_max: pe.target_reps_max,
        target_hold_seconds: pe.target_hold_seconds,
        sets: [],
      }
      base.sets = Array.from({ length: pe.target_sets }, () => ({
        ...newSet(),
        hold_seconds: pe.target_hold_seconds ?? null,
      }))
      return base
    }),
  }
}

function exerciseToDraft(ex: Exercise): DraftExercise {
  return {
    key: Math.random().toString(36).slice(2),
    exercise_id: ex.id,
    name: ex.name,
    metric_type: ex.metric_type,
    primary_muscle: ex.primary_muscle,
    form_cues: ex.form_cues,
    is_isometric: ex.is_isometric,
    rest_seconds: ex.default_rest_seconds,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    target_hold_seconds: ex.is_isometric ? 60 : null,
    sets: [newSet(), newSet(), newSet()],
  }
}

export default function SessionClient() {
  const { userId } = useUser()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [program, setProgram] = useState<Program | null>(null)
  const [allExercises, setAllExercises] = useState<Exercise[]>([])
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const [picker, setPicker] = useState(false)
  const [demo, setDemo] = useState<Exercise | null>(null)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState<null | {
    volume: number; sets: number; duration: number; prs: string[]
  }>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastTime, setLastTime] = useState<Record<string, { started_at: string; sets: WorkoutSet[] } | null>>({})

  // ── Rest timer ──
  const [rest, setRest] = useState<{ total: number; left: number } | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)

  useEffect(() => {
    if (!rest) return
    if (rest.left <= 0) { setRest(null); return }
    const t = setTimeout(() => setRest(r => (r ? { ...r, left: r.left - 1 } : null)), 1000)
    return () => clearTimeout(t)
  }, [rest])

  // Hold a screen wake lock for the whole session — the phone locking mid-set is
  // the most annoying possible failure in a gym.
  useEffect(() => {
    let cancelled = false
    async function acquire() {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
        if (!nav.wakeLock) return
        const lock = await nav.wakeLock.request('screen')
        if (cancelled) { await lock.release(); return }
        wakeLock.current = lock
      } catch { /* denied or unsupported — not fatal */ }
    }
    if (draft) acquire()
    return () => { cancelled = true; wakeLock.current?.release().catch(() => {}) }
  }, [draft])

  // ── Load ──
  useEffect(() => {
    if (!userId) return
    ;(async () => {
      setLoading(true)
      const [p, ex] = await Promise.all([getActiveProgram(userId), getExercises()])
      setProgram(p)
      setAllExercises(ex)

      const stored = typeof window !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null
      if (stored) {
        try { setDraft(JSON.parse(stored) as SessionDraft) } catch { localStorage.removeItem(DRAFT_KEY) }
      }
      setLoading(false)
    })()
  }, [userId])

  // Persist on every mutation.
  useEffect(() => {
    if (!draft) return
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [draft])

  // Fetch "last time" for each exercise once it's in the draft.
  useEffect(() => {
    if (!draft || !userId) return
    const missing = draft.exercises.filter(e => !(e.exercise_id in lastTime))
    if (missing.length === 0) return
    ;(async () => {
      const results = await Promise.all(
        missing.map(async e => [e.exercise_id, await getLastSetsForExercise(userId, e.exercise_id)] as const))
      setLastTime(prev => {
        const next = { ...prev }
        for (const [id, v] of results) next[id] = v
        return next
      })
    })()
  }, [draft, userId, lastTime])

  const mutate = useCallback((fn: (d: SessionDraft) => SessionDraft) => {
    setDraft(d => (d ? fn(structuredClone(d)) : d))
  }, [])

  const todayDay = useMemo(
    () => program?.program_days?.find(d => d.day_of_week === todayDow()) || null,
    [program])

  function startFrom(day: ProgramDay) {
    setDraft(draftFromProgramDay(day))
    setLastTime({})
  }
  function startBlank() {
    setDraft({ title: 'Workout', startedAt: new Date().toISOString(), programDayId: null, exercises: [] })
    setLastTime({})
  }

  function toggleSet(exKey: string, setKey: string) {
    mutate(d => {
      const ex = d.exercises.find(e => e.key === exKey)
      if (!ex) return d
      const s = ex.sets.find(x => x.key === setKey)
      if (!s) return d
      s.done = !s.done
      if (s.done && ex.rest_seconds > 0) setRest({ total: ex.rest_seconds, left: ex.rest_seconds })
      return d
    })
  }

  function editSet(exKey: string, setKey: string, patch: Partial<DraftSet>) {
    mutate(d => {
      const ex = d.exercises.find(e => e.key === exKey)
      const s = ex?.sets.find(x => x.key === setKey)
      if (s) Object.assign(s, patch)
      return d
    })
  }

  function addSet(exKey: string) {
    mutate(d => {
      const ex = d.exercises.find(e => e.key === exKey)
      if (ex) ex.sets.push(newSet(ex.sets[ex.sets.length - 1]))
      return d
    })
  }
  function removeSet(exKey: string, setKey: string) {
    mutate(d => {
      const ex = d.exercises.find(e => e.key === exKey)
      if (ex) ex.sets = ex.sets.filter(s => s.key !== setKey)
      return d
    })
  }
  function removeExercise(exKey: string) {
    mutate(d => { d.exercises = d.exercises.filter(e => e.key !== exKey); return d })
  }
  function moveExercise(exKey: string, dir: -1 | 1) {
    mutate(d => {
      const i = d.exercises.findIndex(e => e.key === exKey)
      const j = i + dir
      if (i < 0 || j < 0 || j >= d.exercises.length) return d
      ;[d.exercises[i], d.exercises[j]] = [d.exercises[j], d.exercises[i]]
      return d
    })
  }
  function addExercise(ex: Exercise) {
    mutate(d => { d.exercises.push(exerciseToDraft(ex)); return d })
    setPicker(false)
  }

  async function finish() {
    if (!draft || !userId) return
    setSaving(true); setError(null)
    try {
      const done = draft.exercises.flatMap(e => e.sets.filter(s => s.done))
      const volume = done.reduce((n, s) => n + (s.weight_kg || 0) * (s.reps || 0), 0)

      // PR = best e1RM for this exercise beats everything logged before today.
      const prs: string[] = []
      for (const ex of draft.exercises) {
        const best = Math.max(0, ...ex.sets.filter(s => s.done && s.weight_kg && s.reps)
          .map(s => epley1RM(s.weight_kg!, s.reps!)))
        if (best <= 0) continue
        const prev = lastTime[ex.exercise_id]
        const prevBest = Math.max(0, ...(prev?.sets || [])
          .filter(s => s.weight_kg && s.reps).map(s => epley1RM(s.weight_kg!, s.reps!)))
        if (best > prevBest && prevBest > 0) prs.push(ex.name)
      }

      await saveSession(userId, draft)
      localStorage.removeItem(DRAFT_KEY)
      setSummary({
        volume: Math.round(volume),
        sets: done.length,
        duration: Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 1000),
        prs,
      })
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the session.')
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    if (!confirm('Discard this workout? Everything you logged will be lost.')) return
    localStorage.removeItem(DRAFT_KEY)
    setDraft(null)
  }

  // ── Render ──
  if (loading) {
    return <div className="fs-center"><Loader2 size={22} className="ft-spin" /> Loading…</div>
  }

  if (summary) {
    return (
      <div className="fs-wrap">
        <div className="fs-done">
          <div className="fs-done-tick"><Check size={34} /></div>
          <h1>Session complete</h1>
          <div className="fs-done-stats">
            <div><b>{summary.sets}</b><span>sets</span></div>
            <div><b>{summary.volume.toLocaleString()}</b><span>kg volume</span></div>
            <div><b>{formatDuration(summary.duration)}</b><span>duration</span></div>
          </div>
          {summary.prs.length > 0 && (
            <div className="fs-prs">
              <Trophy size={16} />
              <span>New best on {summary.prs.join(', ')}</span>
            </div>
          )}
          <button className="fs-primary" onClick={() => router.push('/fitness')}>Back to Fitness</button>
        </div>
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="fs-wrap">
        <header className="fs-top">
          <button className="ft-mini" onClick={() => router.push('/fitness')} aria-label="Back"><ArrowLeft size={16} /></button>
          <span className="fs-top-title">Start a session</span>
          <span style={{ width: 30 }} />
        </header>
        <div className="fs-start">
          {todayDay && (
            <div className="fs-today">
              <span className="fs-today-lbl">Today · {DOW[todayDow()]}</span>
              <h2>{todayDay.title}</h2>
              {todayDay.notes && <p>{todayDay.notes}</p>}
              {todayDay.day_type === 'lift' ? (
                <button className="fs-primary" onClick={() => startFrom(todayDay)}>
                  Start {todayDay.title} · {todayDay.program_exercises?.length ?? 0} exercises
                </button>
              ) : todayDay.day_type === 'run' ? (
                <div className="fs-restday">
                  Today is a <b>{todayDay.target_distance_km ?? ''}km {todayDay.run_type} run</b>, not a lift.
                  Log it from the Runs tab or sync from Strava.
                </div>
              ) : (
                <div className="fs-restday">Today is <b>rest and mobility</b>. That is part of the programme — take it.</div>
              )}
            </div>
          )}

          <div className="fs-otherdays">
            <span className="fs-lbl">Or pick another day</span>
            {(program?.program_days || []).filter(d => d.day_type === 'lift').map(d => (
              <button key={d.id} className="fs-dayrow" onClick={() => startFrom(d)}>
                <span className="fs-dayrow-name">{DOW[d.day_of_week]} · {d.title}</span>
                <span className="fs-dayrow-n">{d.program_exercises?.length ?? 0}</span>
              </button>
            ))}
            <button className="fs-dayrow fs-dayrow--ghost" onClick={startBlank}>
              <span className="fs-dayrow-name">Empty session</span><Plus size={16} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const doneSets = draft.exercises.flatMap(e => e.sets.filter(s => s.done)).length
  const totalSets = draft.exercises.reduce((n, e) => n + e.sets.length, 0)
  const liveVolume = draft.exercises.flatMap(e => e.sets.filter(s => s.done))
    .reduce((n, s) => n + (s.weight_kg || 0) * (s.reps || 0), 0)

  return (
    <div className="fs-wrap">
      <header className="fs-top">
        <button className="ft-mini" onClick={discard} aria-label="Discard"><X size={16} /></button>
        <div className="fs-top-mid">
          <span className="fs-top-title">{draft.title}</span>
          <span className="fs-top-sub">{doneSets}/{totalSets} sets · {Math.round(liveVolume).toLocaleString()} kg</span>
        </div>
        <button className="fs-finish" onClick={finish} disabled={saving || doneSets === 0}>
          {saving ? <Loader2 size={15} className="ft-spin" /> : 'Finish'}
        </button>
      </header>

      {error && <div className="fs-error">{error}</div>}

      <div className="fs-body">
        {draft.exercises.map((ex, i) => (
          <ExerciseCard
            key={ex.key} ex={ex} index={i} total={draft.exercises.length}
            last={lastTime[ex.exercise_id] ?? null}
            onToggle={k => toggleSet(ex.key, k)}
            onEdit={(k, p) => editSet(ex.key, k, p)}
            onAddSet={() => addSet(ex.key)}
            onRemoveSet={k => removeSet(ex.key, k)}
            onRemove={() => removeExercise(ex.key)}
            onMove={d => moveExercise(ex.key, d)}
            onDemo={() => setDemo(allExercises.find(a => a.id === ex.exercise_id) ?? null)}
          />
        ))}

        <button className="fs-add" onClick={() => setPicker(true)}>
          <Plus size={17} /> Add exercise
        </button>
      </div>

      {rest && (
        <div className="fs-rest">
          <Timer size={16} />
          <span className="fs-rest-n">{Math.floor(rest.left / 60)}:{String(rest.left % 60).padStart(2, '0')}</span>
          <div className="fs-rest-bar"><div style={{ width: `${(rest.left / rest.total) * 100}%` }} /></div>
          <button onClick={() => setRest(null)}>Skip</button>
        </div>
      )}

      {picker && (
        <ExercisePicker
          exercises={allExercises}
          onPick={addExercise}
          onClose={() => setPicker(false)}
        />
      )}

      {demo && <DemoModal exercise={demo} onClose={() => setDemo(null)} />}
    </div>
  )
}

// ─── Exercise card ────────────────────────────────────────────
function ExerciseCard({
  ex, index, total, last, onToggle, onEdit, onAddSet, onRemoveSet, onRemove, onMove, onDemo,
}: {
  ex: DraftExercise; index: number; total: number
  last: { started_at: string; sets: WorkoutSet[] } | null
  onToggle: (k: string) => void
  onEdit: (k: string, p: Partial<DraftSet>) => void
  onAddSet: () => void
  onRemoveSet: (k: string) => void
  onRemove: () => void
  onMove: (d: -1 | 1) => void
  onDemo: () => void
}) {
  const [cues, setCues] = useState(false)

  const target = ex.target_reps_min && ex.target_reps_max
    ? (ex.target_reps_min === ex.target_reps_max ? `${ex.target_sets} × ${ex.target_reps_min}` : `${ex.target_sets} × ${ex.target_reps_min}–${ex.target_reps_max}`)
    : `${ex.target_sets} sets`

  const lastLine = last?.sets.length
    ? last.sets.slice(0, 5).map(s =>
        s.weight_kg != null && s.reps != null ? `${s.weight_kg}×${s.reps}`
        : s.hold_seconds != null ? `${s.hold_seconds}s`
        : s.reps != null ? `×${s.reps}` : '—').join('  ')
    : null

  return (
    <div className="fs-ex">
      <div className="fs-ex-head">
        <div className="fs-ex-main">
          <div className="fs-ex-name">
            {ex.name}
            {ex.is_isometric && <span className="fs-iso">ISO</span>}
          </div>
          <div className="fs-ex-meta">
            {ex.primary_muscle} · target {target}
            {ex.target_hold_seconds ? ` · hold ${ex.target_hold_seconds}s` : ''}
          </div>
          {lastLine && (
            <div className="fs-ex-last">
              Last · {new Date(last!.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {lastLine}
            </div>
          )}
        </div>
        <div className="fs-ex-actions">
          <button className="ft-mini" onClick={onDemo} aria-label="Watch form demo"><Video size={14} /></button>
          {ex.form_cues.length > 0 && (
            <button className="ft-mini" onClick={() => setCues(c => !c)} aria-label="Form cues"><Info size={14} /></button>
          )}
          <button className="ft-mini" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up"><ChevronUp size={14} /></button>
          <button className="ft-mini" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down"><ChevronDown size={14} /></button>
          <button className="ft-mini ft-mini--danger" onClick={onRemove} aria-label="Remove exercise"><Trash2 size={14} /></button>
        </div>
      </div>

      {cues && ex.form_cues.length > 0 && (
        <ul className="fs-cues">{ex.form_cues.map((c, i) => <li key={i}>{c}</li>)}</ul>
      )}

      <div className="fs-sets">
        <div className="fs-setrow fs-setrow--head">
          <span>Set</span>
          {columnsFor(ex.metric_type).map(c => <span key={c}>{c}</span>)}
          <span />
        </div>
        {ex.sets.map((s, i) => (
          <SetRow key={s.key} ex={ex} s={s} index={i}
                  onToggle={() => onToggle(s.key)}
                  onEdit={p => onEdit(s.key, p)}
                  onRemove={() => onRemoveSet(s.key)} />
        ))}
      </div>

      <button className="fs-addset" onClick={onAddSet}><Plus size={14} /> Add set</button>
    </div>
  )
}

function columnsFor(m: MetricType): string[] {
  switch (m) {
    case 'weight_reps': return ['kg', 'reps']
    case 'reps': return ['reps']
    case 'weighted_bodyweight': return ['+kg', 'reps']
    case 'assisted_bodyweight': return ['−kg', 'reps']
    case 'duration': return ['sec']
    case 'weight_duration': return ['kg', 'hold s', 'reps']
    case 'distance_duration': return ['km', 'min']
  }
}

function SetRow({ ex, s, index, onToggle, onEdit, onRemove }: {
  ex: DraftExercise; s: DraftSet; index: number
  onToggle: () => void; onEdit: (p: Partial<DraftSet>) => void; onRemove: () => void
}) {
  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v))
  const cols = columnsFor(ex.metric_type)

  const inputs: React.ReactNode[] = []
  const push = (key: string, value: number | null, on: (v: number | null) => void, step = '0.5') => {
    inputs.push(
      <input key={key} className="fs-in" type="number" inputMode="decimal" step={step}
             value={value ?? ''} onChange={e => on(num(e.target.value))} />)
  }

  switch (ex.metric_type) {
    case 'weight_reps':
    case 'weighted_bodyweight':
    case 'assisted_bodyweight':
      push('w', s.weight_kg, v => onEdit({ weight_kg: v }))
      push('r', s.reps, v => onEdit({ reps: v }), '1')
      break
    case 'reps':
      push('r', s.reps, v => onEdit({ reps: v }), '1')
      break
    case 'duration':
      push('d', s.duration_seconds, v => onEdit({ duration_seconds: v }), '1')
      break
    case 'weight_duration':
      push('w', s.weight_kg, v => onEdit({ weight_kg: v }))
      push('h', s.hold_seconds, v => onEdit({ hold_seconds: v }), '1')
      push('r', s.reps, v => onEdit({ reps: v }), '1')
      break
    case 'distance_duration':
      push('k', s.distance_km, v => onEdit({ distance_km: v }), '0.1')
      push('m', s.duration_seconds ? s.duration_seconds / 60 : null,
        v => onEdit({ duration_seconds: v == null ? null : Math.round(v * 60) }), '1')
      break
  }

  return (
    <div className={`fs-setrow${s.done ? ' fs-setrow--done' : ''}`}
         style={{ gridTemplateColumns: `36px repeat(${cols.length}, 1fr) 84px` }}>
      <button className="fs-setno" onClick={() => onEdit({ is_warmup: !s.is_warmup })}
              title="Toggle warm-up set">
        {s.is_warmup ? 'W' : index + 1}
      </button>
      {inputs}
      <div className="fs-setend">
        <button className="fs-tick" onClick={onToggle} aria-label="Complete set"><Check size={16} /></button>
        <button className="ft-mini ft-mini--danger" onClick={onRemove} aria-label="Delete set"><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

// ─── Exercise picker ──────────────────────────────────────────
function ExercisePicker({ exercises, onPick, onClose }: {
  exercises: Exercise[]; onPick: (e: Exercise) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<string>('All')

  const muscles = useMemo(
    () => ['All', ...[...new Set(exercises.map(e => e.primary_muscle))].sort()],
    [exercises])

  const filtered = exercises.filter(e =>
    (muscle === 'All' || e.primary_muscle === muscle) &&
    e.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="fs-sheet" role="dialog" aria-label="Add exercise">
      <div className="fs-sheet-head">
        <div className="fs-search">
          <Search size={15} />
          <input autoFocus placeholder="Search exercises…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button className="ft-mini" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="fs-chips">
        {muscles.map(m => (
          <button key={m} className={`ft-chip${muscle === m ? ' on' : ''}`} onClick={() => setMuscle(m)}>{m}</button>
        ))}
      </div>
      <div className="fs-sheet-list">
        {filtered.map(e => (
          <button key={e.id} className="fs-pick" onClick={() => onPick(e)}>
            <div>
              <div className="fs-pick-name">{e.name}</div>
              <div className="fs-pick-meta">{e.primary_muscle} · {e.equipment} · {e.metric_type.replace(/_/g, ' ')}</div>
            </div>
            <Plus size={16} />
          </button>
        ))}
        {filtered.length === 0 && <div className="fs-empty">No exercises match.</div>}
      </div>
    </div>
  )
}
