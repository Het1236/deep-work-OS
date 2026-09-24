import type { Admin } from './auth'
import type { Transaction } from '@/lib/types'
import { escapeHtml, type InlineButton } from '@/lib/telegram/api'
import { formatINR } from '@/lib/finance'
import { platformFrom, regexOrderTotal } from './parse'
import { matchRule } from './classify'
import { aiParseOrder, type ParsedOrder } from './ai'
import { loadLedgerContext } from './context'
import { notify, txButtons } from './notify'

export type EmailIn = { id: string; from: string; subject: string; date: string; body_text: string }

const GRACE_MS = 2 * 60 * 60_000
const WINDOW_MS = 30 * 60_000
const istDate = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const itemsLine = (o: ParsedOrder) =>
  o.items.length ? o.items.slice(0, 4).map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') + (o.items.length > 4 ? '…' : '') : ''

export async function ingestEmails(admin: Admin, userId: string, chatId: string, messages: EmailIn[]): Promise<void> {
  for (const m of messages) {
    const { data: sig, error } = await admin.from('inbound_signals').insert({
      user_id: userId, kind: 'email', external_id: m.id, sender: m.from, subject: m.subject,
      body: m.body_text.slice(0, 15000), received_at: m.date, status: 'needs_review',
    }).select('id').single()
    if (error) { if (error.code === '23505') continue; throw error }

    const platform = platformFrom(m.from)
    let order: ParsedOrder | null
    try {
      order = await aiParseOrder(m.from, m.subject, m.body_text, platform)
    } catch (e) {
      // Keep the AI error visible even when the regex rescues the total.
      await admin.from('inbound_signals').update({ error: `AI parse failed: ${e}` }).eq('id', sig.id)
      const total = regexOrderTotal(m.body_text)
      order = total ? { platform, orderId: null, total, items: [] } : null
      if (!order) continue
    }
    await admin.from('inbound_signals').update(order
      ? { parsed: order, status: 'pending_match' }
      : { status: 'ignored' }).eq('id', sig.id)
  }
  await sweepPendingEmails(admin, userId, chatId)
}

// Pending order emails either enrich a matching SMS expense, or after 2h become their own expense.
export async function sweepPendingEmails(admin: Admin, userId: string, chatId: string): Promise<void> {
  const { data: pending } = await admin.from('inbound_signals').select('id,received_at,parsed')
    .eq('user_id', userId).eq('status', 'pending_match').order('received_at')
  if (!pending?.length) return
  const ctx = await loadLedgerContext(admin, userId)
  const miscId = ctx.categories.find(c => c.kind === 'expense' && c.name === 'Misc')?.id ?? null

  for (const s of pending) {
    const order = s.parsed as ParsedOrder
    const at = new Date(s.received_at).getTime()
    const rule = matchRule(order.platform, ctx.rules)
    const ruleCat = rule && ctx.categories.find(c => c.id === rule.category_id && c.kind === 'expense') ? rule.category_id : null
    const details = { platform: order.platform, order_id: order.orderId, items: order.items }

    const { data: cands } = await admin.from('transactions').select('*')
      .eq('user_id', userId).eq('source', 'sms').eq('type', 'expense').is('details', null)
      .gte('amount', order.total - 1).lte('amount', order.total + 1)
      .gte('created_at', new Date(at - WINDOW_MS).toISOString()).lte('created_at', new Date(at + WINDOW_MS).toISOString())
      .order('created_at').limit(1)
    const match = cands?.[0] as Transaction | undefined

    if (match) {
      const patch: Record<string, unknown> = { details, merchant: order.platform }
      if (ruleCat && (!match.category_id || match.category_id === miscId)) patch.category_id = ruleCat
      await admin.from('transactions').update(patch).eq('id', match.id)
      await admin.from('inbound_signals').update({ status: 'enriched', transaction_id: match.id }).eq('id', s.id)
      await admin.from('inbound_signals').update({ status: 'logged' }).eq('transaction_id', match.id).eq('status', 'needs_review')
      const line = itemsLine(order)
      await notify(chatId, `✉️ ${formatINR(match.amount, true)} is <b>${escapeHtml(order.platform)}</b>${line ? `: ${escapeHtml(line)}` : ''}`)
      continue
    }
    if (Date.now() - at < GRACE_MS) continue

    // No bank SMS ever came: wallet/card/Amazon Pay spend. Default to Kalupur, ask which wallet.
    const primary = ctx.wallets.find(w => w.account_last4 === '2270') ?? ctx.wallets[0]
    if (!primary) continue
    const { data: tx, error } = await admin.from('transactions').insert({
      user_id: userId, type: 'expense', amount: order.total, category_id: ruleCat ?? miscId,
      account_id: primary.id, to_account_id: null, goal_id: null, scope: 'self', txn_date: istDate(at),
      note: `${order.platform} order`, recurring_id: null, source: 'email', merchant: order.platform, details,
    }).select('id').single()
    if (error || !tx) { await admin.from('inbound_signals').update({ status: 'needs_review', error: String(error?.message) }).eq('id', s.id); continue }
    await admin.from('inbound_signals').update({ status: 'needs_review', transaction_id: tx.id }).eq('id', s.id)
    const walletRow: InlineButton[] = ctx.wallets.slice(0, 4).map((w, i) => ({ text: w.name, callback_data: `w:${tx.id}:${i}` }))
    const line = itemsLine(order)
    await notify(chatId,
      `✉️ ${formatINR(order.total, true)} · <b>${escapeHtml(order.platform)}</b>${line ? `: ${escapeHtml(line)}` : ''}\nNo bank SMS matched. Logged to ${escapeHtml(primary.name)}. Which wallet paid?`,
      txButtons(tx.id, [walletRow]))
  }
}
