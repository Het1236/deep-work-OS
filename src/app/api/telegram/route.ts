import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyCapture } from '@/lib/capture/apply'
import { sendMessage, answerCallbackQuery, escapeHtml, type InlineButton } from '@/lib/telegram/api'

// Telegram delivers updates here. Always reply 200 fast (Telegram retries otherwise).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = ReturnType<typeof createAdminClient>

const UNDO_TABLE: Record<string, string> = {
  tx: 'transactions', task: 'tasks', journal: 'journal_entries', habit: 'habit_logs',
  savings: 'savings_contributions', project: 'projects', goal: 'savings_goals', meal: 'meals',
}

async function handleCapture(admin: Admin, userId: string, chatId: number, text: string) {
  const { results } = await applyCapture(admin, userId, text)
  const lines = results.map(r => `${r.ok ? '✅' : '⚠️'} ${escapeHtml(r.detail)}`)
  const buttons: InlineButton[][] = results
    .filter(r => r.undo)
    .map(r => [{ text: `↩️ Undo ${r.module.replace('_', ' ')}`, callback_data: `u:${r.undo!.kind}:${r.undo!.id}` }])
  await sendMessage(chatId, lines.join('\n') || '🤔 Couldn\'t parse that — try again.', buttons.length ? buttons : undefined)
}

async function handleLink(admin: Admin, code: string, chatId: number) {
  const { data: profile } = await admin.from('profiles').select('id').eq('telegram_link_code', code).maybeSingle()
  if (!profile) { await sendMessage(chatId, '❌ That link code is invalid or expired. Generate a fresh one in Life OS → Settings.'); return }
  await admin.from('profiles').update({
    telegram_chat_id: String(chatId), telegram_linked_at: new Date().toISOString(), telegram_link_code: null,
  }).eq('id', profile.id)
  await sendMessage(chatId, '🔗 <b>Connected!</b> Message me anything — even several things at once.\n\nTry: <code>allowance 500, 120 chai both from cash</code>')
}

const HELP = `👋 <b>Life OS capture bot</b>\nMessage me in plain English — one thing or many at once:\n• <code>120 chai</code> — expense\n• <code>allowance 500 from dad, 420 fuel both from cash</code> — multiple\n• <code>move 1000 from Bank to Cash</code> — transfer\n• <code>add 500 to Goa trip</code> — savings\n• <code>budget 3000 for Food</code> — set a budget\n• <code>task: fix login bug for Website</code> — task to a project\n• <code>done gym</code> · <code>journal: great day</code>\n\nNot connected? Open Life OS → Settings → Connect Telegram.`

export async function POST(request: Request) {
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
      const m = data.match(/^u:([a-z]+):(.+)$/)
      if (m && UNDO_TABLE[m[1]]) {
        await admin.from(UNDO_TABLE[m[1]]).delete().eq('id', m[2])
        await answerCallbackQuery(callback.id, 'Removed ✅')
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
    return NextResponse.json({ ok: true })
  }
}
