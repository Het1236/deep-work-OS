import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authorizeUrl, stravaConfigured } from '@/lib/fitness/strava'

export async function GET(req: Request) {
  if (!stravaConfigured()) {
    return NextResponse.json(
      { error: 'Strava is not configured. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET.' },
      { status: 503 },
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
  const redirectUri = `${origin}/api/strava/callback`

  // `state` carries the user id so the callback can attribute the tokens.
  return NextResponse.redirect(authorizeUrl(redirectUri, user.id))
}
