import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage, escapeHtml } from '@/lib/telegram/api'

// Hourly cron (see vercel.json). For each user, checks their local time against
// notification_settings and pushes the relevant GTD reminder via Telegram.
// Guarded by CRON_SECRET (Vercel sends `Authorization: Bearer <CRON_SECRET>`).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://deep-work-os-iota.vercel.app'

type LocalTime = { hour: number; dow: number; ymd: string }
function localTime(tz: string, now: Date): LocalTime {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now))
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now)
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
    return { hour: Number.isNaN(hour) ? 8 : hour, dow: WEEKDAY[wd] ?? 0, ymd }
  } catch {
    return { hour: 8, dow: 0, ymd: now.toISOString().split('T')[0] }
  }
}

type TaskRow = {
  title: string; scheduled_date: string | null; gtd_bucket: string
  priority: number; waiting_for_who: string | null; waiting_since: string | null
}

type DebtRow = {
  id: string; type: string; amount: number; person: string | null
  parent_tx_id: string | null; due_date: string | null; txn_date: string; is_settled: boolean
}

// Outstanding lends/borrows → lines for the morning agenda (empty when all square).
function buildDebtLines(rows: DebtRow[], ymd: string): string[] {
  const repaid = new Map<string, number>()
  for (const r of rows) {
    if (r.type === 'repayment' && r.parent_tx_id) {
      repaid.set(r.parent_tx_id, (repaid.get(r.parent_tx_id) || 0) + Number(r.amount))
    }
  }
  const lines: string[] = []
  for (const r of rows) {
    if (r.type !== 'lend' && r.type !== 'borrow') continue
    // Outstanding is computed from repayment rows (is_settled may be stale after an undo).
    const outstanding = Number(r.amount) - (repaid.get(r.id) || 0)
    if (outstanding <= 0) continue
    const days = Math.max(0, Math.floor((new Date(ymd).getTime() - new Date(r.txn_date).getTime()) / 86_400_000))
    const overdue = !!r.due_date && r.due_date < ymd
    const who = escapeHtml(r.person || '?')
    const base = r.type === 'lend'
      ? `${who} owes you ₹${Math.round(outstanding)}`
      : `You owe ${who} ₹${Math.round(outstanding)}`
    lines.push(`• ${overdue ? '⚠ ' : ''}${base} (${days}d${overdue ? ', OVERDUE' : ''})`)
  }
  return lines
}

// Compose the morning agenda: overdue + today's calendar items, then top next actions.
function buildAgenda(tasks: TaskRow[], ymd: string): string | null {
  const open = tasks.filter(t => t.gtd_bucket !== 'trash')
  const calendar = open.filter(t => t.gtd_bucket === 'calendar' && t.scheduled_date)
  const overdue = calendar.filter(t => (t.scheduled_date as string) < ymd)
  const todayItems = calendar.filter(t => t.scheduled_date === ymd)
  const nextActions = open
    .filter(t => t.gtd_bucket === 'next_action')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, 5)

  if (overdue.length === 0 && todayItems.length === 0 && nextActions.length === 0) return null

  const lines: string[] = ['☀️ <b>Good morning — your agenda</b>']
  if (overdue.length) {
    lines.push('', '⏰ <b>Overdue</b>')
    overdue.forEach(t => lines.push(`• ${escapeHtml(t.title)} <i>(${t.scheduled_date})</i>`))
  }
  if (todayItems.length) {
    lines.push('', '📅 <b>Today</b>')
    todayItems.forEach(t => lines.push(`• ${escapeHtml(t.title)}`))
  }
  if (nextActions.length) {
    lines.push('', '⚡ <b>Next actions</b>')
    nextActions.forEach(t => lines.push(`• ${escapeHtml(t.title)}`))
  }
  lines.push('', `👉 ${APP_URL}/gtd`)
  return lines.join('\n')
}

async function processUser(admin: Admin, s: Record<string, unknown>, chatId: string, now: Date) {
  const tz = (s.timezone as string) || 'Asia/Kolkata'
  const { hour, dow, ymd } = localTime(tz, now)

  const morningHour = (s.morning_hour as number) ?? 8
  const anyMorning = !!(s.morning_agenda || s.inbox_nudge || s.waiting_followup)
  // Fire the morning batch at or after the configured hour, once per local day.
  const doMorning = anyMorning && hour >= morningHour && s.last_morning_sent !== ymd

  const weeklyDow = (s.weekly_review_dow as number) ?? 0
  const weeklyHour = (s.weekly_review_hour as number) ?? 19
  const doWeekly = !!s.weekly_review && dow === weeklyDow && hour >= weeklyHour && s.last_weekly_sent !== ymd

  if (!doMorning && !doWeekly) return

  const { data } = await admin
    .from('tasks')
    .select('title,scheduled_date,gtd_bucket,priority,waiting_for_who,waiting_since')
    .eq('user_id', s.user_id)
    .neq('status', 'done')
  const tasks = (data || []) as TaskRow[]

  if (doMorning) {
    // ── Morning agenda (+ outstanding udhaar section) ──
    if (s.morning_agenda) {
      const { data: debtData } = await admin
        .from('transactions')
        .select('id,type,amount,person,parent_tx_id,due_date,txn_date,is_settled')
        .eq('user_id', s.user_id)
        .in('type', ['lend', 'borrow', 'repayment'])
      const debtLines = buildDebtLines((debtData || []) as DebtRow[], ymd)
      const agenda = buildAgenda(tasks, ymd)
      if (agenda || debtLines.length) {
        const parts: string[] = []
        parts.push(agenda ?? '☀️ <b>Good morning</b>')
        if (debtLines.length) parts.push('', '💸 <b>Udhaar</b>', ...debtLines)
        await sendMessage(chatId, parts.join('\n'))
      }
    }
    // ── Inbox-not-empty clarify nudge ──
    if (s.inbox_nudge) {
      const inbox = tasks.filter(t => t.gtd_bucket === 'inbox').length
      if (inbox > 0) {
        await sendMessage(chatId, `📥 <b>${inbox} thing${inbox === 1 ? '' : 's'} to clarify</b> in your inbox. Process to zero — mind like water.\n\n👉 ${APP_URL}/gtd`)
      }
    }
    // ── Waiting-For follow-ups ──
    if (s.waiting_followup) {
      const days = (s.waiting_followup_days as number) ?? 3
      const cutoff = Date.now() - days * 86_400_000
      const stale = tasks.filter(t => t.gtd_bucket === 'waiting_for' && t.waiting_since && new Date(t.waiting_since).getTime() <= cutoff)
      if (stale.length) {
        const lines = ['⏳ <b>Still waiting?</b>', ...stale.slice(0, 8).map(t =>
          `• ${escapeHtml(t.title)}${t.waiting_for_who ? ` — <i>${escapeHtml(t.waiting_for_who)}</i>` : ''}`)]
        lines.push('', `👉 ${APP_URL}/gtd`)
        await sendMessage(chatId, lines.join('\n'))
      }
    }
    await admin.from('notification_settings').update({ last_morning_sent: ymd }).eq('user_id', s.user_id)
  }

  if (doWeekly) {
    // ── Weekly Review prompt ──
    await sendMessage(chatId,
      '🧭 <b>Weekly Review time</b>\nGet Clear → Get Current → Get Creative.\n\nProcess your inbox to zero, review next actions, waiting-fors, and projects, then revisit Someday/Maybe.\n\n👉 ' + APP_URL + '/gtd/review')
    await admin.from('notification_settings').update({ last_weekly_sent: ymd }).eq('user_id', s.user_id)
  }
}

async function run(): Promise<{ processed: number }> {
  const admin = createAdminClient()
  const now = new Date()

  const { data: settings } = await admin.from('notification_settings').select('*')
  const rows = (settings || []) as Record<string, unknown>[]
  if (rows.length === 0) return { processed: 0 }

  const ids = rows.map(r => r.user_id)
  const { data: profiles } = await admin.from('profiles').select('id,telegram_chat_id').in('id', ids)
  const chatById = new Map<string, string>()
  for (const p of (profiles || []) as { id: string; telegram_chat_id: string | null }[]) {
    if (p.telegram_chat_id) chatById.set(p.id, p.telegram_chat_id)
  }

  let processed = 0
  for (const s of rows) {
    const chatId = chatById.get(s.user_id as string)
    if (!chatId) continue // not linked to Telegram → nothing to send
    try { await processUser(admin, s, chatId, now); processed++ } catch (e) { console.error('reminder failed', s.user_id, e) }
  }
  return { processed }
}

// Meal-photo retention: purge stored photos older than 30 days (macro data kept).
// Piggybacks on this cron because both Hobby cron slots are already used.
async function cleanupMealPhotos(admin: Admin): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0]
    const { data } = await admin
      .from('meals')
      .select('id,photo_path')
      .not('photo_path', 'is', null)
      .lt('meal_date', cutoff)
      .limit(200)
    const rows = (data || []) as { id: string; photo_path: string }[]
    if (rows.length === 0) return 0
    const { error: rmErr } = await admin.storage.from('meal-photos').remove(rows.map(r => r.photo_path))
    if (rmErr) throw rmErr
    await admin.from('meals').update({ photo_path: null }).in('id', rows.map(r => r.id))
    return rows.length
  } catch (e) {
    console.error('meal photo cleanup failed', e)
    return 0 // never let cleanup break reminders
  }
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    const result = await run()
    const photosPurged = await cleanupMealPhotos(createAdminClient())
    return NextResponse.json({ ok: true, ...result, photosPurged })
  } catch (err) {
    console.error('cron/reminders error:', err)
    return NextResponse.json({ ok: false, error: 'failed' }, { status: 500 })
  }
}
