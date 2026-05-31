// Minimal Telegram Bot API helper (server-only). Reads TELEGRAM_BOT_TOKEN.

export type InlineButton = { text: string; callback_data: string }

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set')
  return t
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function call(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json().catch(() => ({}))
}

export async function sendMessage(chatId: number | string, text: string, buttons?: InlineButton[][]) {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  })
}

export async function editMessageText(chatId: number | string, messageId: number, text: string) {
  return call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
  })
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return call('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) })
}
