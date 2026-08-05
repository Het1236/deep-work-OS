// Fitness analytics. Pure functions over workouts, sets and runs — no I/O.
// The lifting primitives (epley1RM, computePRs, weeklyVolume, inferMuscleGroup)
// still live in hevy.ts because the CSV importer needs them; re-exported here so
// callers can treat this as the single stats entry point.

import { epley1RM, computePRs, weeklyVolume, inferMuscleGroup } from '@/lib/hevy'
import type { Run, StreakDay, MuscleVolume, E1rmPoint, RunTrendPoint, MonthlyReport } from '@/lib/types'

export { epley1RM, computePRs, weeklyVolume, inferMuscleGroup }
export type { ExercisePR, WeekVolume, SetLike } from '@/lib/hevy'

// ─── Formatting ───────────────────────────────────────────────
export function paceSecPerKm(distanceM: number, movingTimeS: number): number {
  if (!distanceM || !movingTimeS) return 0
  return movingTimeS / (distanceM / 1000)
}

export function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function km(distanceM: number): number {
  return Math.round((distanceM / 1000) * 100) / 100
}

// Local (IST) YYYY-MM-DD for an ISO timestamp. Never use UTC for day bucketing —
// a 05:15 run in IST lands on the previous UTC day.
export function localDay(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Volume ───────────────────────────────────────────────────
type SetRow = {
  weight_kg: number | null
  reps: number | null
  hold_seconds?: number | null
  exercise_title: string
  started_at?: string
}

export function setVolume(s: { weight_kg: number | null; reps: number | null }): number {
  if (!s.weight_kg || !s.reps) return 0
  return s.weight_kg * s.reps
}

export function totalVolume(sets: SetRow[]): number {
  return sets.reduce((n, s) => n + setVolume(s), 0)
}

// ─── Streak calendar ──────────────────────────────────────────
export function buildStreakDays(
  workouts: { started_at: string; workout_sets?: { weight_kg: number | null; reps: number | null }[] }[],
  runs: Run[],
  days: number,
): StreakDay[] {
  const byDate = new Map<string, StreakDay>()
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = localDay(d.toISOString())
    byDate.set(key, { date: key, lifted: false, ran: false, volumeKg: 0, distanceKm: 0 })
  }

  for (const w of workouts) {
    const key = localDay(w.started_at)
    const row = byDate.get(key)
    if (!row) continue
    row.lifted = true
    row.volumeKg += totalVolume((w.workout_sets || []) as SetRow[])
  }
  for (const r of runs) {
    const key = localDay(r.started_at)
    const row = byDate.get(key)
    if (!row) continue
    row.ran = true
    row.distanceKm += km(r.distance_m)
  }
  return [...byDate.values()]
}

// Counts back from today. A day with either a lift or a run keeps the streak
// alive; a day with neither breaks it. Today not-yet-trained does not break it —
// the day isn't over. Rest days DO break it: see `programmeStreak` for the
// programme-aware variant.
export function currentStreak(days: StreakDay[]): number {
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]
    const trained = d.lifted || d.ran
    if (trained) { streak++; continue }
    if (i === days.length - 1) continue   // today, still open
    break
  }
  return streak
}

// Programme-aware streak: a scheduled rest day counts as honoured, so following
// the plan exactly keeps an unbroken streak. `restDows` is the set of weekday
// numbers (0 = Monday) the programme marks as rest.
export function programmeStreak(days: StreakDay[], restDows: Set<number>): number {
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]
    const dow = (new Date(`${d.date}T12:00:00`).getDay() + 6) % 7
    const trained = d.lifted || d.ran
    if (trained || restDows.has(dow)) { streak++; continue }
    if (i === days.length - 1) continue
    break
  }
  return streak
}

export function longestStreak(days: StreakDay[], restDows: Set<number>): number {
  let best = 0, run = 0
  for (const d of days) {
    const dow = (new Date(`${d.date}T12:00:00`).getDay() + 6) % 7
    if (d.lifted || d.ran || restDows.has(dow)) { run++; best = Math.max(best, run) }
    else run = 0
  }
  return best
}

// ─── Muscle split ─────────────────────────────────────────────
export function muscleVolume(
  sets: { exercise_title: string; weight_kg: number | null; reps: number | null; muscle?: string | null }[],
): MuscleVolume[] {
  const by = new Map<string, MuscleVolume>()
  for (const s of sets) {
    const muscle = s.muscle || inferMuscleGroup(s.exercise_title)
    const row = by.get(muscle) || { muscle, sets: 0, volumeKg: 0 }
    row.sets++
    row.volumeKg += setVolume(s)
    by.set(muscle, row)
  }
  return [...by.values()].sort((a, b) => b.sets - a.sets)
}

// ─── Estimated 1RM progression for one movement ───────────────
export function e1rmSeries(
  sets: { exercise_title: string; weight_kg: number | null; reps: number | null; started_at: string }[],
  exerciseTitle: string,
): E1rmPoint[] {
  const byDay = new Map<string, number>()
  for (const s of sets) {
    if (s.exercise_title !== exerciseTitle) continue
    if (!s.weight_kg || !s.reps) continue
    const day = localDay(s.started_at)
    const est = epley1RM(s.weight_kg, s.reps)
    byDay.set(day, Math.max(byDay.get(day) || 0, est))
  }
  return [...byDay.entries()]
    .map(([date, e1rm]) => ({ date, e1rm }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Runs ─────────────────────────────────────────────────────
export function runTrend(runs: Run[]): RunTrendPoint[] {
  return runs
    .slice()
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map(r => ({
      date: localDay(r.started_at),
      distanceKm: km(r.distance_m),
      paceSecPerKm: Math.round(paceSecPerKm(r.distance_m, r.moving_time_s)),
      avgHr: r.avg_hr,
    }))
}

export function weeklyDistance(runs: Run[]): { week: string; km: number }[] {
  const by = new Map<string, number>()
  for (const r of runs) {
    const d = new Date(r.started_at)
    const dow = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - dow)
    const key = localDay(d.toISOString())
    by.set(key, (by.get(key) || 0) + km(r.distance_m))
  }
  return [...by.entries()]
    .map(([week, v]) => ({ week, km: Math.round(v * 10) / 10 }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

// Rough HR zone split by time-in-run. Without per-second streams we can only
// bucket whole runs by their average HR — honest approximation, labelled as such.
export function hrZoneSplit(runs: Run[], maxHr: number): { zone: string; minutes: number }[] {
  const zones = [
    { zone: 'Z1 <60%', lo: 0, hi: 0.6 },
    { zone: 'Z2 60-70%', lo: 0.6, hi: 0.7 },
    { zone: 'Z3 70-80%', lo: 0.7, hi: 0.8 },
    { zone: 'Z4 80-90%', lo: 0.8, hi: 0.9 },
    { zone: 'Z5 90%+', lo: 0.9, hi: 99 },
  ]
  const out = zones.map(z => ({ zone: z.zone, minutes: 0 }))
  for (const r of runs) {
    if (!r.avg_hr) continue
    const frac = r.avg_hr / maxHr
    const idx = zones.findIndex(z => frac >= z.lo && frac < z.hi)
    if (idx >= 0) out[idx].minutes += Math.round(r.moving_time_s / 60)
  }
  return out
}

// ─── Monthly report ───────────────────────────────────────────
export function monthlyReport(
  monthKey: string,                       // 'YYYY-MM'
  workouts: { started_at: string; workout_sets?: SetRow[] }[],
  runs: Run[],
  sessionsPlannedPerWeek: number,
): MonthlyReport {
  const inMonth = (iso: string) => localDay(iso).startsWith(monthKey)
  const ws = workouts.filter(w => inMonth(w.started_at))
  const rs = runs.filter(r => inMonth(r.started_at))

  const allSets = ws.flatMap(w => (w.workout_sets || []) as SetRow[])
  const totalDistanceKm = rs.reduce((n, r) => n + km(r.distance_m), 0)
  const totalMovingS = rs.reduce((n, r) => n + r.moving_time_s, 0)

  const prs = computePRs(allSets)
  const bestLifts = prs
    .slice()
    .sort((a, b) => b.bestEst1RM - a.bestEst1RM)
    .slice(0, 5)
    .map(p => ({ exercise: p.exercise, e1rm: p.bestEst1RM }))

  // Adherence: sessions done vs sessions the programme asks for this month.
  const [y, m] = monthKey.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const planned = Math.round((daysInMonth / 7) * sessionsPlannedPerWeek)
  const done = ws.length + rs.length

  return {
    month: monthKey,
    lifts: ws.length,
    runs: rs.length,
    totalVolumeKg: Math.round(totalVolume(allSets)),
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    totalSets: allSets.length,
    prCount: prs.length,
    adherencePct: planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0,
    avgRunPaceSecPerKm: totalDistanceKm > 0 ? Math.round(totalMovingS / totalDistanceKm) : null,
    bestLifts,
  }
}
