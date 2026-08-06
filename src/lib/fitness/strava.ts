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

// Refresh a minute early so a token can't expire mid-request. Kept free of any
// database dependency — the caller supplies the row and a way to persist.
export async function ensureFreshToken(
  account: { access_token: string; refresh_token: string; expires_at: string },
  save: (t: StravaTokens) => Promise<void>,
): Promise<string> {
  if (new Date(account.expires_at).getTime() - 60_000 >= Date.now()) return account.access_token
  const fresh = await refreshTokens(account.refresh_token)
  await save(fresh)
  return fresh.access_token
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

// ─── Per-second streams ───────────────────────────────────────
// The single most valuable endpoint: everything the load model needs that a
// summary average cannot give — real time-in-zone, HR drift, decoupling.
export type StravaStreams = {
  time?: { data: number[] }
  heartrate?: { data: number[] }
  velocity_smooth?: { data: number[] }
  cadence?: { data: number[] }
  altitude?: { data: number[] }
  distance?: { data: number[] }
}

const STREAM_KEYS = 'time,heartrate,velocity_smooth,cadence,altitude,distance'

export class StravaRateLimit extends Error {
  constructor() { super('Strava rate limit reached — wait 15 minutes and sync again.') }
}

async function get<T>(url: string, accessToken: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (res.status === 429) throw new StravaRateLimit()
  if (res.status === 404) return null            // activity deleted or not visible
  if (!res.ok) throw new Error(`Strava request failed (${res.status}) for ${url}`)
  return (await res.json()) as T
}

export async function fetchStreams(accessToken: string, activityId: string): Promise<StravaStreams | null> {
  return get<StravaStreams>(
    `${STRAVA_API}/activities/${activityId}/streams?keys=${STREAM_KEYS}&key_by_type=true`,
    accessToken)
}

export type StravaLap = {
  lap_index: number
  distance: number
  moving_time: number
  average_heartrate?: number
  max_heartrate?: number
  average_speed?: number
}

export async function fetchLaps(accessToken: string, activityId: string): Promise<StravaLap[] | null> {
  return get<StravaLap[]>(`${STRAVA_API}/activities/${activityId}/laps`, accessToken)
}

export type StravaDetail = {
  splits_metric?: unknown
  suffer_score?: number
  average_cadence?: number
  calories?: number
}

export async function fetchDetail(accessToken: string, activityId: string): Promise<StravaDetail | null> {
  return get<StravaDetail>(`${STRAVA_API}/activities/${activityId}`, accessToken)
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
