import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, stravaConfigured } from '@/lib/fitness/strava'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin
  const back = (msg: string) => NextResponse.redirect(`${origin}/fitness?strava=${encodeURIComponent(msg)}`)

  if (!stravaConfigured()) return back('not_configured')

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (url.searchParams.get('error') || !code) return back('denied')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // The signed-in user must match the id we put in `state` — otherwise the
  // callback could be replayed to attach someone else's Strava account.
  if (!user || !state || state !== user.id) return back('auth_mismatch')

  try {
    const tokens = await exchangeCode(code)
    const { error } = await supabase.from('strava_accounts').upsert({
      user_id: user.id,
      athlete_id: tokens.athlete_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
    })
    if (error) throw error
    return back('connected')
  } catch {
    return back('failed')
  }
}
