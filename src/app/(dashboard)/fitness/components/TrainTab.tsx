'use client'

// Today's session + the whole week, with inline editing of the programme.

import { useState } from 'react'
import Link from 'next/link'
import { Play, Dumbbell, Footprints, Moon, Info, Check, X, Pencil, Trash2, Plus, Loader2, Video } from 'lucide-react'
import DemoModal from './DemoModal'
import type { Program, ProgramDay, ProgramExercise, Exercise } from '@/lib/types'
import {
  updateProgramExercise, deleteProgramExercise, addProgramExercise, updateProgramDay,
} from '@/lib/fitness/data'

const DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function todayDow() { return (new Date().getDay() + 6) % 7 }

const ICONS = { lift: Dumbbell, run: Footprints, rest: Moon }

export default function TrainTab({
  userId, program, exercises, onChanged,
}: {
  userId: string; program: Program | null; exercises: Exercise[]; onChanged: () => void
}) {
  const [selected, setSelected] = useState(todayDow())
  const [editing, setEditing] = useState(false)

  if (!program) {
    return <div className="ft-empty">No active programme. Your Block 1 split should have been seeded — reload, or check the database.</div>
  }

  const days = program.program_days || []
  const day = days.find(d => d.day_of_week === selected)
  const isToday = selected === todayDow()

  return (
    <div className="ft-train">
      {/* Week strip */}
      <div className="ft-week">
        {days.map(d => {
          const Icon = ICONS[d.day_type]
          const active = d.day_of_week === selected
          return (
            <button key={d.id}
                    className={`ft-wd ft-wd--${d.day_type}${active ? ' ft-wd--on' : ''}${d.day_of_week === todayDow() ? ' ft-wd--today' : ''}`}
                    onClick={() => setSelected(d.day_of_week)}>
              <span className="ft-wd-d">{SHORT[d.day_of_week]}</span>
              <Icon size={15} />
              <span className="ft-wd-t">{d.title}</span>
              {d.scheduled_time && <span className="ft-wd-h">{d.scheduled_time.slice(0, 5)}</span>}
            </button>
          )
        })}
      </div>

      {day && (
        <>
          <div className="ft-card ft-pad ft-dayhero">
            <div className="ft-dayhero-top">
              <div>
                <span className="ft-dayhero-lbl">{isToday ? 'Today' : DOW[day.day_of_week]}</span>
                <h2 className="ft-dayhero-title">{day.title}</h2>
                <p className="ft-dayhero-meta">
                  {day.scheduled_time ? day.scheduled_time.slice(0, 5) : 'flexible'}
                  {day.day_type === 'run' && day.target_distance_km ? ` · ${day.target_distance_km} km ${day.run_type ?? ''}` : ''}
                  {day.day_type === 'lift' ? ` · ${day.program_exercises?.length ?? 0} exercises` : ''}
                </p>
              </div>
              {day.day_type === 'lift' && (
                <Link href="/fitness/session" className="ft-btn ft-btn--accent ft-start">
                  <Play size={15} /> Start
                </Link>
              )}
            </div>
            {day.notes && <div className="ft-daynote"><Info size={14} /> <span>{day.notes}</span></div>}
          </div>

          {day.day_type === 'lift' && (
            <div className="ft-card ft-pad">
              <div className="ft-card-head">
                <h3 className="ft-card-title">Exercises</h3>
                <button className="ft-btn ft-btn--ghost ft-tiny" onClick={() => setEditing(e => !e)}>
                  {editing ? <><Check size={13} /> Done</> : <><Pencil size={13} /> Edit</>}
                </button>
              </div>
              <ExerciseList day={day} editing={editing} userId={userId} exercises={exercises} onChanged={onChanged} />
            </div>
          )}

          {day.day_type === 'run' && (
            <RunDayCard day={day} onChanged={onChanged} />
          )}

          {day.day_type === 'rest' && (
            <div className="ft-card ft-pad">
              <h3 className="ft-card-title"><Moon size={15} /> Recovery</h3>
              <p className="ft-hint" style={{ marginBottom: 0 }}>
                Yoga or a mobility flow: hips, ankles, thoracic spine, hamstrings. Foam roll quads,
                calves and glutes. A long easy walk is fine. This is the day that lets you stack good
                weeks — treat it as training, not a gap.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ExerciseList({ day, editing, userId, exercises, onChanged }: {
  day: ProgramDay; editing: boolean; userId: string; exercises: Exercise[]; onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [demo, setDemo] = useState<Exercise | null>(null)

  const list = day.program_exercises || []

  async function patch(pe: ProgramExercise, updates: Partial<ProgramExercise>) {
    setBusy(true)
    try { await updateProgramExercise(pe.id, updates); onChanged() } finally { setBusy(false) }
  }
  async function remove(pe: ProgramExercise) {
    if (!confirm(`Remove ${pe.exercises?.name} from ${day.title}?`)) return
    setBusy(true)
    try { await deleteProgramExercise(pe.id); onChanged() } finally { setBusy(false) }
  }
  async function add(ex: Exercise) {
    setBusy(true)
    try { await addProgramExercise(userId, day.id, ex.id, list.length); setAdding(false); onChanged() }
    finally { setBusy(false) }
  }

  return (
    <div className="ft-exlist">
      {list.map((pe, i) => {
        const ex = pe.exercises
        const target = pe.target_reps_min === pe.target_reps_max
          ? `${pe.target_sets} × ${pe.target_reps_min}`
          : `${pe.target_sets} × ${pe.target_reps_min}–${pe.target_reps_max}`
        const isOpen = open === pe.id
        return (
          <div key={pe.id} className="ft-exrow">
            <div className="ft-exrow-head">
              <span className="ft-exrow-n">{i + 1}</span>
              <button className="ft-exrow-main" onClick={() => setOpen(isOpen ? null : pe.id)}>
                <span className="ft-exrow-name">
                  {ex?.name}
                  {ex?.is_isometric && <span className="ft-isotag">ISO</span>}
                </span>
                <span className="ft-exrow-meta">
                  {target}
                  {pe.target_hold_seconds ? ` · hold ${pe.target_hold_seconds}s` : ''}
                  {' · '}{pe.rest_seconds}s rest · {ex?.primary_muscle}
                </span>
              </button>
              {ex && (
                <button className="ft-mini" onClick={() => setDemo(ex)} aria-label={`Demo: ${ex.name}`} title="Watch form demo">
                  <Video size={14} />
                </button>
              )}
              {editing && (
                <button className="ft-mini ft-mini--danger" onClick={() => remove(pe)} disabled={busy} aria-label="Remove">
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {isOpen && ex?.form_cues && ex.form_cues.length > 0 && (
              <ul className="ft-cues">{ex.form_cues.map((c, k) => <li key={k}>{c}</li>)}</ul>
            )}

            {editing && (
              <div className="ft-extargets">
                <label><span>Sets</span>
                  <input className="ft-input ft-sm ft-num" type="number" defaultValue={pe.target_sets}
                         onBlur={e => patch(pe, { target_sets: Number(e.target.value) })} /></label>
                <label><span>Reps min</span>
                  <input className="ft-input ft-sm ft-num" type="number" defaultValue={pe.target_reps_min ?? ''}
                         onBlur={e => patch(pe, { target_reps_min: Number(e.target.value) })} /></label>
                <label><span>Reps max</span>
                  <input className="ft-input ft-sm ft-num" type="number" defaultValue={pe.target_reps_max ?? ''}
                         onBlur={e => patch(pe, { target_reps_max: Number(e.target.value) })} /></label>
                <label><span>Hold s</span>
                  <input className="ft-input ft-sm ft-num" type="number" defaultValue={pe.target_hold_seconds ?? ''}
                         onBlur={e => patch(pe, { target_hold_seconds: e.target.value ? Number(e.target.value) : null })} /></label>
                <label><span>Rest s</span>
                  <input className="ft-input ft-sm ft-num" type="number" defaultValue={pe.rest_seconds}
                         onBlur={e => patch(pe, { rest_seconds: Number(e.target.value) })} /></label>
              </div>
            )}
          </div>
        )
      })}

      {editing && (
        adding ? (
          <div className="ft-addbox">
            <div className="ft-addbox-head">
              <span>Add exercise</span>
              <button className="ft-mini" onClick={() => setAdding(false)}><X size={14} /></button>
            </div>
            <div className="ft-addbox-list">
              {exercises.slice(0, 200).map(e => (
                <button key={e.id} className="ft-addpick" onClick={() => add(e)} disabled={busy}>
                  <span>{e.name}</span><span className="ft-addpick-m">{e.primary_muscle}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button className="ft-btn ft-btn--ghost" onClick={() => setAdding(true)} disabled={busy}>
            {busy ? <Loader2 size={14} className="ft-spin" /> : <Plus size={14} />} Add exercise
          </button>
        )
      )}

      {demo && <DemoModal exercise={demo} onClose={() => setDemo(null)} />}
    </div>
  )
}

function RunDayCard({ day, onChanged }: { day: ProgramDay; onChanged: () => void }) {
  const [dist, setDist] = useState(String(day.target_distance_km ?? ''))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try { await updateProgramDay(day.id, { target_distance_km: dist ? Number(dist) : null }); onChanged() }
    finally { setSaving(false) }
  }

  return (
    <div className="ft-card ft-pad">
      <h3 className="ft-card-title"><Footprints size={15} /> Run target</h3>
      <div className="ft-runtarget">
        <label className="ft-field" style={{ maxWidth: 140 }}>
          <span>Distance (km)</span>
          <input className="ft-input ft-sm" type="number" step="0.5" value={dist}
                 onChange={e => setDist(e.target.value)} onBlur={save} />
        </label>
        <div className="ft-runtype">{day.run_type}</div>
        {saving && <Loader2 size={14} className="ft-spin" />}
      </div>
      <p className="ft-hint" style={{ marginTop: 12, marginBottom: 0 }}>
        Zone 2 is <b>8:30–9:15 /km</b> at <b>HR 130–150</b>. If you cannot hold a full sentence, slow down.
        Bump the distance each week as the block progresses.
      </p>
    </div>
  )
}
