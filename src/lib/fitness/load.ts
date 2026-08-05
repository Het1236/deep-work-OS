// Training load, zone distribution and aerobic decoupling. Pure functions — no
// I/O, no framework. These are the numbers the coach's decisions rest on, so
// they are deliberately separated from anything that fetches or renders.
//
// Every function that can produce a misleading answer on thin data returns an
// explicit "insufficient" state instead of a plausible number. A spurious
// correlation presented confidently is worse than no answer.

import type {
  HrZones, RunStream, ZoneSeconds, LoadPoint, AcwrPoint, Decoupling,
} from '@/lib/types'

// ─── Zones ────────────────────────────────────────────────────
export function zoneOf(hr: number, z: HrZones): 1 | 2 | 3 | 4 | 5 {
  if (hr <= z.z1_max) return 1
  if (hr <= z.z2_max) return 2
  if (hr <= z.z3_max) return 3
  if (hr <= z.z4_max) return 4
  return 5
}

// Seconds in each zone. Assumes ~1 Hz sampling, which is what Strava returns;
// where `time_s` is present we use real deltas so gaps don't inflate a zone.
export function zoneSeconds(stream: Pick<RunStream, 'heartrate' | 'time_s'>, z: HrZones): ZoneSeconds {
  const out: ZoneSeconds = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }
  const hr = stream.heartrate || []
  const t = stream.time_s || []
  for (let i = 0; i < hr.length; i++) {
    if (!hr[i]) continue
    const dt = i > 0 && t.length === hr.length ? Math.max(0, Math.min(30, t[i] - t[i - 1])) : 1
    const key = `z${zoneOf(hr[i], z)}` as keyof ZoneSeconds
    out[key] += dt
  }
  return out
}

export function totalZoneSeconds(z: ZoneSeconds): number {
  return z.z1 + z.z2 + z.z3 + z.z4 + z.z5
}

// Share of time at genuinely easy intensity (Z1+Z2). The 80/20 target is the
// whole point of the base-building block.
export function easyShare(z: ZoneSeconds): number {
  const total = totalZoneSeconds(z)
  if (total === 0) return 0
  return Math.round(((z.z1 + z.z2) / total) * 1000) / 10
}

export function sumZones(list: ZoneSeconds[]): ZoneSeconds {
  return list.reduce((a, b) => ({
    z1: a.z1 + b.z1, z2: a.z2 + b.z2, z3: a.z3 + b.z3, z4: a.z4 + b.z4, z5: a.z5 + b.z5,
  }), { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 })
}

// ─── Run load: Banister TRIMP ─────────────────────────────────
// Weights time by intensity exponentially, so ten minutes hard counts far more
// than ten minutes easy — which is exactly the property a load model needs.
// Coefficients are the male formulation; this app has one user, male.
export function trimpFromStream(
  stream: Pick<RunStream, 'heartrate' | 'time_s'>, z: HrZones,
): number {
  const hr = stream.heartrate || []
  const t = stream.time_s || []
  if (hr.length === 0) return 0
  const range = Math.max(1, z.max_hr - z.resting_hr)
  let trimp = 0
  for (let i = 0; i < hr.length; i++) {
    if (!hr[i]) continue
    const dt = i > 0 && t.length === hr.length ? Math.max(0, Math.min(30, t[i] - t[i - 1])) : 1
    const hrr = Math.max(0, Math.min(1, (hr[i] - z.resting_hr) / range))
    trimp += (dt / 60) * hrr * 0.64 * Math.exp(1.92 * hrr)
  }
  return Math.round(trimp * 10) / 10
}

// Fallback when a run has no heart rate — five of six of this user's runs.
// Deliberately crude: it should never look as trustworthy as the real thing.
export function trimpFallback(movingTimeS: number, runType: string | null): number {
  const factor = runType === 'interval' ? 2.4
    : runType === 'tempo' ? 1.8
    : runType === 'long' ? 1.15
    : 1.0
  return Math.round((movingTimeS / 60) * factor * 10) / 10
}

// ─── Lift load: session RPE × duration ────────────────────────
// The established method for resistance training, and it needs no heart rate.
export function sessionRpeLoad(rpe: number | null, durationSeconds: number | null): number {
  if (!rpe || !durationSeconds) return 0
  return Math.round((durationSeconds / 60) * rpe * 10) / 10
}

// ─── Aerobic decoupling ───────────────────────────────────────
// Compare speed-per-heartbeat in the first half of a run against the second.
// Under ~5% indicates a genuine aerobic base. Meaningless on intervals or short
// runs, so those are suppressed with a stated reason rather than reported.
export function decoupling(
  runId: string, date: string,
  stream: Pick<RunStream, 'heartrate' | 'velocity_ms' | 'time_s'>,
  runType: string | null,
): Decoupling {
  const hr = stream.heartrate || []
  const v = stream.velocity_ms || []

  if (hr.length === 0 || v.length === 0)
    return { runId, date, percent: 0, valid: false, reason: 'No heart-rate data' }
  if (runType === 'interval' || runType === 'strides')
    return { runId, date, percent: 0, valid: false, reason: 'Not meaningful on interval sessions' }

  const n = Math.min(hr.length, v.length)
  if (n < 1800)
    return { runId, date, percent: 0, valid: false, reason: 'Run shorter than 30 minutes' }

  const half = Math.floor(n / 2)
  const ef = (from: number, to: number) => {
    let sv = 0, sh = 0, c = 0
    for (let i = from; i < to; i++) {
      if (!hr[i] || !v[i]) continue
      sv += v[i]; sh += hr[i]; c++
    }
    if (c === 0 || sh === 0) return 0
    return (sv / c) / (sh / c)
  }

  const first = ef(0, half)
  const second = ef(half, n)
  if (first === 0 || second === 0)
    return { runId, date, percent: 0, valid: false, reason: 'Not enough paired samples' }

  return {
    runId, date,
    percent: Math.round(((first - second) / first) * 1000) / 10,
    valid: true,
  }
}

// ─── Daily load series ────────────────────────────────────────
export type LoadInputRun = {
  started_at: string
  moving_time_s: number
  run_type: string | null
  trimp?: number | null
}
export type LoadInputLift = {
  started_at: string
  duration_seconds: number | null
  perceived_effort: number | null
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dailyLoads(
  runs: LoadInputRun[], lifts: LoadInputLift[], days: number, today = new Date(),
): LoadPoint[] {
  const map = new Map<string, LoadPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const k = dayKey(d.toISOString())
    map.set(k, { date: k, runLoad: 0, liftLoad: 0, total: 0 })
  }
  for (const r of runs) {
    const row = map.get(dayKey(r.started_at))
    if (!row) continue
    row.runLoad += r.trimp ?? trimpFallback(r.moving_time_s, r.run_type)
  }
  for (const l of lifts) {
    const row = map.get(dayKey(l.started_at))
    if (!row) continue
    row.liftLoad += sessionRpeLoad(l.perceived_effort, l.duration_seconds)
  }
  for (const row of map.values()) {
    row.runLoad = Math.round(row.runLoad * 10) / 10
    row.liftLoad = Math.round(row.liftLoad * 10) / 10
    row.total = Math.round((row.runLoad + row.liftLoad) * 10) / 10
  }
  return [...map.values()]
}

// ─── ACWR ─────────────────────────────────────────────────────
// Exponentially weighted 7-day acute over 28-day chronic. The single best
// established early warning for injury risk in concurrent training.
//
// Reports 'insufficient' until there are 28 days of history — before that the
// chronic term is meaningless and the ratio would swing wildly on a single
// session, which is precisely when a user would over-trust it.
export function acwr(loads: LoadPoint[]): AcwrPoint[] {
  const out: AcwrPoint[] = []
  const aA = 2 / (7 + 1)
  const aC = 2 / (28 + 1)
  let acute = 0, chronic = 0

  loads.forEach((p, i) => {
    acute = i === 0 ? p.total : p.total * aA + acute * (1 - aA)
    chronic = i === 0 ? p.total : p.total * aC + chronic * (1 - aC)
    const ratio = chronic > 0 ? acute / chronic : 0

    let band: AcwrPoint['band']
    if (i < 28) band = 'insufficient'
    else if (ratio < 0.8) band = 'detraining'
    else if (ratio <= 1.3) band = 'optimal'
    else if (ratio <= 1.5) band = 'caution'
    else band = 'high_risk'

    out.push({
      date: p.date,
      acute: Math.round(acute * 10) / 10,
      chronic: Math.round(chronic * 10) / 10,
      ratio: Math.round(ratio * 100) / 100,
      band,
    })
  })
  return out
}

// ─── Resting HR baseline ──────────────────────────────────────
// An RHR elevated 5+ bpm over a rolling baseline is one of the better-supported
// early signals of overreaching or oncoming illness.
export function rhrFlag(
  history: { date: string; resting_hr: number | null }[],
): { baseline: number | null; latest: number | null; elevated: boolean; delta: number | null } {
  const vals = history.filter(h => h.resting_hr != null).slice(-14)
  if (vals.length < 5) return { baseline: null, latest: null, elevated: false, delta: null }
  const prior = vals.slice(0, -1)
  const baseline = prior.reduce((n, h) => n + (h.resting_hr as number), 0) / prior.length
  const latest = vals[vals.length - 1].resting_hr as number
  const delta = Math.round((latest - baseline) * 10) / 10
  return {
    baseline: Math.round(baseline * 10) / 10,
    latest, delta,
    elevated: delta >= 5,
  }
}

// ─── Weekly running volume, for the 10% rule ──────────────────
export function weeklyKm(runs: { started_at: string; distance_m: number }[]): { week: string; km: number }[] {
  const by = new Map<string, number>()
  for (const r of runs) {
    const d = new Date(r.started_at)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const k = dayKey(d.toISOString())
    by.set(k, (by.get(k) || 0) + r.distance_m / 1000)
  }
  return [...by.entries()]
    .map(([week, km]) => ({ week, km: Math.round(km * 10) / 10 }))
    .sort((a, b) => a.week.localeCompare(b.week))
}
