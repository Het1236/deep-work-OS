import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  ensureFreshToken, fetchStreams, fetchLaps, fetchDetail,
  stravaConfigured, StravaRateLimit,
} from '@/lib/fitness/strava'

// Backfills per-second streams for runs that don't have them yet.
//
// Deliberately NOT a blind loop over all history: each run costs up to three
// requests and Strava's limits are not generous. We take the newest runs
// missing streams, cap the batch, and report what is left so the caller can
// come back rather than getting rate-limited mid-run.

const MAX_RUNS_PER_CALL = 10        // ≤30 requests per invocation

export async function POST(req: Request) {
  if (!stravaConfigured()) {
    return NextResponse.json({ error: 'Strava is not configured.' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const limit = Math.min(Number(body.limit) || MAX_RUNS_PER_CALL, MAX_RUNS_PER_CALL)

  const { data: account } = await supabase
    .from('strava_accounts').select('*').eq('user_id', user.id).maybeSingle()
  if (!account) return NextResponse.json({ error: 'Strava not connected' }, { status: 400 })

  const { data: pending, count } = await supabase
    .from('runs')
    .select('id, external_id, run_type', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('source', 'strava')
    .eq('has_streams', false)
    .not('external_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, fetched: 0, remaining: 0, message: 'All runs already have streams.' })
  }

  let fetched = 0, withHr = 0, skipped = 0
  const errors: string[] = []

  try {
    const accessToken = await ensureFreshToken(account, async t => {
      await supabase.from('strava_accounts').update({
        access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at,
      }).eq('user_id', user.id)
    })

    for (const run of pending) {
      const id = run.external_id as string
      const streams = await fetchStreams(accessToken, id)
      if (!streams) { skipped++; continue }

      const hr = streams.heartrate?.data ?? []
      if (hr.length > 0) withHr++

      const { error: sErr } = await supabase.from('run_streams').upsert({
        run_id: run.id,
        user_id: user.id,
        time_s: streams.time?.data ?? [],
        heartrate: hr,
        velocity_ms: streams.velocity_smooth?.data ?? [],
        cadence: streams.cadence?.data ?? [],
        altitude: streams.altitude?.data ?? [],
        distance_m: streams.distance?.data ?? [],
        fetched_at: new Date().toISOString(),
      })
      if (sErr) { errors.push(`${id}: ${sErr.message}`); continue }

      // Laps matter for interval sessions — each 400 m repeat individually.
      const laps = await fetchLaps(accessToken, id)
      if (laps && laps.length > 1) {
        await supabase.from('run_laps').delete().eq('run_id', run.id)
        await supabase.from('run_laps').insert(laps.map(l => ({
          run_id: run.id,
          user_id: user.id,
          lap_index: l.lap_index,
          distance_m: l.distance,
          moving_time_s: l.moving_time,
          avg_hr: l.average_heartrate ? Math.round(l.average_heartrate) : null,
          max_hr: l.max_heartrate ? Math.round(l.max_heartrate) : null,
          avg_speed_ms: l.average_speed ?? null,
        })))
      }

      const detail = await fetchDetail(accessToken, id)
      await supabase.from('runs').update({
        has_streams: true,
        splits_metric: detail?.splits_metric ?? null,
        suffer_score: detail?.suffer_score ?? null,
        avg_cadence: detail?.average_cadence ?? null,
        calories: detail?.calories ?? null,
      }).eq('id', run.id)

      fetched++
    }
  } catch (err) {
    if (err instanceof StravaRateLimit) {
      return NextResponse.json(
        { error: err.message, fetched, remaining: Math.max(0, (count ?? 0) - fetched) },
        { status: 429 })
    }
    const e = err as { message?: string }
    return NextResponse.json({ error: e?.message || 'Stream fetch failed', fetched }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    fetched,
    withHeartRate: withHr,
    skipped,
    remaining: Math.max(0, (count ?? 0) - fetched),
    errors: errors.length > 0 ? errors : undefined,
  })
}
