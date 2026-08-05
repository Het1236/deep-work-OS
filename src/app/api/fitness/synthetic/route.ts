import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Synthetic training history, so the analytics and coach can be exercised
// before enough real data exists. Every row is flagged is_synthetic = true and
// sourced 'synthetic', so it can never be mistaken for real training history
// and DELETE removes it completely.
//
// The generated athlete deliberately reproduces this user's actual problem —
// easy runs drifting into Zone 3 — so the coach's "running too hard" rail can
// be seen firing rather than taken on trust.

const WEEKS = 12
const SAMPLE_HZ = 5          // one sample every 5 s; deltas are handled downstream

type Gen = { runs: number; workouts: number; streams: number; readiness: number }

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: existing } = await supabase
    .from('runs').select('id').eq('user_id', user.id).eq('is_synthetic', true).limit(1)
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'Synthetic data already present. Delete it first.' }, { status: 409 })
  }

  const rnd = seeded(20260805)
  const out: Gen = { runs: 0, workouts: 0, streams: 0, readiness: 0 }

  const { data: days } = await supabase
    .from('program_days').select('*').eq('user_id', user.id)
  const byDow = new Map((days || []).map(d => [d.day_of_week as number, d]))

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const runRows: Record<string, unknown>[] = []
  const workoutRows: Record<string, unknown>[] = []
  const readinessRows: Record<string, unknown>[] = []
  const streamPlans: { key: string; durationS: number; avgHr: number; distanceM: number; drift: number }[] = []

  for (let d = WEEKS * 7 - 1; d >= 0; d--) {
    const date = new Date(today)
    date.setDate(date.getDate() - d)
    const dow = (date.getDay() + 6) % 7
    const weekIdx = Math.floor((WEEKS * 7 - 1 - d) / 7)
    const pd = byDow.get(dow)
    if (!pd) continue

    // Miss roughly one session in eight, so adherence isn't a flat 100%.
    if (rnd() < 0.12) continue

    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

    readinessRows.push({
      user_id: user.id,
      date: ymd,
      readiness: 2 + Math.round(rnd() * 3),
      sleep_hours: Math.round((6 + rnd() * 2) * 10) / 10,
      resting_hr: 56 + Math.round(rnd() * 8) + (weekIdx > 8 ? 2 : 0),
    })
    out.readiness++

    if (pd.day_type === 'run') {
      // Distance grows ~8%/week from a small base.
      const base = pd.run_type === 'long' ? 5 : pd.run_type === 'strides' ? 3 : 4
      const km = Math.round((base * Math.pow(1.08, weekIdx) + rnd() * 0.6) * 10) / 10
      const paceSec = 555 - weekIdx * 4 + rnd() * 30        // ~9:15/km improving slowly
      const durationS = Math.round(km * paceSec)

      // Early weeks run too hard (Z3); improves over the block but never fully.
      const avgHr = Math.round(158 - weekIdx * 1.1 + rnd() * 6)
      const drift = Math.max(1.5, 9 - weekIdx * 0.5)        // decoupling % improving

      const startedAt = new Date(date)
      startedAt.setHours(5, 15, 0, 0)
      const key = `syn-${ymd}`

      runRows.push({
        user_id: user.id,
        source: 'synthetic',
        external_id: key,
        is_synthetic: true,
        started_at: startedAt.toISOString(),
        name: `${pd.title} (test data)`,
        distance_m: Math.round(km * 1000),
        moving_time_s: durationS,
        elapsed_time_s: durationS + 60,
        avg_hr: avgHr,
        max_hr: avgHr + 12,
        run_type: pd.run_type,
        program_day_id: pd.id,
        has_streams: true,
      })
      streamPlans.push({ key, durationS, avgHr, distanceM: km * 1000, drift })
      out.runs++
    }

    if (pd.day_type === 'lift') {
      const startedAt = new Date(date)
      const [h, m] = String(pd.scheduled_time || '15:00').split(':').map(Number)
      startedAt.setHours(h, m || 0, 0, 0)
      const durationS = 60 * (70 + Math.round(rnd() * 20))
      workoutRows.push({
        user_id: user.id,
        title: `${pd.title} (test data)`,
        started_at: startedAt.toISOString(),
        ended_at: new Date(startedAt.getTime() + durationS * 1000).toISOString(),
        source: 'live',
        is_synthetic: true,
        program_day_id: pd.id,
        duration_seconds: durationS,
        perceived_effort: 6 + Math.round(rnd() * 3),
      })
      out.workouts++
    }
  }

  if (runRows.length > 0) {
    const { error } = await supabase.from('runs').insert(runRows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (workoutRows.length > 0) {
    const { error } = await supabase.from('workouts').insert(workoutRows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (readinessRows.length > 0) {
    const { error } = await supabase.from('daily_readiness').upsert(readinessRows, { onConflict: 'user_id,date' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Streams, generated per run with realistic warm-up, steady state and drift.
  const { data: inserted } = await supabase
    .from('runs').select('id, external_id, moving_time_s')
    .eq('user_id', user.id).eq('is_synthetic', true)

  const streamRows: Record<string, unknown>[] = []
  for (const run of inserted || []) {
    const plan = streamPlans.find(p => p.key === run.external_id)
    if (!plan) continue
    const n = Math.floor(plan.durationS / SAMPLE_HZ)
    const time_s: number[] = [], heartrate: number[] = [],
          velocity_ms: number[] = [], cadence: number[] = [], distance_m: number[] = []
    const baseV = plan.distanceM / plan.durationS
    for (let i = 0; i < n; i++) {
      const t = i * SAMPLE_HZ
      const frac = i / n
      // Warm-up ramp over the first 5 minutes, then drift upward across the run.
      const warm = Math.min(1, t / 300)
      const hr = plan.avgHr * (0.82 + 0.18 * warm) * (1 + (plan.drift / 100) * frac) + (rnd() - 0.5) * 4
      time_s.push(t)
      heartrate.push(Math.round(hr))
      velocity_ms.push(Math.round((baseV * (0.9 + 0.2 * warm) + (rnd() - 0.5) * 0.15) * 100) / 100)
      cadence.push(80 + Math.round(rnd() * 6))
      distance_m.push(Math.round(baseV * t))
    }
    streamRows.push({
      run_id: run.id, user_id: user.id,
      time_s, heartrate, velocity_ms, cadence, distance_m, altitude: [],
    })
    out.streams++
  }
  for (let i = 0; i < streamRows.length; i += 20) {
    const { error } = await supabase.from('run_streams').upsert(streamRows.slice(i, i + 20))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, generated: out })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  // run_streams cascades from runs; readiness is only ever synthetic in the
  // window the generator wrote, so it is removed by date range below.
  const { data: synthRuns } = await supabase
    .from('runs').select('started_at').eq('user_id', user.id).eq('is_synthetic', true)
  const dates = (synthRuns || []).map(r => r.started_at).sort()

  const { error: rErr } = await supabase
    .from('runs').delete().eq('user_id', user.id).eq('is_synthetic', true)
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const { error: wErr } = await supabase
    .from('workouts').delete().eq('user_id', user.id).eq('is_synthetic', true)
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })

  if (dates.length > 0) {
    await supabase.from('daily_readiness').delete()
      .eq('user_id', user.id)
      .gte('date', dates[0].slice(0, 10))
      .lte('date', dates[dates.length - 1].slice(0, 10))
  }

  return NextResponse.json({ ok: true })
}
