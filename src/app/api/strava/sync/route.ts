import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchActivities, refreshTokens, isRun, classifyRun, stravaConfigured } from '@/lib/fitness/strava'

export async function POST() {
  if (!stravaConfigured()) {
    return NextResponse.json({ error: 'Strava is not configured.' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: account } = await supabase
    .from('strava_accounts')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: 'Strava not connected' }, { status: 400 })

  let accessToken: string = account.access_token
  try {
    // Refresh a minute early so a token can't expire mid-request.
    if (new Date(account.expires_at).getTime() - 60_000 < Date.now()) {
      const fresh = await refreshTokens(account.refresh_token)
      accessToken = fresh.access_token
      await supabase.from('strava_accounts').update({
        access_token: fresh.access_token,
        refresh_token: fresh.refresh_token,
        expires_at: fresh.expires_at,
      }).eq('user_id', user.id)
    }

    // First sync pulls 180 days; later syncs pull from a day before last sync
    // so an activity edited just after a sync is still picked up.
    const since = account.last_synced_at
      ? new Date(new Date(account.last_synced_at).getTime() - 86_400_000)
      : new Date(Date.now() - 180 * 86_400_000)

    const activities = await fetchActivities(accessToken, Math.floor(since.getTime() / 1000))
    const runs = activities.filter(isRun)

    // Upsert reports every row it touched, so counting its result would claim
    // "imported 6" on every re-sync. Diff against what we already hold instead.
    const ids = runs.map(a => String(a.id))
    const { data: existing } = await supabase
      .from('runs')
      .select('external_id')
      .eq('user_id', user.id)
      .in('external_id', ids.length > 0 ? ids : ['__none__'])
    const known = new Set((existing || []).map(r => r.external_id))

    let imported = 0
    if (runs.length > 0) {
      const rows = runs.map(a => ({
        user_id: user.id,
        source: 'strava' as const,
        external_id: String(a.id),
        started_at: new Date(a.start_date).toISOString(),
        name: a.name,
        distance_m: Math.round(a.distance),
        moving_time_s: Math.round(a.moving_time),
        elapsed_time_s: Math.round(a.elapsed_time),
        avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
        max_hr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
        elevation_gain_m: Math.round(a.total_elevation_gain || 0),
        run_type: classifyRun(a.distance, a.moving_time),
      }))
      const { error } = await supabase
        .from('runs')
        .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: false })
      if (error) throw error
      imported = rows.filter(r => !known.has(r.external_id)).length
    }

    await supabase.from('strava_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', user.id)

    return NextResponse.json({ ok: true, found: runs.length, imported })
  } catch (err) {
    // Supabase errors are plain objects, not Error instances — reading only
    // `err.message` on an Error swallowed the actual cause here once already.
    const e = err as { message?: string; code?: string; details?: string; hint?: string }
    const message = e?.message || (err instanceof Error ? err.message : 'Sync failed')
    console.error('[strava/sync]', { message, code: e?.code, details: e?.details, hint: e?.hint })
    return NextResponse.json(
      { error: message, code: e?.code ?? null, details: e?.details ?? null, hint: e?.hint ?? null },
      { status: 502 },
    )
  }
}
