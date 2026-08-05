import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prescribe, weeksSinceDeload } from '@/lib/fitness/coach'
import {
  zoneSeconds, sumZones, trimpFromStream, dailyLoads, acwr, rhrFlag, weeklyKm, decoupling,
} from '@/lib/fitness/load'
import type { HrZones, RunStream, ProgramDay } from '@/lib/types'

// Generates (or returns) today's proposed session. Proposal only — nothing in
// the programme changes until the user accepts it in the UI.

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const date: string = body.date || ymd(new Date())
  const force: boolean = !!body.force
  const dow = (new Date(`${date}T12:00:00`).getDay() + 6) % 7

  if (!force) {
    const { data: existing } = await supabase
      .from('prescriptions').select('*').eq('user_id', user.id).eq('date', date).maybeSingle()
    if (existing) return NextResponse.json({ ok: true, prescription: existing, cached: true })
  }

  const since = new Date(); since.setDate(since.getDate() - 60)
  const sinceIso = since.toISOString()

  const [progRes, zonesRes, runsRes, liftsRes, readyRes] = await Promise.all([
    supabase.from('programs')
      .select('*, program_days(*, program_exercises(*, exercises(name)))')
      .eq('user_id', user.id).eq('is_active', true).maybeSingle(),
    supabase.from('hr_zones').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('runs').select('*').eq('user_id', user.id).gte('started_at', sinceIso).order('started_at'),
    supabase.from('workouts').select('started_at, duration_seconds, perceived_effort')
      .eq('user_id', user.id).gte('started_at', sinceIso),
    supabase.from('daily_readiness').select('*').eq('user_id', user.id).order('date'),
  ])

  const program = progRes.data as { start_date: string | null; program_days: ProgramDay[] } | null
  const programDay = program?.program_days?.find(d => d.day_of_week === dow) ?? null
  const zones = (zonesRes.data as HrZones) ?? null
  const runs = runsRes.data || []
  const lifts = liftsRes.data || []
  const readiness = readyRes.data || []

  // Streams → zone distribution, TRIMP and decoupling.
  let zones7d = null
  let recentDecouplingPct: number | null = null
  const runTrimp = new Map<string, number>()

  if (zones && runs.length > 0) {
    const ids = runs.map(r => r.id)
    const { data: streams } = await supabase
      .from('run_streams').select('*').eq('user_id', user.id).in('run_id', ids)
    const byRun = new Map((streams || []).map(s => [(s as RunStream).run_id, s as RunStream]))

    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const recent: ReturnType<typeof zoneSeconds>[] = []
    for (const r of runs) {
      const s = byRun.get(r.id)
      if (!s) continue
      runTrimp.set(r.id, trimpFromStream(s, zones))
      if (new Date(r.started_at) >= weekAgo) recent.push(zoneSeconds(s, zones))
    }
    if (recent.length > 0) zones7d = sumZones(recent)

    // Most recent run with a valid decoupling reading.
    for (let i = runs.length - 1; i >= 0; i--) {
      const s = byRun.get(runs[i].id)
      if (!s) continue
      const d = decoupling(runs[i].id, runs[i].started_at, s, runs[i].run_type)
      if (d.valid) { recentDecouplingPct = d.percent; break }
    }
  }

  const loads = dailyLoads(
    runs.map(r => ({
      started_at: r.started_at, moving_time_s: r.moving_time_s,
      run_type: r.run_type, trimp: runTrimp.get(r.id) ?? null,
    })),
    lifts.map(l => ({
      started_at: l.started_at, duration_seconds: l.duration_seconds,
      perceived_effort: l.perceived_effort,
    })),
    60,
  )
  const acwrSeries = acwr(loads)

  const result = prescribe({
    date,
    programDay,
    acwr: acwrSeries.length > 0 ? acwrSeries[acwrSeries.length - 1] : null,
    zones7d,
    readiness: readiness.find(r => r.date === date) ?? readiness[readiness.length - 1] ?? null,
    rhr: rhrFlag(readiness.map(r => ({ date: r.date, resting_hr: r.resting_hr }))),
    weeklyKm: weeklyKm(runs.map(r => ({ started_at: r.started_at, distance_m: r.distance_m }))),
    weeksSinceDeload: weeksSinceDeload(program?.start_date ?? null),
    recentDecouplingPct,
  })

  const { data: saved, error } = await supabase
    .from('prescriptions')
    .upsert({
      user_id: user.id,
      date,
      program_day_id: programDay?.id ?? null,
      status: 'proposed',
      session: result.session,
      reasoning: result.reasoning,
      inputs_used: result.inputsUsed,
      flags: result.flags,
    }, { onConflict: 'user_id,date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, prescription: saved })
}
