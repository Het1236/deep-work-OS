import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = user.id

  const now = new Date()
  const today = ymd(now)
  const since30 = ymd(new Date(Date.now() - 30 * 86400000))
  const weekStartISO = new Date(Date.now() - 7 * 86400000).toISOString()
  const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1))

  const [sessRes, txRes, habitRes, logRes, goalRes, catRes, jRes] = await Promise.all([
    supabase.from('deep_work_sessions').select('duration_minutes,started_at,session_date,deep_work_pct').eq('user_id', userId).gte('started_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    supabase.from('transactions').select('type,amount,txn_date,category_id,created_at').eq('user_id', userId).gte('txn_date', since30),
    supabase.from('habits').select('id,name').eq('user_id', userId).eq('is_active', true),
    supabase.from('habit_logs').select('habit_id,log_date,completed').eq('user_id', userId).gte('log_date', since30),
    supabase.from('goals').select('title,progress_pct,status').eq('user_id', userId),
    supabase.from('finance_categories').select('id,name,monthly_budget,kind').eq('user_id', userId).eq('is_archived', false),
    supabase.from('journal_entries').select('entry_date,reflection,created_at').eq('user_id', userId).gte('entry_date', since30).order('entry_date', { ascending: false }).limit(10),
  ])

  const sessions = (sessRes.data || []) as { duration_minutes: number | null; started_at: string; session_date: string | null; deep_work_pct: number | null }[]
  const txns = (txRes.data || []) as { type: string; amount: number; txn_date: string; category_id: string | null; created_at: string }[]
  const habits = (habitRes.data || []) as { id: string; name: string }[]
  const logs = (logRes.data || []) as { habit_id: string; log_date: string; completed: boolean }[]
  const goals = (goalRes.data || []) as { title: string; progress_pct: number; status: string }[]
  const cats = (catRes.data || []) as { id: string; name: string; monthly_budget: number | null; kind: string }[]
  const journals = (jRes.data || []) as { entry_date: string; reflection: string | null; created_at: string }[]

  // ─── Daily buckets (last 30 days) ───
  const dwByDay = new Map<string, number>()      // minutes
  for (const s of sessions) {
    const d = s.session_date || s.started_at.slice(0, 10)
    dwByDay.set(d, (dwByDay.get(d) || 0) + (s.duration_minutes || 0))
  }
  const spendByDay = new Map<string, number>()
  for (const t of txns) {
    if (t.type === 'expense') spendByDay.set(t.txn_date, (spendByDay.get(t.txn_date) || 0) + Number(t.amount))
  }
  const habitDoneByDay = new Map<string, number>()
  for (const l of logs) {
    if (l.completed) habitDoneByDay.set(l.log_date, (habitDoneByDay.get(l.log_date) || 0) + 1)
  }

  // distinct days observed
  const allDays = new Set<string>([...dwByDay.keys(), ...spendByDay.keys(), ...habitDoneByDay.keys()])

  // ─── Correlations ───
  const correlations: { text: string; tone: 'insight' | 'positive' | 'warning' }[] = []
  const focusSpends: number[] = [], lowSpends: number[] = []
  const focusHabit: number[] = [], lowHabit: number[] = []
  const habitCount = Math.max(1, habits.length)
  for (const d of allDays) {
    const dw = dwByDay.get(d) || 0
    const sp = spendByDay.get(d) || 0
    const hb = (habitDoneByDay.get(d) || 0) / habitCount
    if (dw >= 60) { focusSpends.push(sp); focusHabit.push(hb) } else { lowSpends.push(sp); lowHabit.push(hb) }
  }
  if (focusSpends.length >= 3 && lowSpends.length >= 3) {
    const f = Math.round(avg(focusSpends)), l = Math.round(avg(lowSpends))
    if (Math.abs(f - l) >= 50) {
      correlations.push({
        text: l > f
          ? `You spend ~₹${l.toLocaleString('en-IN')} on low-focus days vs ~₹${f.toLocaleString('en-IN')} on deep-work days — focus keeps your wallet calmer.`
          : `You spend more on deep-work days (~₹${f.toLocaleString('en-IN')}) than low-focus ones (~₹${l.toLocaleString('en-IN')}).`,
        tone: l > f ? 'positive' : 'insight',
      })
    }
  }
  if (focusHabit.length >= 3 && lowHabit.length >= 3) {
    const f = avg(focusHabit), l = avg(lowHabit)
    if (f - l >= 0.15) {
      correlations.push({ text: `Your habit completion is ${Math.round((f - l) * 100)}% higher on deep-work days — momentum compounds.`, tone: 'positive' })
    }
  }
  if (correlations.length === 0) {
    correlations.push({ text: 'Keep logging sessions, spending and habits — correlations unlock once there are a couple of weeks of data.', tone: 'insight' })
  }

  // ─── Life Score ───
  // Focus: this-week hours vs 10h target
  const weekMin = sessions.filter(s => new Date(s.started_at).toISOString() >= weekStartISO).reduce((a, s) => a + (s.duration_minutes || 0), 0)
  const focusScore = Math.max(0, Math.min(100, Math.round((weekMin / 60) / 10 * 100)))
  // Habits: this-week completion
  const weekDays: string[] = []
  for (let i = 0; i < 7; i++) weekDays.push(ymd(new Date(Date.now() - i * 86400000)))
  const habitPossible = habits.length * 7
  const habitDone = weekDays.reduce((a, d) => a + (habitDoneByDay.get(d) || 0), 0)
  const habitScore = habitPossible > 0 ? Math.round((habitDone / habitPossible) * 100) : 0
  // Money: budget adherence this month (categories with budgets)
  const monthExpenseByCat = new Map<string, number>()
  let monthExpense = 0, monthIncome = 0
  for (const t of txns) {
    if (t.txn_date < monthStart) continue
    if (t.type === 'expense') { monthExpense += Number(t.amount); if (t.category_id) monthExpenseByCat.set(t.category_id, (monthExpenseByCat.get(t.category_id) || 0) + Number(t.amount)) }
    else if (t.type === 'income') monthIncome += Number(t.amount)
  }
  const budgeted = cats.filter(c => c.kind === 'expense' && (c.monthly_budget || 0) > 0)
  let moneyScore: number
  if (budgeted.length > 0) {
    const adher = budgeted.map(c => {
      const spent = monthExpenseByCat.get(c.id) || 0
      const b = Number(c.monthly_budget)
      return Math.max(0, Math.min(100, 100 - Math.max(0, (spent - b) / b) * 100))
    })
    moneyScore = Math.round(avg(adher))
  } else {
    moneyScore = monthIncome > 0 ? Math.max(0, Math.min(100, Math.round(((monthIncome - monthExpense) / monthIncome) * 100))) : (monthExpense > 0 ? 55 : 70)
  }
  // Goals: avg progress of active goals
  const activeGoals = goals.filter(g => g.status !== 'integrated')
  const goalScore = activeGoals.length > 0 ? Math.round(avg(activeGoals.map(g => g.progress_pct || 0))) : 0

  const lifeScore = Math.round(focusScore * 0.3 + habitScore * 0.3 + moneyScore * 0.25 + goalScore * 0.15)

  // ─── Unified timeline (last 14 days, latest 24) ───
  type Ev = { date: string; ts: string; kind: string; text: string }
  const events: Ev[] = []
  for (const s of sessions) {
    const dur = s.duration_minutes || 0
    if (dur <= 0) continue
    events.push({ date: (s.session_date || s.started_at.slice(0, 10)), ts: s.started_at, kind: 'session', text: `Deep work · ${dur}m${s.deep_work_pct != null ? ` · ${s.deep_work_pct}% deep` : ''}` })
  }
  for (const t of txns) {
    const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''
    events.push({ date: t.txn_date, ts: t.created_at || t.txn_date, kind: t.type === 'income' ? 'income' : 'expense', text: `${sign}₹${Number(t.amount).toLocaleString('en-IN')}${t.type === 'transfer' ? ' transfer' : ''}` })
  }
  const habitName = new Map(habits.map(h => [h.id, h.name]))
  for (const l of logs) {
    if (!l.completed) continue
    events.push({ date: l.log_date, ts: l.log_date, kind: 'habit', text: `Habit · ${habitName.get(l.habit_id) || 'done'}` })
  }
  for (const j of journals) {
    events.push({ date: j.entry_date, ts: j.created_at || j.entry_date, kind: 'journal', text: `Journal · ${(j.reflection || 'entry').slice(0, 60)}` })
  }
  events.sort((a, b) => (b.ts < a.ts ? -1 : b.ts > a.ts ? 1 : 0))
  const timeline = events.slice(0, 24)

  return NextResponse.json({
    lifeScore,
    breakdown: { focus: focusScore, habits: habitScore, money: moneyScore, goals: goalScore },
    correlations,
    timeline,
    stats: { weekHours: +(weekMin / 60).toFixed(1), monthExpense: Math.round(monthExpense), activeGoals: activeGoals.length },
  })
}
