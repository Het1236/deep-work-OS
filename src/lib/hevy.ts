// Hevy CSV export parsing + workout stats. Pure functions, client-side, no deps.
// Hevy free tier: app Settings → Export & Import Data → Export Workout Data (CSV).

export type HevySet = {
  exercise_title: string
  set_index: number
  set_type: string | null
  weight_kg: number | null
  reps: number | null
  distance_km: number | null
  duration_seconds: number | null
  rpe: number | null
}

export type HevyWorkout = {
  title: string
  startedAt: string   // ISO
  endedAt: string | null
  sets: HevySet[]
}

// ── Minimal RFC-4180 CSV parser (quoted fields, embedded commas/quotes/newlines) ──
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

// Tolerant date parsing: ISO ("2024-07-13 17:04:00") or Hevy's "13 Jul 2024, 17:04".
export function parseHevyDate(s: string): string | null {
  if (!s?.trim()) return null
  const t = s.trim()
  const direct = new Date(t)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString()
  const m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})$/)
  if (m) {
    const d = new Date(`${m[2]} ${m[1]}, ${m[3]} ${m[4]}:${m[5]}`)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

function num(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

// Parse a full Hevy export into workouts grouped by (title, start_time).
export function parseHevyCsv(text: string): HevyWorkout[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const header = rows[0].map(h => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const iTitle = col('title'), iStart = col('start_time'), iEnd = col('end_time')
  const iEx = col('exercise_title'), iSetIdx = col('set_index'), iSetType = col('set_type')
  const iWeight = col('weight_kg'), iReps = col('reps'), iDist = col('distance_km')
  const iDur = col('duration_seconds'), iRpe = col('rpe')
  if (iTitle < 0 || iStart < 0 || iEx < 0) return [] // not a Hevy export

  const byKey = new Map<string, HevyWorkout>()
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const startedAt = parseHevyDate(row[iStart])
    if (!startedAt) continue
    const title = (row[iTitle] || 'Workout').trim()
    const key = `${title}|${startedAt}`
    let w = byKey.get(key)
    if (!w) {
      w = { title, startedAt, endedAt: iEnd >= 0 ? parseHevyDate(row[iEnd]) : null, sets: [] }
      byKey.set(key, w)
    }
    w.sets.push({
      exercise_title: (row[iEx] || 'Unknown').trim(),
      set_index: num(row[iSetIdx]) ?? w.sets.length,
      set_type: iSetType >= 0 && row[iSetType]?.trim() ? row[iSetType].trim() : null,
      weight_kg: iWeight >= 0 ? num(row[iWeight]) : null,
      reps: iReps >= 0 ? (num(row[iReps]) != null ? Math.round(num(row[iReps])!) : null) : null,
      distance_km: iDist >= 0 ? num(row[iDist]) : null,
      duration_seconds: iDur >= 0 ? (num(row[iDur]) != null ? Math.round(num(row[iDur])!) : null) : null,
      rpe: iRpe >= 0 ? num(row[iRpe]) : null,
    })
  }
  return [...byKey.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

// ── Stats ──
export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10
}

export type SetLike = { exercise_title: string; weight_kg: number | null; reps: number | null }

export type ExercisePR = {
  exercise: string
  bestWeight: number
  bestEst1RM: number
  bestVolumeSet: number   // weight × reps for the single biggest set
  totalSets: number
}

export function computePRs(sets: SetLike[]): ExercisePR[] {
  const byEx = new Map<string, ExercisePR>()
  for (const s of sets) {
    if (!s.weight_kg || !s.reps) continue
    const pr = byEx.get(s.exercise_title) || {
      exercise: s.exercise_title, bestWeight: 0, bestEst1RM: 0, bestVolumeSet: 0, totalSets: 0,
    }
    pr.totalSets++
    pr.bestWeight = Math.max(pr.bestWeight, s.weight_kg)
    pr.bestEst1RM = Math.max(pr.bestEst1RM, epley1RM(s.weight_kg, s.reps))
    pr.bestVolumeSet = Math.max(pr.bestVolumeSet, s.weight_kg * s.reps)
    byEx.set(s.exercise_title, pr)
  }
  return [...byEx.values()].sort((a, b) => b.totalSets - a.totalSets)
}

// ISO week key like "2026-W27".
function isoWeek(dateIso: string): string {
  const d = new Date(dateIso)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export type WeekVolume = { week: string; volumeKg: number; sets: number }

export function weeklyVolume(items: { started_at: string; weight_kg: number | null; reps: number | null }[]): WeekVolume[] {
  const byWeek = new Map<string, WeekVolume>()
  for (const s of items) {
    const wk = isoWeek(s.started_at)
    const v = byWeek.get(wk) || { week: wk, volumeKg: 0, sets: 0 }
    v.sets++
    if (s.weight_kg && s.reps) v.volumeKg += s.weight_kg * s.reps
    byWeek.set(wk, v)
  }
  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week))
}

// Hevy CSV has no muscle column — honest keyword inference.
const MUSCLE_RULES: [RegExp, string][] = [
  [/bench|chest|pec|fly|push[- ]?up|dip/i, 'Chest'],
  [/squat|leg|lunge|calf|quad|hamstring|glute|hip thrust|rdl|deadlift/i, 'Legs'],
  [/row|pull[- ]?up|pull[- ]?down|lat|back|chin[- ]?up|shrug/i, 'Back'],
  [/shoulder|overhead|ohp|lateral raise|front raise|rear delt|face pull|arnold/i, 'Shoulders'],
  [/curl|bicep|tricep|skull|pushdown|extension.*tricep|hammer/i, 'Arms'],
  [/crunch|plank|ab|core|russian|leg raise|sit[- ]?up/i, 'Core'],
  [/run|treadmill|cycle|bike|row(ing)? machine|elliptical|walk|cardio|stair/i, 'Cardio'],
]

export function inferMuscleGroup(exerciseTitle: string): string {
  for (const [re, group] of MUSCLE_RULES) {
    if (re.test(exerciseTitle)) return group
  }
  return 'Other'
}
