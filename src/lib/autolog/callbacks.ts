import type { Admin } from './auth'
import type { Transaction } from '@/lib/types'
import { answerCallbackQuery, editMessageText, editMessageReplyMarkup, escapeHtml, type InlineButton } from '@/lib/telegram/api'
import { formatINR, computeDebtStatuses } from '@/lib/finance'
import { loadLedgerContext } from './context'
import { firstNameMatch } from './classify'
import { txButtons } from './notify'

type Callback = { id: string; data?: string; message?: { message_id: number; text?: string; chat: { id: number } } }

const markLogged = (admin: Admin, txId: string) =>
  admin.from('inbound_signals').update({ status: 'logged' }).eq('transaction_id', txId).eq('status', 'needs_review')

// Handles the auto-logging buttons: c/cs = category, r = udhaar, ta = TA salary, w = wallet.
// Returns false for callbacks it doesn't own (e.g. the generic u:<kind>:<id> undo).
export async function handleAutologCallback(admin: Admin, cb: Callback): Promise<boolean> {
  const m = (cb.data || '').match(/^(c|cs|r|ta|w):([0-9a-f-]{36})(?::(.+))?$/)
  if (!m || !cb.message) return false
  const [, action, txId, arg] = m
  const chatId = cb.message.chat.id
  const msgId = cb.message.message_id
  const prevText = escapeHtml(cb.message.text || '')

  const { data: profile } = await admin.from('profiles').select('id').eq('telegram_chat_id', String(chatId)).maybeSingle()
  const { data: txRow } = await admin.from('transactions').select('*').eq('id', txId).maybeSingle()
  const tx = txRow as Transaction | null
  if (!profile || !tx || tx.user_id !== profile.id) { await answerCallbackQuery(cb.id, 'That entry no longer exists'); return true }
  const ctx = await loadLedgerContext(admin, profile.id)

  if (action === 'c' || action === 'cs') {
    const kind = tx.type === 'income' ? 'income' : 'expense'
    const cats = ctx.categories.filter(c => c.kind === kind)
    if (action === 'c') {
      const rows: InlineButton[][] = []
      cats.forEach((c, i) => {
        if (i % 2 === 0) rows.push([])
        rows[rows.length - 1].push({ text: c.name, callback_data: `cs:${txId}:${i}` })
      })
      await editMessageReplyMarkup(chatId, msgId, rows)
      await answerCallbackQuery(cb.id)
      return true
    }
    const cat = cats[Number(arg)]
    if (!cat) { await answerCallbackQuery(cb.id, 'Unknown category'); return true }
    await admin.from('transactions').update({ category_id: cat.id }).eq('id', txId)
    if (tx.merchant) {
      await admin.from('merchant_rules').upsert({ user_id: profile.id, match: tx.merchant, category_id: cat.id }, { onConflict: 'user_id,match' })
    }
    await markLogged(admin, txId)
    await editMessageText(chatId, msgId, `${prevText}\n✅ Category → <b>${escapeHtml(cat.name)}</b>${tx.merchant ? ` · I'll remember "${escapeHtml(tx.merchant)}"` : ''}`, txButtons(txId))
    await answerCallbackQuery(cb.id, 'Saved')
    return true
  }

  if (action === 'r') {
    if (arg !== 'y') {
      await editMessageText(chatId, msgId, `${prevText}\n👍 Kept as income`, txButtons(txId))
      await answerCallbackQuery(cb.id)
      return true
    }
    const debt = computeDebtStatuses(ctx.txns)
      .filter(d => d.direction === 'lent' && d.outstanding > 0 && firstNameMatch(tx.note, d.person))
      .sort((a, b) => a.tx.txn_date.localeCompare(b.tx.txn_date))[0]
    if (!debt) { await answerCallbackQuery(cb.id, 'No open udhaar found'); return true }
    const applied = Math.min(Number(tx.amount), debt.outstanding)
    const extra = Math.round((Number(tx.amount) - applied) * 100) / 100
    // Repayment to me = transfer-style: money comes into the wallet (to_account_id).
    await admin.from('transactions').update({
      type: 'repayment', amount: applied, category_id: null, account_id: null, to_account_id: tx.account_id,
      person: debt.person, parent_tx_id: debt.tx.id,
    }).eq('id', txId)
    if (extra > 0) {
      await admin.from('transactions').insert({
        user_id: profile.id, type: 'income', amount: extra, category_id: tx.category_id, account_id: tx.account_id,
        to_account_id: null, goal_id: null, scope: 'self', txn_date: tx.txn_date, note: `${debt.person}: extra over udhaar`,
        recurring_id: null, source: tx.source ?? 'sms', merchant: tx.merchant ?? null,
      })
    }
    if (applied >= debt.outstanding) await admin.from('transactions').update({ is_settled: true }).eq('id', debt.tx.id)
    await markLogged(admin, txId)
    const left = debt.outstanding - applied
    await editMessageText(chatId, msgId,
      `${prevText}\n✅ ${escapeHtml(debt.person)} paid back ${formatINR(applied)}${left > 0 ? ` · ${formatINR(left)} still due` : ' · settled 🎉'}`,
      [[{ text: '↩️ Undo', callback_data: `u:tx:${txId}` }]])
    await answerCallbackQuery(cb.id, 'Recorded as repayment')
    return true
  }

  if (action === 'ta') {
    if (tx.merchant && tx.category_id) {
      await admin.from('merchant_rules').upsert({ user_id: profile.id, match: tx.merchant, category_id: tx.category_id }, { onConflict: 'user_id,match' })
    }
    await markLogged(admin, txId)
    await editMessageText(chatId, msgId, `${prevText}\n✅ TA salary. Future ones will log automatically.`, txButtons(txId))
    await answerCallbackQuery(cb.id, 'Saved')
    return true
  }

  if (action === 'w') {
    const wallet = ctx.wallets[Number(arg)]
    if (!wallet) { await answerCallbackQuery(cb.id, 'Unknown wallet'); return true }
    await admin.from('transactions').update({ account_id: wallet.id }).eq('id', txId)
    await markLogged(admin, txId)
    await editMessageText(chatId, msgId, `${prevText}\n✅ Paid from <b>${escapeHtml(wallet.name)}</b>`, txButtons(txId))
    await answerCallbackQuery(cb.id, 'Saved')
    return true
  }
  return false
}
