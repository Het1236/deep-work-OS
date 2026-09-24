import type { Admin } from './auth'
import type { SignalStatus, Transaction } from '@/lib/types'
import { escapeHtml, type InlineButton } from '@/lib/telegram/api'
import { accountBalance, formatINR } from '@/lib/finance'
import { detectBank, isNoise, parseBankSms, type ParsedSms } from './parse'
import { classify, walletFor } from './classify'
import { aiParseSms } from './ai'
import { loadLedgerContext } from './context'
import { notify, txButtons } from './notify'
import { sweepPendingEmails } from './email'

export type IngestResult = { status: SignalStatus; transactionId?: string }

export async function ingestSms(admin: Admin, userId: string, chatId: string, sender: string, body: string): Promise<IngestResult> {
  // Store raw first: whatever happens next, the message is never lost.
  const { data: sig, error } = await admin.from('inbound_signals')
    .insert({ user_id: userId, kind: 'sms', sender, body, status: 'needs_review' }).select('id').single()
  if (error || !sig) throw error || new Error('signal insert failed')
  const setSig = async (patch: Record<string, unknown>) => { await admin.from('inbound_signals').update(patch).eq('id', sig.id) }

  try {
    return await processSms(admin, userId, chatId, body, setSig)
  } catch (e) {
    console.error('ingestSms failed', e)
    await setSig({ status: 'needs_review', error: String(e) })
    await notify(chatId, '⚠️ A bank SMS couldn\'t be auto-logged. It\'s waiting in the Review inbox on the Budget page.')
    return { status: 'needs_review' }
  }
}

async function processSms(
  admin: Admin, userId: string, chatId: string, body: string,
  setSig: (patch: Record<string, unknown>) => Promise<void>,
): Promise<IngestResult> {
  const bank = detectBank(body)
  if (!bank || isNoise(body)) { await setSig({ status: 'ignored' }); return { status: 'ignored' } }

  let parsed: ParsedSms | null = parseBankSms(body)
  if (!parsed) {
    parsed = await aiParseSms(body, bank)
    if (!parsed) { await setSig({ status: 'ignored', error: 'AI: not a transaction' }); return { status: 'ignored' } }
  }
  await setSig({ parsed })

  if (parsed.ref) {
    const { data: dup } = await admin.from('transactions').select('id').eq('user_id', userId).eq('bank_ref', parsed.ref).maybeSingle()
    if (dup) { await setSig({ status: 'duplicate', transaction_id: dup.id }); return { status: 'duplicate', transactionId: dup.id } }
  }

  const ctx = await loadLedgerContext(admin, userId)
  const wallet = walletFor(ctx.wallets, parsed.last4)

  // Self-transfer: the opposite leg of the same amount on my other bank within 15 min.
  if (wallet) {
    const others = ctx.wallets.filter(w => w.account_last4 && w.id !== wallet.id).map(w => w.id)
    if (others.length) {
      const { data: legs } = await admin.from('transactions').select('*')
        .eq('user_id', userId).eq('source', 'sms').eq('amount', parsed.amount)
        .eq('type', parsed.direction === 'credit' ? 'expense' : 'income')
        .in('account_id', others)
        .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
        .order('created_at', { ascending: false }).limit(1)
      const leg = legs?.[0] as Transaction | undefined
      if (leg) {
        const from = parsed.direction === 'credit' ? leg.account_id! : wallet.id
        const to = parsed.direction === 'credit' ? wallet.id : leg.account_id!
        await admin.from('transactions').update({
          type: 'transfer', account_id: from, to_account_id: to, category_id: null, merchant: null, note: 'Self transfer',
        }).eq('id', leg.id)
        await admin.from('inbound_signals').update({ status: 'logged' }).eq('transaction_id', leg.id)
        await setSig({ status: 'logged', transaction_id: leg.id })
        const name = (id: string) => escapeHtml(ctx.wallets.find(w => w.id === id)?.name ?? '?')
        await notify(chatId, `🔁 Self-transfer ${formatINR(parsed.amount, true)} · ${name(from)} → ${name(to)}`,
          [[{ text: '↩️ Undo', callback_data: `u:tx:${leg.id}` }]])
        return { status: 'logged', transactionId: leg.id }
      }
    }
  }

  const d = classify(parsed, body, ctx)
  if (d.kind === 'review') {
    await setSig({ error: d.reason })
    await notify(chatId, `⚠️ ${escapeHtml(d.reason)}: ${formatINR(parsed.amount, true)} ${parsed.direction}. Check the Review inbox.`)
    return { status: 'needs_review' }
  }

  const { data: tx, error: txErr } = await admin.from('transactions').insert({
    user_id: userId, type: d.type, amount: parsed.amount, category_id: d.categoryId,
    account_id: d.accountId, to_account_id: d.toAccountId, goal_id: null, scope: 'self',
    txn_date: parsed.date, note: d.note, recurring_id: null,
    source: 'sms', merchant: d.merchant, bank_ref: parsed.ref, details: null,
  }).select('*').single()
  if (txErr) {
    if (txErr.code === '23505') { await setSig({ status: 'duplicate' }); return { status: 'duplicate' } }
    throw txErr
  }
  const status: SignalStatus = d.needsReview ? 'needs_review' : 'logged'
  await setSig({ status, transaction_id: tx.id })

  // Balance drift check against the bank's own number.
  let warn = ''
  const acct = ctx.wallets.find(w => w.id === d.accountId)
  if (parsed.balance != null && acct) {
    const computed = accountBalance(acct, [...ctx.txns, tx as Transaction])
    const diff = Math.round((parsed.balance - computed) * 100) / 100
    if (Math.abs(diff) > 1) warn = `\n⚠️ Bank says ${formatINR(parsed.balance, true)}, Life OS shows ${formatINR(computed, true)} (off by ${formatINR(diff, true)})`
  }

  const catName = ctx.categories.find(c => c.id === d.categoryId)?.name ?? (d.type === 'transfer' ? 'Cash' : 'Uncategorised')
  const who = parsed.counterparty ?? parsed.narration ?? ''
  let text = `📱 ${d.type === 'income' ? '+' : ''}${formatINR(parsed.amount, true)} · ${escapeHtml(acct?.name ?? '')}${who ? ` · ${escapeHtml(who)}` : ''} → <b>${escapeHtml(catName)}</b>${warn}`
  const extra: InlineButton[][] = []
  if (d.udhaar) {
    text += `\n🤝 Looks like ${escapeHtml(d.udhaar.person)} may be repaying ${formatINR(d.udhaar.outstanding)} udhaar.`
    extra.push([{ text: '✅ Yes, repayment', callback_data: `r:${tx.id}:y` }, { text: '❌ No', callback_data: `r:${tx.id}:n` }])
  }
  if (d.askTa) {
    text += '\n🎓 Is this your TA salary?'
    extra.push([{ text: '✅ Yes, TA salary', callback_data: `ta:${tx.id}` }])
  }
  if (d.needsReview) text += '\n❓ Pick a category and I\'ll remember it.'
  await notify(chatId, text, d.type === 'transfer' ? [[{ text: '↩️ Undo', callback_data: `u:tx:${tx.id}` }]] : txButtons(tx.id, extra))

  await sweepPendingEmails(admin, userId, chatId)
  return { status, transactionId: tx.id }
}
