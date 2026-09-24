import { sendMessage, type InlineButton } from '@/lib/telegram/api'

export function txButtons(txId: string, extra: InlineButton[][] = []): InlineButton[][] {
  return [...extra, [{ text: '✏️ Category', callback_data: `c:${txId}` }, { text: '↩️ Undo', callback_data: `u:tx:${txId}` }]]
}

// A Telegram outage must never fail an ingest.
export async function notify(chatId: string, text: string, buttons?: InlineButton[][]) {
  try { await sendMessage(chatId, text, buttons) } catch (e) { console.error('autolog notify failed', e) }
}
