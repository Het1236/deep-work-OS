import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stravaConfigured } from '@/lib/fitness/strava'

// Lets the client know whether Strava is usable *before* it sends the user off
// to an OAuth round-trip that would dead-end on a JSON error page.
export async function GET() {
  const configured = stravaConfigured()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ configured, connected: false, signedIn: false })

  const { data } = await supabase
    .from('strava_accounts')
    .select('athlete_id, last_synced_at')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    configured,
    connected: !!data,
    signedIn: true,
    lastSyncedAt: data?.last_synced_at ?? null,
  })
}
