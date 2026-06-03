import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseCapture, type CaptureContext } from '@/lib/ai/intent'
import { sendMessage, editMessageText, answerCallbackQuery, escapeHtml, type InlineButton } from '@/lib/telegram/api'

// Telegram delivers updates here. Always reply 200 fast (Telegram retries otherwise).

const today = () => new Date().toISOString().split('T')[0]
const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = ReturnType<typeof createAdminClient>

function undoButton(kind: 'tx' | 'task' | 'journal' | 'habit', id: string): InlineButton[][] {
  return [[{ text: '↩️ Undo', callback_data: `u:${kind}:${id}` }]]
}

async function awardXp(admin: Admin, userId: string, eventType: string, xp: number) {
  try {
    await admin.from('xp_events').insert({ user_id: userId, event_type: eventType, xp_awarded: xp, metadata: { source: 'telegram' } })
    const { data: p } = await admin.from('profiles').select('xp_total').eq('id', userId).single()
    const newTotal = (p?.xp_total || 0) + xp
    const level = Math.max(1, Math.floor(Math.sqrt(newTotal / 100)))
    await admin.from('profiles').update({ xp_total: newTotal, level }).eq('id', userId)
  } catch {
    /* XP is best-effort */
  }
}

async function loadContext(admin: Admin, userId: string): Promise<CaptureContext> {
  const [cats, wallets, habits, projects] = await Promise.all([
    admin.from('finance_categories').select('id,name,kind').eq('user_id', userId).eq('is_archived', false),
    admin.from('finance_accounts').select('id,name').eq('user_id', userId).eq('is_active', true),
    admin.from('habits').select('id,name').eq('user_id', userId).eq('is_active', true),
    admin.from('projects').select('id,title').eq('user_id', userId).neq('status', 'archived'),
  ])
  return {
    categories: (cats.data || []) as CaptureContext['categories'],
    wallets: (wallets.data || []) as CaptureContext['wallets'],
    habits: (habits.data || []) as CaptureContext['habits'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projects: ((projects.data || []) as any[]).map(p => ({ id: p.id, name: p.title })),
  }
}

async function handleCapture(admin: Admin, userId: string, chatId: number, text: string) {
  const ctx = await loadContext(admin, userId)
  const intent = await parseCapture(text, ctx)

  if (intent.module === 'budget') {
    const cat = intent.categoryName
      ? ctx.categories.find((c) => c.name.toLowerCase() === intent.categoryName!.toLowerCase() && c.kind === intent.type)
      : undefined
    const wallet = intent.walletName
      ? ctx.wallets.find((w) => w.name.toLowerCase() === intent.walletName!.toLowerCase())
      : ctx.wallets[0]

    const { data, error } = await admin.from('transactions').insert({
      user_id: userId,
      type: intent.type,
      amount: intent.amount,
      category_id: cat?.id ?? null,
      account_id: wallet?.id ?? null,
      to_account_id: null,
      txn_date: today(),
      note: intent.note,
      recurring_id: null,
    }).select('id').single()
    if (error || !data) { await sendMessage(chatId, '⚠️ Could not save that transaction.'); return }

    // first-of-day finance XP
    const { count } = await admin.from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('txn_date', today())
    if ((count || 0) <= 1) await awardXp(admin, userId, 'finance_log', 3)

    const sign = intent.type === 'income' ? '+' : '−'
    const bits = [cat?.name || 'Uncategorized', wallet?.name].filter(Boolean).join(' · ')
    await sendMessage(chatId, `✅ <b>${sign}${inr(intent.amount)}</b> · ${escapeHtml(bits)}${intent.note ? `\n📝 ${escapeHtml(intent.note)}` : ''}`, undoButton('tx', data.id))
    return
  }

  if (intent.module === 'task') {
    const project = intent.projectName
      ? ctx.projects.find(p => p.name.toLowerCase() === intent.projectName!.toLowerCase() || p.name.toLowerCase().includes(intent.projectName!.toLowerCase()) || intent.projectName!.toLowerCase().includes(p.name.toLowerCase()))
      : undefined
    const { data, error } = await admin.from('tasks').insert({
      user_id: userId,
      title: intent.title,
      status: 'todo',
      priority: 0,
      project_id: project?.id ?? null,
      scheduled_date: intent.scheduledDate,
    }).select('id').single()
    if (error || !data) { await sendMessage(chatId, '⚠️ Could not save that task.'); return }
    const extra = [project ? `→ ${project.name}` : '', intent.scheduledDate ? `(${intent.scheduledDate})` : ''].filter(Boolean).join(' ')
    await sendMessage(chatId, `📋 Task added: <b>${escapeHtml(intent.title)}</b>${extra ? ` ${escapeHtml(extra)}` : ''}`, undoButton('task', data.id))
    return
  }

  if (intent.module === 'journal') {
    const { data: existing } = await admin.from('journal_entries')
      .select('id,reflection').eq('user_id', userId).eq('entry_date', today()).eq('entry_type', 'daily').maybeSingle()
    if (existing) {
      const merged = [existing.reflection, intent.text].filter(Boolean).join('\n')
      await admin.from('journal_entries').update({ reflection: merged }).eq('id', existing.id)
      await sendMessage(chatId, '📓 Added to today\'s journal.')
    } else {
      const { data, error } = await admin.from('journal_entries').insert({
        user_id: userId, entry_type: 'daily', entry_date: today(), reflection: intent.text, shutdown_done: false,
      }).select('id').single()
      if (error || !data) { await sendMessage(chatId, '⚠️ Could not save that note.'); return }
      await awardXp(admin, userId, 'journal_entry', 10)
      await sendMessage(chatId, '📓 Journal saved.', undoButton('journal', data.id))
    }
    return
  }

  if (intent.module === 'habit') {
    const habit = ctx.habits.find((h) =>
      h.name.toLowerCase() === intent.habitName.toLowerCase() ||
      h.name.toLowerCase().includes(intent.habitName.toLowerCase()) ||
      intent.habitName.toLowerCase().includes(h.name.toLowerCase())
    )
    if (!habit) {
      await sendMessage(chatId, `🤔 Which habit? Your active ones: ${ctx.habits.map((h) => h.name).join(', ') || '(none yet)'}`)
      return
    }
    const { data: existing } = await admin.from('habit_logs')
      .select('id').eq('habit_id', habit.id).eq('log_date', today()).maybeSingle()
    let logId = existing?.id as string | undefined
    if (existing) {
      await admin.from('habit_logs').update({ completed: true }).eq('id', existing.id)
    } else {
      const { data } = await admin.from('habit_logs').insert({
        habit_id: habit.id, user_id: userId, log_date: today(), completed: true,
      }).select('id').single()
      logId = data?.id
      await awardXp(admin, userId, 'habit_complete', 5)
    }
    await sendMessage(chatId, `✅ Habit done: <b>${escapeHtml(habit.name)}</b>`, logId ? undoButton('habit', logId) : undefined)
    return
  }

  await sendMessage(chatId, `🤔 I didn't catch that. Try things like:\n• <code>120 chai</code>\n• <code>got 5000 allowance</code>\n• <code>task: submit assignment</code>\n• <code>journal: rough day but gym done</code>\n• <code>done meditation</code>`)
}

async function handleLink(admin: Admin, code: string, chatId: number) {
  const { data: profile } = await admin.from('profiles').select('id').eq('telegram_link_code', code).maybeSingle()
  if (!profile) { await sendMessage(chatId, '❌ That link code is invalid or expired. Generate a fresh one in Life OS → Settings.'); return }
  await admin.from('profiles').update({
    telegram_chat_id: String(chatId), telegram_linked_at: new Date().toISOString(), telegram_link_code: null,
  }).eq('id', profile.id)
  await sendMessage(chatId, '🔗 <b>Connected!</b> Now just message me your spends, tasks, journal notes or habits and I\'ll log them.\n\nTry: <code>120 chai</code>')
}

const HELP = `👋 <b>Life OS capture bot</b>\nSend me a quick message and I\'ll log it:\n• <code>120 chai</code> — expense\n• <code>got 5000 allowance</code> — income\n• <code>task: submit DSA assignment</code>\n• <code>journal: productive day</code>\n• <code>done gym</code> — habit\n\nNot connected yet? Open Life OS → Settings → Connect Telegram.`

export async function POST(request: Request) {
  // Verify the secret token Telegram echoes back.
  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let update: Record<string, unknown>
  try { update = await request.json() } catch { return NextResponse.json({ ok: true }) }

  try {
    const admin = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = (update as any).message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callback = (update as any).callback_query

    if (callback) {
      const data: string = callback.data || ''
      const chatId: number = callback.message?.chat?.id
      const messageId: number = callback.message?.message_id
      const m = data.match(/^u:(tx|task|journal|habit):(.+)$/)
      if (m) {
        const kind = m[1]
        const id = m[2]
        const table = kind === 'tx' ? 'transactions' : kind === 'task' ? 'tasks' : kind === 'journal' ? 'journal_entries' : 'habit_logs'
        await admin.from(table).delete().eq('id', id)
        await answerCallbackQuery(callback.id, 'Removed')
        if (chatId && messageId) await editMessageText(chatId, messageId, '↩️ Removed.')
      } else {
        await answerCallbackQuery(callback.id)
      }
      return NextResponse.json({ ok: true })
    }

    if (message?.text) {
      const text: string = message.text.trim()
      const chatId: number = message.chat.id

      if (text.startsWith('/start')) {
        const code = text.split(/\s+/)[1]
        if (code) await handleLink(admin, code, chatId)
        else await sendMessage(chatId, HELP)
        return NextResponse.json({ ok: true })
      }
      if (text === '/help') { await sendMessage(chatId, HELP); return NextResponse.json({ ok: true }) }

      const { data: profile } = await admin.from('profiles').select('id').eq('telegram_chat_id', String(chatId)).maybeSingle()
      if (!profile) {
        await sendMessage(chatId, '🔌 You\'re not connected yet. Open <b>Life OS → Settings → Connect Telegram</b> to link your account.')
        return NextResponse.json({ ok: true })
      }
      await handleCapture(admin, profile.id, chatId, text)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    return NextResponse.json({ ok: true }) // swallow to avoid Telegram retry storms
  }
}
