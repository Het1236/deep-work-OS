import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAIProvider } from '@/lib/ai'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Signals = {
  month: { expense: number; income: number; lastExpense: number; pctChange: number }
  forecastExpense: number
  categoryAlerts: { name: string; thisMonth: number; lastMonth: number; pct: number }[]
  habitsAtRisk: { name: string; streak: number }[]
  deepWork: { thisWeekHours: number; lastWeekHours: number; pctChange: number }
}

async function computeSignals(supabase: Supa, userId: string): Promise<Signals> {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const thisStart = ymd(new Date(y, m, 1))
  const lastStart = ymd(new Date(y, m - 1, 1))
  const lastEnd = ymd(new Date(y, m, 0))
  const todayStr = ymd(now)
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(y, m + 1, 0).getDate()

  // Transactions: this month + last month
  const [{ data: thisTx }, { data: lastTx }, { data: cats }] = await Promise.all([
    supabase.from('transactions').select('type,amount,category_id').eq('user_id', userId).gte('txn_date', thisStart).lte('txn_date', todayStr),
    supabase.from('transactions').select('type,amount,category_id').eq('user_id', userId).gte('txn_date', lastStart).lte('txn_date', lastEnd),
    supabase.from('finance_categories').select('id,name').eq('user_id', userId),
  ])
  const catName = new Map<string, string>((cats || []).map((c: { id: string; name: string }) => [c.id, c.name] as [string, string]))

  let expense = 0, income = 0
  const thisByCat = new Map<string, number>()
  for (const t of (thisTx || []) as { type: string; amount: number; category_id: string | null }[]) {
    if (t.type === 'expense') { expense += Number(t.amount); if (t.category_id) thisByCat.set(t.category_id, (thisByCat.get(t.category_id) || 0) + Number(t.amount)) }
    else if (t.type === 'income') income += Number(t.amount)
  }
  let lastExpense = 0
  const lastByCat = new Map<string, number>()
  for (const t of (lastTx || []) as { type: string; amount: number; category_id: string | null }[]) {
    if (t.type === 'expense') { lastExpense += Number(t.amount); if (t.category_id) lastByCat.set(t.category_id, (lastByCat.get(t.category_id) || 0) + Number(t.amount)) }
  }
  const pctChange = lastExpense > 0 ? Math.round(((expense - lastExpense) / lastExpense) * 100) : 0
  const forecastExpense = dayOfMonth > 0 ? Math.round((expense / dayOfMonth) * daysInMonth) : expense

  // Category anomalies: up >=40% and at least ₹300 higher
  const categoryAlerts: Signals['categoryAlerts'] = []
  for (const [id, thisAmt] of thisByCat.entries()) {
    const lastAmt = lastByCat.get(id) || 0
    if (lastAmt > 0 && thisAmt - lastAmt >= 300 && (thisAmt - lastAmt) / lastAmt >= 0.4) {
      categoryAlerts.push({ name: catName.get(id) || 'Uncategorized', thisMonth: Math.round(thisAmt), lastMonth: Math.round(lastAmt), pct: Math.round(((thisAmt - lastAmt) / lastAmt) * 100) })
    }
  }
  categoryAlerts.sort((a, b) => b.pct - a.pct)

  // Habits at risk: active habit with a current streak (>=2) not yet logged today
  const { data: habits } = await supabase.from('habits').select('id,name').eq('user_id', userId).eq('is_active', true)
  const since = ymd(new Date(Date.now() - 40 * 86400000))
  const { data: logs } = await supabase.from('habit_logs').select('habit_id,log_date,completed').eq('user_id', userId).gte('log_date', since)
  const doneByHabit = new Map<string, Set<string>>()
  for (const l of (logs || []) as { habit_id: string; log_date: string; completed: boolean }[]) {
    if (!l.completed) continue
    if (!doneByHabit.has(l.habit_id)) doneByHabit.set(l.habit_id, new Set())
    doneByHabit.get(l.habit_id)!.add(l.log_date)
  }
  const habitsAtRisk: Signals['habitsAtRisk'] = []
  for (const h of (habits || []) as { id: string; name: string }[]) {
    const days = doneByHabit.get(h.id) || new Set<string>()
    if (days.has(todayStr)) continue // already done today
    // count streak ending yesterday
    let streak = 0
    const cur = new Date(now); cur.setDate(cur.getDate() - 1)
    while (days.has(ymd(cur)) && streak < 400) { streak++; cur.setDate(cur.getDate() - 1) }
    if (streak >= 2) habitsAtRisk.push({ name: h.name, streak })
  }
  habitsAtRisk.sort((a, b) => b.streak - a.streak)

  // Deep work: this week vs last week (by started_at)
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7)
  const prevStart = new Date(now); prevStart.setDate(now.getDate() - 14)
  const { data: sess } = await supabase.from('deep_work_sessions').select('duration_minutes,started_at').eq('user_id', userId).gte('started_at', prevStart.toISOString())
  let thisWk = 0, lastWk = 0
  for (const s of (sess || []) as { duration_minutes: number | null; started_at: string }[]) {
    const t = new Date(s.started_at).getTime()
    if (t >= weekStart.getTime()) thisWk += s.duration_minutes || 0
    else lastWk += s.duration_minutes || 0
  }
  const dwPct = lastWk > 0 ? Math.round(((thisWk - lastWk) / lastWk) * 100) : 0

  return {
    month: { expense: Math.round(expense), income: Math.round(income), lastExpense: Math.round(lastExpense), pctChange },
    forecastExpense,
    categoryAlerts: categoryAlerts.slice(0, 4),
    habitsAtRisk: habitsAtRisk.slice(0, 4),
    deepWork: { thisWeekHours: +(thisWk / 60).toFixed(1), lastWeekHours: +(lastWk / 60).toFixed(1), pctChange: dwPct },
  }
}

async function narrate(signals: Signals): Promise<{ summary: string; tips: string[] }> {
  const prompt = `You are a concise, encouraging personal life coach for a student. Based on these weekly/monthly signals (amounts in INR), write JSON:
{ "summary": "2-3 sentence personal, specific, honest digest", "tips": ["short actionable tip", "short actionable tip", "short actionable tip"] }

Signals: ${JSON.stringify(signals)}

Be specific and reference the numbers. If data is sparse, gently encourage building the habit of tracking. Output ONLY the JSON.`
  try {
    const out = await getAIProvider().complete(
      [
        { role: 'system', content: 'You output only valid minified JSON.' },
        { role: 'user', content: prompt },
      ],
      { json: true, temperature: 0.6, maxTokens: 400 }
    )
    const parsed = JSON.parse(out)
    return { summary: String(parsed.summary || ''), tips: Array.isArray(parsed.tips) ? parsed.tips.slice(0, 4).map(String) : [] }
  } catch {
    // Fallback (no AI / quota): templated summary
    const s = signals
    const dir = s.month.pctChange >= 0 ? 'up' : 'down'
    return {
      summary: `You've spent ₹${s.month.expense.toLocaleString('en-IN')} this month (${Math.abs(s.month.pctChange)}% ${dir} vs last month), tracking toward ~₹${s.forecastExpense.toLocaleString('en-IN')} by month-end.${s.habitsAtRisk.length ? ` ${s.habitsAtRisk.length} habit streak(s) need attention today.` : ''}`,
      tips: [
        s.categoryAlerts[0] ? `Watch ${s.categoryAlerts[0].name} — it's up ${s.categoryAlerts[0].pct}% vs last month.` : 'Log a few expenses to unlock sharper insights.',
        s.habitsAtRisk[0] ? `Keep your ${s.habitsAtRisk[0].name} streak (${s.habitsAtRisk[0].streak} days) alive today.` : 'Check in on a habit today.',
        s.deepWork.thisWeekHours > 0 ? `Deep work this week: ${s.deepWork.thisWeekHours}h.` : 'Start a focus session to build momentum.',
      ],
    }
  }
}

export async function GET() { return handle(false) }
export async function POST() { return handle(true) }

async function handle(forceRefresh: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = user.id
  const today = ymd(new Date())

  if (!forceRefresh) {
    const { data: cached } = await supabase.from('ai_insights').select('payload').eq('user_id', userId).eq('period_date', today).maybeSingle()
    if (cached?.payload) return NextResponse.json({ ...cached.payload, cached: true })
  }

  const signals = await computeSignals(supabase, userId)
  const { summary, tips } = await narrate(signals)
  const payload = { signals, summary, tips, generatedAt: new Date().toISOString() }

  await supabase.from('ai_insights').upsert({ user_id: userId, period_date: today, payload }, { onConflict: 'user_id,period_date' })
  return NextResponse.json({ ...payload, cached: false })
}
