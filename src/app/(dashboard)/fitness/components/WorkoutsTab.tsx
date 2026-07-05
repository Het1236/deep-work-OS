'use client'

// Hevy CSV import + workout stats: sessions, weekly volume, muscle split, PRs.

import { Dumbbell, Upload, Check, ChevronDown, ChevronUp, Trophy, Loader2, X } from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { Workout } from '@/lib/types'
import { getWorkouts, getAllSetsForStats, importHevyWorkouts } from '@/lib/data'
import { parseHevyCsv, weeklyVolume, computePRs, inferMuscleGroup, type HevyWorkout, type WeekVolume, type ExercisePR } from '@/lib/hevy'

export default function WorkoutsTab({ userId }: { userId: string }) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [weeks, setWeeks] = useState<WeekVolume[]>([])
  const [muscles, setMuscles] = useState<{ group: string; sets: number }[]>([])
  const [prs, setPrs] = useState<ExercisePR[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  // import flow
  const [pending, setPending] = useState<HevyWorkout[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - 12 * 7)
    const [w, sets] = await Promise.all([
      getWorkouts(userId, 30),
      getAllSetsForStats(userId, since.toISOString()),
    ])
    setWorkouts(w)
    setWeeks(weeklyVolume(sets))
    const byGroup = new Map<string, number>()
    for (const s of sets) {
      const g = inferMuscleGroup(s.exercise_title)
      byGroup.set(g, (byGroup.get(g) || 0) + 1)
    }
    setMuscles([...byGroup.entries()].map(([group, count]) => ({ group, sets: count })).sort((a, b) => b.sets - a.sets))
    setPrs(computePRs(sets).slice(0, 8))
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setImportResult(null)
    try {
      const text = await file.text()
      const parsed = parseHevyCsv(text)
      if (parsed.length === 0) throw new Error('That doesn\'t look like a Hevy export — expected columns like title, start_time, exercise_title.')
      setPending(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleImport() {
    if (!pending) return
    setImporting(true)
    try {
      const result = await importHevyWorkouts(userId, pending)
      setImportResult(result)
      setPending(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  const totalVolume = (w: Workout) =>
    (w.workout_sets || []).reduce((s, x) => s + (Number(x.weight_kg) || 0) * (Number(x.reps) || 0), 0)

  return (
    <div className="ft-workouts">
      {/* Import */}
      <div className="ft-card ft-pad">
        <h3 className="ft-card-title"><Upload size={15} /> Import from Hevy</h3>
        <p className="ft-hint">Hevy app → Settings → Export & Import Data → <b>Export Workout Data</b> → upload the CSV here. Re-importing skips what&apos;s already in.</p>
        {error && <div className="ft-error"><X size={14} /> {error}</div>}
        {importResult && (
          <div className="ft-saved"><Check size={15} /> Imported {importResult.imported} workout{importResult.imported === 1 ? '' : 's'}{importResult.skipped ? ` · ${importResult.skipped} already in` : ''}.</div>
        )}
        {pending ? (
          <div className="ft-import-preview">
            <p><b>{pending.length}</b> workouts · <b>{pending.reduce((n, w) => n + w.sets.length, 0)}</b> sets · {pending[pending.length - 1]?.startedAt.slice(0, 10)} → {pending[0]?.startedAt.slice(0, 10)}</p>
            <div className="ft-photo-actions">
              <button className="ft-btn" onClick={() => setPending(null)} disabled={importing}>Cancel</button>
              <button className="ft-btn ft-btn--accent" onClick={handleImport} disabled={importing}>
                {importing ? <Loader2 size={15} className="ft-spin" /> : <Upload size={15} />} Import
              </button>
            </div>
          </div>
        ) : (
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="ft-file" id="ft-hevy-file" />
            <label htmlFor="ft-hevy-file" className="ft-drop" style={{ padding: '26px 20px' }}>
              <Upload size={22} /><span>Choose your Hevy CSV export</span>
            </label>
          </>
        )}
      </div>

      {loading ? (
        <div className="ft-loading"><Loader2 size={20} className="ft-spin" /> Loading workouts…</div>
      ) : workouts.length === 0 ? (
        <div className="ft-empty">No workouts yet — import your Hevy history above. 🏋️</div>
      ) : (
        <>
          {/* Weekly volume */}
          {weeks.length > 1 && (
            <div className="ft-card ft-pad">
              <h3 className="ft-card-title">Weekly volume (last 12 weeks)</h3>
              <div style={{ width: '100%', height: 190 }}>
                <ResponsiveContainer>
                  <BarChart data={weeks} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} tickFormatter={w => w.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated, #1a1a1a)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => [`${Math.round(Number(v ?? 0)).toLocaleString()} kg`, 'volume']} />
                    <Bar dataKey="volumeKg" fill="var(--accent)" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Muscle split + PRs */}
          <div className="ft-two">
            {muscles.length > 0 && (
              <div className="ft-card ft-pad">
                <h3 className="ft-card-title">Muscle split (sets, 12 wks)</h3>
                <div className="ft-muscles">
                  {muscles.map(m => {
                    const max = muscles[0].sets
                    return (
                      <div key={m.group} className="ft-muscle">
                        <span className="ft-muscle-name">{m.group}</span>
                        <div className="ft-muscle-bar"><div className="ft-muscle-fill" style={{ width: `${(m.sets / max) * 100}%` }} /></div>
                        <span className="ft-muscle-n">{m.sets}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {prs.length > 0 && (
              <div className="ft-card ft-pad">
                <h3 className="ft-card-title"><Trophy size={15} /> PRs (12 wks)</h3>
                <div className="ft-prs">
                  {prs.map(pr => (
                    <div key={pr.exercise} className="ft-pr">
                      <span className="ft-pr-ex">{pr.exercise}</span>
                      <span className="ft-pr-val">{pr.bestWeight}kg · e1RM {pr.bestEst1RM}kg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sessions */}
          <div className="ft-card ft-pad">
            <h3 className="ft-card-title"><Dumbbell size={15} /> Sessions</h3>
            <div className="ft-sessions">
              {workouts.map(w => {
                const open = expanded === w.id
                const byEx = new Map<string, typeof w.workout_sets>()
                for (const s of w.workout_sets || []) {
                  const list = byEx.get(s.exercise_title) || []
                  list!.push(s)
                  byEx.set(s.exercise_title, list)
                }
                return (
                  <div key={w.id} className="ft-session">
                    <button className="ft-session-head" onClick={() => setExpanded(open ? null : w.id)}>
                      <div className="ft-session-main">
                        <span className="ft-session-title">{w.title}</span>
                        <span className="ft-session-meta">
                          {new Date(w.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          {' · '}{(w.workout_sets || []).length} sets · {Math.round(totalVolume(w)).toLocaleString()} kg
                        </span>
                      </div>
                      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {open && (
                      <div className="ft-session-body">
                        {[...byEx.entries()].map(([ex, sets]) => (
                          <div key={ex} className="ft-ex">
                            <div className="ft-ex-name">{ex}</div>
                            <div className="ft-ex-sets">
                              {(sets || []).sort((a, b) => a.set_index - b.set_index).map(s => (
                                <span key={s.id} className="ft-set">
                                  {s.weight_kg != null && s.reps != null
                                    ? `${s.weight_kg}kg × ${s.reps}`
                                    : s.duration_seconds != null
                                      ? `${Math.round(s.duration_seconds / 60)}min`
                                      : s.reps != null ? `× ${s.reps}` : '—'}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
