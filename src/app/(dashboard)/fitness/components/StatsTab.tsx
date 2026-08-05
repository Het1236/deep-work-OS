'use client'

// Analytics dashboard: streak calendar, body map, volume/pace/e1RM charts and a
// monthly report. Summary tiles first, detail below — this screen is scanned,
// not read.

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Flame, TrendingUp, Trophy, Loader2, Activity, Dumbbell, Footprints } from 'lucide-react'
import BodyMap3D, { type MuscleLoad } from './BodyMap3D'
import { getStatsBundle, type StatsBundle } from '@/lib/fitness/data'
import {
  weeklyVolume, weeklyDistance, buildStreakDays, programmeStreak, longestStreak,
  muscleVolume, e1rmSeries, runTrend, hrZoneSplit, monthlyReport,
  formatPace, formatDuration, km, computePRs,
} from '@/lib/fitness/stats'
import type { Program } from '@/lib/types'

const AXIS = { fontSize: 10, fill: 'var(--text-tertiary)' }
const TIP = {
  background: 'var(--bg-elevated, #1a1a1a)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10, fontSize: 12,
}
const PIE_COLORS = ['var(--accent)', '#5B9BD5', '#E770A5', '#34d399', '#f5a623', '#9b8cff', '#6ee7d7']

export default function StatsTab({ userId, program }: { userId: string; program: Program | null }) {
  const [bundle, setBundle] = useState<StatsBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState(12)
  const [lift, setLift] = useState<string>('')

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - weeks * 7)
    setBundle(await getStatsBundle(userId, since.toISOString()))
    setLoading(false)
  }, [userId, weeks])

  useEffect(() => { load() }, [load])

  const restDows = useMemo(() => {
    const s = new Set<number>()
    for (const d of program?.program_days || []) if (d.day_type === 'rest') s.add(d.day_of_week)
    return s
  }, [program])

  const sessionsPerWeek = useMemo(
    () => (program?.program_days || []).filter(d => d.day_type !== 'rest').length || 6,
    [program])

  const view = useMemo(() => {
    if (!bundle) return null
    const { workouts, runs, sets } = bundle

    const days = buildStreakDays(workouts, runs, weeks * 7)
    const muscles = muscleVolume(sets)
    const load: MuscleLoad = {}
    for (const m of muscles) load[m.muscle] = m.sets

    const prs = computePRs(sets).sort((a, b) => b.bestEst1RM - a.bestEst1RM)
    const topLifts = prs.slice(0, 12).map(p => p.exercise)
    const activeLift = lift || topLifts[0] || ''

    const totalDistanceKm = runs.reduce((n, r) => n + km(r.distance_m), 0)
    const totalMovingS = runs.reduce((n, r) => n + r.moving_time_s, 0)
    const totalVolumeKg = sets.reduce((n, s) => n + (s.weight_kg || 0) * (s.reps || 0), 0)

    const month = new Date().toISOString().slice(0, 7)
    const report = monthlyReport(month, workouts, runs, sessionsPerWeek)

    return {
      days, muscles, load, prs, topLifts, activeLift,
      volume: weeklyVolume(sets),
      distance: weeklyDistance(runs),
      e1rm: activeLift ? e1rmSeries(sets, activeLift) : [],
      pace: runTrend(runs).filter(p => p.paceSecPerKm > 0),
      hr: hrZoneSplit(runs, 200).filter(z => z.minutes > 0),
      balance: [
        { name: 'Lifts', value: workouts.length },
        { name: 'Runs', value: runs.length },
      ],
      streak: programmeStreak(days, restDows),
      best: longestStreak(days, restDows),
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      totalVolumeKg: Math.round(totalVolumeKg),
      avgPace: totalDistanceKm > 0 ? totalMovingS / totalDistanceKm : 0,
      totalMovingS,
      report,
      liftCount: workouts.length,
      runCount: runs.length,
    }
  }, [bundle, weeks, lift, restDows, sessionsPerWeek])

  if (loading) return <div className="ft-loading"><Loader2 size={20} className="ft-spin" /> Crunching numbers…</div>
  if (!view) return <div className="ft-empty">No data yet.</div>

  const hasNothing = view.liftCount === 0 && view.runCount === 0

  return (
    <div className="ft-stats">
      <div className="ft-range">
        {[4, 12, 26, 52].map(w => (
          <button key={w} className={`ft-chip${weeks === w ? ' on' : ''}`} onClick={() => setWeeks(w)}>
            {w}w
          </button>
        ))}
      </div>

      {hasNothing && (
        <div className="ft-empty">Nothing logged in this window. Start a session or sync your runs.</div>
      )}

      {/* ── Summary tiles ── */}
      <div className="ft-tiles">
        <Tile icon={<Flame size={15} />} label="Current streak" value={String(view.streak)} unit="days"
              sub={`best ${view.best}`} tone="accent" />
        <Tile icon={<Dumbbell size={15} />} label="Lifts" value={String(view.liftCount)}
              sub={`${view.totalVolumeKg.toLocaleString()} kg`} />
        <Tile icon={<Footprints size={15} />} label="Runs" value={String(view.runCount)}
              sub={`${view.totalDistanceKm} km`} />
        <Tile icon={<Activity size={15} />} label="Avg pace" value={formatPace(view.avgPace)} unit="/km"
              sub={formatDuration(view.totalMovingS)} />
      </div>

      {/* ── Streak calendar ── */}
      <div className="ft-card ft-pad">
        <h3 className="ft-card-title"><Flame size={15} /> Consistency</h3>
        <p className="ft-hint">Scheduled rest days count as honoured — following the plan keeps the streak alive.</p>
        <StreakGrid days={view.days} restDows={restDows} />
        <div className="ft-cal-key">
          <span className="ft-cal-cell ft-cal--none" /> none
          <span className="ft-cal-cell ft-cal--rest" /> rest
          <span className="ft-cal-cell ft-cal--run" /> run
          <span className="ft-cal-cell ft-cal--lift" /> lift
          <span className="ft-cal-cell ft-cal--both" /> both
        </div>
      </div>

      {/* ── Body map + muscle split ── */}
      <div className="ft-two">
        <div className="ft-card ft-pad">
          <BodyMap3D load={view.load} title="Muscles worked" />
        </div>
        <div className="ft-card ft-pad">
          <h3 className="ft-card-title">Volume by muscle</h3>
          <div className="ft-muscles">
            {view.muscles.slice(0, 9).map(m => (
              <div key={m.muscle} className="ft-muscle">
                <span className="ft-muscle-name">{m.muscle}</span>
                <div className="ft-muscle-bar">
                  <div className="ft-muscle-fill" style={{ width: `${(m.sets / view.muscles[0].sets) * 100}%` }} />
                </div>
                <span className="ft-muscle-n">{m.sets}</span>
              </div>
            ))}
            {view.muscles.length === 0 && <p className="ft-hint">No sets logged yet.</p>}
          </div>
        </div>
      </div>

      {/* ── Weekly volume + distance ── */}
      <div className="ft-two">
        <Chart title="Lifting volume / week">
          <BarChart data={view.volume} margin={{ top: 6, right: 6, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="week" tick={AXIS} tickFormatter={w => String(w).slice(5)} />
            <YAxis tick={AXIS} />
            <Tooltip contentStyle={TIP} formatter={v => [`${Math.round(Number(v)).toLocaleString()} kg`, 'volume']} />
            <Bar dataKey="volumeKg" fill="var(--accent)" radius={[5, 5, 0, 0]} />
          </BarChart>
        </Chart>
        <Chart title="Running distance / week">
          <AreaChart data={view.distance} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id="runGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5B9BD5" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#5B9BD5" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="week" tick={AXIS} tickFormatter={w => String(w).slice(5)} />
            <YAxis tick={AXIS} />
            <Tooltip contentStyle={TIP} formatter={v => [`${v} km`, 'distance']} />
            <Area type="monotone" dataKey="km" stroke="#5B9BD5" strokeWidth={2} fill="url(#runGrad)" />
          </AreaChart>
        </Chart>
      </div>

      {/* ── Strength progression ── */}
      <div className="ft-card ft-pad">
        <div className="ft-card-head">
          <h3 className="ft-card-title"><TrendingUp size={15} /> Estimated 1RM</h3>
          <select className="ft-input ft-sm ft-select" value={view.activeLift} onChange={e => setLift(e.target.value)}>
            {view.topLifts.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        {view.e1rm.length > 1 ? (
          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer>
              <LineChart data={view.e1rm} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={AXIS} tickFormatter={d => String(d).slice(5)} />
                <YAxis tick={AXIS} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip contentStyle={TIP} formatter={v => [`${v} kg`, 'e1RM']} />
                <Line type="monotone" dataKey="e1rm" stroke="var(--accent)" strokeWidth={2.5}
                      dot={{ r: 3, fill: 'var(--accent)' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="ft-hint">Log this lift on two different days to see progression.</p>}
      </div>

      {/* ── Pace + HR ── */}
      <div className="ft-two">
        <Chart title="Pace per run (lower is faster)">
          <LineChart data={view.pace} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={AXIS} tickFormatter={d => String(d).slice(5)} />
            <YAxis tick={AXIS} reversed domain={['dataMin - 20', 'dataMax + 20']}
                   tickFormatter={v => formatPace(Number(v))} />
            <Tooltip contentStyle={TIP}
                     formatter={(v, n) => n === 'paceSecPerKm' ? [`${formatPace(Number(v))} /km`, 'pace'] : [v, n]} />
            <Line type="monotone" dataKey="paceSecPerKm" stroke="#E770A5" strokeWidth={2.5}
                  dot={{ r: 3, fill: '#E770A5' }} />
          </LineChart>
        </Chart>
        <Chart title="Time by heart-rate zone">
          {view.hr.length > 0 ? (
            <BarChart data={view.hr} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="zone" tick={{ ...AXIS, fontSize: 8 }} />
              <YAxis tick={AXIS} />
              <Tooltip contentStyle={TIP} formatter={v => [`${v} min`, 'time']} />
              <Bar dataKey="minutes" fill="#34d399" radius={[5, 5, 0, 0]} />
            </BarChart>
          ) : <div className="ft-nochart">No heart-rate data yet — connect Strava.</div>}
        </Chart>
      </div>

      {/* ── Balance + PRs ── */}
      <div className="ft-two">
        <div className="ft-card ft-pad">
          <h3 className="ft-card-title">Lift / run balance</h3>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={view.balance} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} paddingAngle={3}>
                  {view.balance.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={TIP} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="ft-hint">The programme asks for 3 and 3. Drifting one way is the earliest sign it is slipping.</p>
        </div>

        <div className="ft-card ft-pad">
          <h3 className="ft-card-title"><Trophy size={15} /> Best lifts</h3>
          <div className="ft-prs">
            {view.prs.slice(0, 9).map(p => (
              <div key={p.exercise} className="ft-pr">
                <span className="ft-pr-ex">{p.exercise}</span>
                <span className="ft-pr-val">{p.bestWeight}kg · e1RM {p.bestEst1RM}kg</span>
              </div>
            ))}
            {view.prs.length === 0 && <p className="ft-hint">No weighted sets logged yet.</p>}
          </div>
        </div>
      </div>

      {/* ── Monthly report ── */}
      <div className="ft-card ft-pad">
        <h3 className="ft-card-title">This month · {view.report.month}</h3>
        <div className="ft-report">
          <div><b>{view.report.lifts}</b><span>lifts</span></div>
          <div><b>{view.report.runs}</b><span>runs</span></div>
          <div><b>{view.report.totalSets}</b><span>sets</span></div>
          <div><b>{view.report.totalVolumeKg.toLocaleString()}</b><span>kg volume</span></div>
          <div><b>{view.report.totalDistanceKm}</b><span>km run</span></div>
          <div><b>{view.report.avgRunPaceSecPerKm ? formatPace(view.report.avgRunPaceSecPerKm) : '—'}</b><span>avg pace</span></div>
        </div>
        <div className="ft-adherence">
          <div className="ft-adherence-head">
            <span>Adherence vs programme</span>
            <b>{view.report.adherencePct}%</b>
          </div>
          <div className="ft-muscle-bar">
            <div className="ft-muscle-fill" style={{ width: `${view.report.adherencePct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Tile({ icon, label, value, unit, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; sub?: string; tone?: 'accent'
}) {
  return (
    <div className={`ft-tile${tone === 'accent' ? ' ft-tile--accent' : ''}`}>
      <div className="ft-tile-top">{icon}<span>{label}</span></div>
      <div className="ft-tile-val">{value}{unit && <em>{unit}</em>}</div>
      {sub && <div className="ft-tile-sub">{sub}</div>}
    </div>
  )
}

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="ft-card ft-pad">
      <h3 className="ft-card-title">{title}</h3>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  )
}

// GitHub-style heatmap, weeks as columns. Colour encodes *what* was done, not
// just whether — a run and a lift are different kinds of good day.
function StreakGrid({ days, restDows }: { days: { date: string; lifted: boolean; ran: boolean }[]; restDows: Set<number> }) {
  const cols: (typeof days)[] = []
  let col: typeof days = []
  for (const d of days) {
    const dow = (new Date(`${d.date}T12:00:00`).getDay() + 6) % 7
    if (dow === 0 && col.length > 0) { cols.push(col); col = [] }
    col.push(d)
  }
  if (col.length > 0) cols.push(col)

  return (
    <div className="ft-cal">
      {cols.map((week, i) => (
        <div key={i} className="ft-cal-col">
          {week.map(d => {
            const dow = (new Date(`${d.date}T12:00:00`).getDay() + 6) % 7
            const cls = d.lifted && d.ran ? 'both'
              : d.lifted ? 'lift'
              : d.ran ? 'run'
              : restDows.has(dow) ? 'rest' : 'none'
            return <span key={d.date} className={`ft-cal-cell ft-cal--${cls}`} title={`${d.date}`} />
          })}
        </div>
      ))}
    </div>
  )
}
