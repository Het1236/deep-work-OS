import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCapture, type CaptureContext } from '@/lib/ai/intent'
import { AINotConfiguredError } from '@/lib/ai'
import { formatINR } from '@/lib/finance'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any

const today = () => new Date().toISOString().split('T')[0]

async function awardXp(supabase: Supa, userId: string, eventType: string, xp: number) {
  try {
    await supabase.from('xp_events').insert({ user_id: userId, event_type: eventType, xp_awarded: xp, metadata: { source: 'quick_capture' } })
    const { data: p } = await supabase.from('profiles').select('xp_total').eq('id', userId).single()
    const newTotal = (p?.xp_total || 0) + xp
    const level = Math.max(1, Math.floor(Math.sqrt(newTotal / 100)))
    await supabase.from('profiles').update({ xp_total: newTotal, level }).eq('id', userId)
  } catch { /* best effort */ }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = user.id

  let text = ''
  try { text = (await request.json())?.text ?? '' } catch { /* ignore */ }
  text = String(text).trim()
  if (!text) return NextResponse.json({ error: 'Empty input' }, { status: 400 })

  // Load the user's context so the model maps to their real records.
  const [cats, wallets, habits] = await Promise.all([
    supabase.from('finance_categories').select('id,name,kind').eq('user_id', userId).eq('is_archived', false),
    supabase.from('finance_accounts').select('id,name').eq('user_id', userId).eq('is_active', true),
    supabase.from('habits').select('id,name').eq('user_id', userId).eq('is_active', true),
  ])
  const ctx: CaptureContext = {
    categories: (cats.data || []) as CaptureContext['categories'],
    wallets: (wallets.data || []) as CaptureContext['wallets'],
    habits: (habits.data || []) as CaptureContext['habits'],
  }

  let intent
  try {
    intent = await parseCapture(text, ctx)
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return NextResponse.json({ error: err.message, code: 'AI_NOT_CONFIGURED' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not parse input' }, { status: 500 })
  }

  try {
    if (intent.module === 'budget') {
      const cat = intent.categoryName
        ? ctx.categories.find(c => c.name.toLowerCase() === intent.categoryName!.toLowerCase() && c.kind === intent.type)
        : undefined
      const wallet = intent.walletName
        ? ctx.wallets.find(w => w.name.toLowerCase() === intent.walletName!.toLowerCase())
        : ctx.wallets[0]
      const { error } = await supabase.from('transactions').insert({
        user_id: userId, type: intent.type, amount: intent.amount,
        category_id: cat?.id ?? null, account_id: wallet?.id ?? null, to_account_id: null,
        txn_date: today(), note: intent.note, recurring_id: null,
      })
      if (error) throw error
      const { count } = await supabase.from('transactions')
        .select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('txn_date', today())
      if ((count || 0) <= 1) await awardXp(supabase, userId, 'finance_log', 3)
      const sign = intent.type === 'income' ? '+' : '−'
      const bits = [cat?.name || 'Uncategorized', wallet?.name].filter(Boolean).join(' · ')
      return NextResponse.json({ ok: true, module: 'budget', detail: `${sign}${formatINR(intent.amount)} · ${bits}` })
    }

    if (intent.module === 'task') {
      const { error } = await supabase.from('tasks').insert({
        user_id: userId, title: intent.title, status: 'todo', priority: 0, scheduled_date: intent.scheduledDate,
      })
      if (error) throw error
      return NextResponse.json({ ok: true, module: 'task', detail: `Task · ${intent.title}${intent.scheduledDate ? ` (${intent.scheduledDate})` : ''}` })
    }

    if (intent.module === 'journal') {
      const { data: existing } = await supabase.from('journal_entries')
        .select('id,reflection').eq('user_id', userId).eq('entry_date', today()).eq('entry_type', 'daily').maybeSingle()
      if (existing) {
        const merged = [existing.reflection, intent.text].filter(Boolean).join('\n')
        await supabase.from('journal_entries').update({ reflection: merged }).eq('id', existing.id)
        return NextResponse.json({ ok: true, module: 'journal', detail: 'Added to today\'s journal' })
      }
      const { error } = await supabase.from('journal_entries').insert({
        user_id: userId, entry_type: 'daily', entry_date: today(), reflection: intent.text, shutdown_done: false,
      })
      if (error) throw error
      await awardXp(supabase, userId, 'journal_entry', 10)
      return NextResponse.json({ ok: true, module: 'journal', detail: 'Journal saved' })
    }

    if (intent.module === 'habit') {
      const habit = ctx.habits.find(h =>
        h.name.toLowerCase() === intent.habitName.toLowerCase() ||
        h.name.toLowerCase().includes(intent.habitName.toLowerCase()) ||
        intent.habitName.toLowerCase().includes(h.name.toLowerCase())
      )
      if (!habit) {
        return NextResponse.json({ ok: false, module: 'unknown', detail: `No matching habit. Active: ${ctx.habits.map(h => h.name).join(', ') || 'none'}` })
      }
      const { data: existing } = await supabase.from('habit_logs')
        .select('id').eq('habit_id', habit.id).eq('log_date', today()).maybeSingle()
      if (existing) {
        await supabase.from('habit_logs').update({ completed: true }).eq('id', existing.id)
      } else {
        await supabase.from('habit_logs').insert({ habit_id: habit.id, user_id: userId, log_date: today(), completed: true })
        await awardXp(supabase, userId, 'habit_complete', 5)
      }
      return NextResponse.json({ ok: true, module: 'habit', detail: `Habit done · ${habit.name}` })
    }

    return NextResponse.json({ ok: false, module: 'unknown', detail: 'Could not understand that. Try "120 chai", "task: submit report", "done gym".' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
