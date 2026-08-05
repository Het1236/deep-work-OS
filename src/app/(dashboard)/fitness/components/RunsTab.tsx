'use client'

// Runs: Strava connect + sync, manual entry, and the run log.

import { useState, useEffect, useCallback } from 'react'
import { Footprints, RefreshCw, Link2, Plus, Trash2, Loader2, Check, X, Heart, Mountain, Settings } from 'lucide-react'
import { getRuns, createRun, deleteRun } from '@/lib/fitness/data'
import { formatPace, formatDuration, paceSecPerKm, km } from '@/lib/fitness/stats'
import type { Run, RunType } from '@/lib/types'

const RUN_TYPES: RunType[] = ['easy', 'long', 'tempo', 'interval', 'recovery', 'strides']

export default function RunsTab({ userId }: { userId: string }) {
  const [runs, setRuns] = useState<Run[]>([])
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean; lastSyncedAt: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [r, s] = await Promise.all([
      getRuns(userId),
      fetch('/api/strava/status').then(res => res.json()).catch(() => ({ configured: false, connected: false, lastSyncedAt: null })),
    ])
    setRuns(r); setStatus(s); setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  // Surface the outcome of the OAuth round-trip.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('strava')
    if (!p) return
    const text: Record<string, string> = {
      connected: 'Strava connected. Hit Sync to pull your runs.',
      denied: 'Strava authorisation was cancelled.',
      failed: 'Could not connect to Strava. Try again.',
      not_configured: 'Strava is not configured on the server yet.',
      auth_mismatch: 'Sign-in mismatch — please sign in again and retry.',
    }
    if (p === 'connected') setMsg(text[p]); else setError(text[p] || 'Strava error.')
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function sync() {
    setSyncing(true); setError(null); setMsg(null)
    try {
      const res = await fetch('/api/strava/sync', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Sync failed')
      setMsg(`Synced — ${j.imported} run${j.imported === 1 ? '' : 's'} from ${j.found} found.`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally { setSyncing(false) }
  }

  async function remove(r: Run) {
    if (!confirm('Delete this run?')) return
    await deleteRun(r.id); load()
  }

  return (
    <div className="ft-runs">
      <div className="ft-card ft-pad">
        <h3 className="ft-card-title"><Link2 size={15} /> Strava</h3>
        <p className="ft-hint">
          Record on your watch, let Samsung Health sync to Strava, then pull the runs in here.
          Samsung Health has no public cloud API of its own — Strava is the bridge.
        </p>
        {error && <div className="ft-error"><X size={14} /> {error}</div>}
        {msg && <div className="ft-saved"><Check size={15} /> {msg}</div>}
        {status && !status.configured && <StravaSetup />}

        <div className="ft-photo-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          {status?.connected ? (
            <button className="ft-btn ft-btn--accent" onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 size={15} className="ft-spin" /> : <RefreshCw size={15} />} Sync runs
            </button>
          ) : (
            <a className={`ft-btn ft-btn--accent${status?.configured ? '' : ' ft-btn--off'}`}
               href={status?.configured ? '/api/strava/connect' : undefined}
               aria-disabled={!status?.configured}
               onClick={e => { if (!status?.configured) e.preventDefault() }}>
              <Link2 size={15} /> Connect Strava
            </a>
          )}
          <button className="ft-btn" onClick={() => setAdding(a => !a)}>
            <Plus size={15} /> Log manually
          </button>
        </div>
        {status?.lastSyncedAt && (
          <p className="ft-hint" style={{ marginTop: 10, marginBottom: 0 }}>
            Last synced {new Date(status.lastSyncedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
      </div>

      {adding && <ManualRun userId={userId} onSaved={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />}

      {loading ? (
        <div className="ft-loading"><Loader2 size={20} className="ft-spin" /> Loading runs…</div>
      ) : runs.length === 0 ? (
        <div className="ft-empty">No runs yet. Connect Strava or log one manually. 🏃</div>
      ) : (
        <div className="ft-card ft-pad">
          <h3 className="ft-card-title"><Footprints size={15} /> Run log</h3>
          <div className="ft-runlist">
            {runs.map(r => {
              const pace = paceSecPerKm(r.distance_m, r.moving_time_s)
              return (
                <div key={r.id} className="ft-run">
                  <div className="ft-run-main">
                    <div className="ft-run-top">
                      <span className="ft-run-name">{r.name || 'Run'}</span>
                      {r.run_type && <span className="ft-runtype-tag">{r.run_type}</span>}
                    </div>
                    <div className="ft-run-meta">
                      {new Date(r.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {' · '}<b>{km(r.distance_m)} km</b>
                      {' · '}{formatPace(pace)}/km
                      {' · '}{formatDuration(r.moving_time_s)}
                    </div>
                    <div className="ft-run-extra">
                      {r.avg_hr ? <span><Heart size={11} /> {r.avg_hr} bpm</span> : null}
                      {r.elevation_gain_m ? <span><Mountain size={11} /> {r.elevation_gain_m} m</span> : null}
                      <span className="ft-run-src">{r.source}</span>
                    </div>
                  </div>
                  <button className="ft-mini ft-mini--danger" onClick={() => remove(r)} aria-label="Delete run">
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Shown instead of a dead Connect button when the server has no Strava keys.
// Nothing here is secret — these are the setup steps, not the credentials.
function StravaSetup() {
  return (
    <div className="ft-setup">
      <div className="ft-setup-head"><Settings size={15} /> Strava is not set up yet</div>
      <p>
        The Connect button needs API keys on the server. This is a one-time setup and takes about
        five minutes — until it is done, log runs manually below.
      </p>
      <ol>
        <li>
          Go to <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer">strava.com/settings/api</a> and
          create an application. Category <b>Training</b>, and set <b>Authorization Callback Domain</b> to
          just the host with no protocol or path — <code>localhost</code> for local, or your Vercel
          domain for production.
        </li>
        <li>Copy the <b>Client ID</b> and <b>Client Secret</b> it gives you.</li>
        <li>
          Add three variables — to <code>.env.local</code> for local, or Vercel → Settings →
          Environment Variables for production:
          <pre>{`STRAVA_CLIENT_ID=<your client id>
STRAVA_CLIENT_SECRET=<your client secret>
NEXT_PUBLIC_SITE_URL=http://localhost:3000`}</pre>
          On Vercel, set <code>NEXT_PUBLIC_SITE_URL</code> to your real deployed URL instead.
        </li>
        <li>Restart the dev server (or redeploy), reload this page, then hit Connect.</li>
      </ol>
      <p className="ft-setup-note">
        Keep the client secret out of git — <code>.env.local</code> is already gitignored. Do not paste
        it into any file that ends up committed.
      </p>
    </div>
  )
}

function ManualRun({ userId, onSaved, onCancel }: { userId: string; onSaved: () => void; onCancel: () => void }) {
  const [distanceKm, setDistanceKm] = useState('')
  const [minutes, setMinutes] = useState('')
  const [hr, setHr] = useState('')
  const [type, setType] = useState<RunType>('easy')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await createRun(userId, {
        started_at: new Date(date).toISOString(),
        name: `${type[0].toUpperCase()}${type.slice(1)} run`,
        distance_m: Math.round(Number(distanceKm) * 1000),
        moving_time_s: Math.round(Number(minutes) * 60),
        avg_hr: hr ? Number(hr) : null,
        run_type: type,
      })
      onSaved()
    } finally { setSaving(false) }
  }

  const valid = Number(distanceKm) > 0 && Number(minutes) > 0
  const pace = valid ? formatPace((Number(minutes) * 60) / Number(distanceKm)) : '—'

  return (
    <div className="ft-card ft-pad">
      <div className="ft-card-head">
        <h3 className="ft-card-title">Log a run</h3>
        <button className="ft-mini" onClick={onCancel}><X size={14} /></button>
      </div>
      <div className="ft-grid4">
        <label className="ft-field"><span>Distance km</span>
          <input className="ft-input ft-sm ft-num" type="number" step="0.1" value={distanceKm}
                 onChange={e => setDistanceKm(e.target.value)} /></label>
        <label className="ft-field"><span>Minutes</span>
          <input className="ft-input ft-sm ft-num" type="number" step="1" value={minutes}
                 onChange={e => setMinutes(e.target.value)} /></label>
        <label className="ft-field"><span>Avg HR</span>
          <input className="ft-input ft-sm ft-num" type="number" value={hr}
                 onChange={e => setHr(e.target.value)} /></label>
        <label className="ft-field"><span>Type</span>
          <select className="ft-input ft-sm ft-select" value={type} onChange={e => setType(e.target.value as RunType)}>
            {RUN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select></label>
      </div>
      <label className="ft-field" style={{ marginBottom: 12 }}><span>When</span>
        <input className="ft-input ft-sm" type="datetime-local" value={date} onChange={e => setDate(e.target.value)} /></label>
      <div className="ft-editor-foot">
        <span className="ft-hint" style={{ margin: 0 }}>Pace <b>{pace}</b> /km</span>
        <button className="ft-btn ft-btn--accent" onClick={save} disabled={!valid || saving}>
          {saving ? <Loader2 size={15} className="ft-spin" /> : <Check size={15} />} Save run
        </button>
      </div>
    </div>
  )
}
