// Strava OAuth + activity sync. SERVER ONLY — this module reads and writes
// access/refresh tokens and must never be imported into a client component.
//
// Setup: create an app at https://www.strava.com/settings/api, then set
//   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, NEXT_PUBLIC_SITE_URL
// Authorization callback domain in Strava's settings must match your host.

import type { RunType } from '@/lib/types'

const STRAVA_AUTH = 'https://www.strava.com/oauth/authorize'
const STRAVA_TOKEN = 'https://www.strava.com/oauth/token'
const STRAVA_API = 'https://www.strava.com/api/v3'

export type StravaTokens = {
  access_token: string
  refresh_token: string
  expires_at: string
  athlete_id: string | null
}

export function stravaConfigured(): boolean {
  return !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET)
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  })
  return `${STRAVA_AUTH}?${p.toString()}`
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_at: number          // unix seconds
  athlete?: { id: number }
}

export async function exchangeCode(code: string): Promise<StravaTokens> {
  const res = await fetch(STRAVA_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Strava token exchange failed (${res.status})`)
  const j = (await res.json()) as TokenResponse
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: new Date(j.expires_at * 1000).toISOString(),
    athlete_id: j.athlete?.id ? String(j.athlete.id) : null,
  }
}

export async function refreshTokens(refreshToken: string): Promise<StravaTokens> {
  const res = await fetch(STRAVA_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh failed (${res.status})`)
  const j = (await res.json()) as TokenResponse
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: new Date(j.expires_at * 1000).toISOString(),
    athlete_id: null,
  }
}

export type StravaActivity = {
  id: number
  name: string
  type: string
  sport_type: string
  start_date: string
  distance: number             // metres
  moving_time: number          // seconds
  elapsed_time: number
  total_elevation_gain: number
  average_heartrate?: number
  max_heartrate?: number
}

export async function fetchActivities(accessToken: string, afterUnix: number): Promise<StravaActivity[]> {
  const out: StravaActivity[] = []
  // Strava pages at 200 max; three pages covers far more than a student runs.
  for (let page = 1; page <= 3; page++) {
    const p = new URLSearchParams({ after: String(afterUnix), per_page: '100', page: String(page) })
    const res = await fetch(`${STRAVA_API}/athlete/activities?${p}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.status === 429) throw new Error('Strava rate limit reached — try again in 15 minutes.')
    if (!res.ok) throw new Error(`Strava activities fetch failed (${res.status})`)
    const batch = (await res.json()) as StravaActivity[]
    out.push(...batch)
    if (batch.length < 100) break
  }
  return out
}

export function isRun(a: StravaActivity): boolean {
  const t = (a.sport_type || a.type || '').toLowerCase()
  return t.includes('run')
}

// Classify by distance and pace so the run lands on the right programme slot.
// Deliberately coarse — the user can correct it, and a wrong guess costs nothing.
export function classifyRun(distanceM: number, movingTimeS: number): RunType {
  const km = distanceM / 1000
  if (km <= 0 || movingTimeS <= 0) return 'easy'
  const paceSecPerKm = movingTimeS / km
  if (km >= 8) return 'long'
  if (paceSecPerKm < 330) return 'interval'   // faster than 5:30/km
  if (paceSecPerKm < 420) return 'tempo'      // faster than 7:00/km
  if (km <= 3) return 'recovery'
  return 'easy'
}
