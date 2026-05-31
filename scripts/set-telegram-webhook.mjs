// Registers the Telegram webhook. Run after deploying + setting env.
// Usage: node scripts/set-telegram-webhook.mjs https://your-app.vercel.app
//   (base URL falls back to NEXT_PUBLIC_APP_URL). Reads .env.local for tokens.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const env = {}
try {
  const raw = readFileSync(join(here, '..', '.env.local'), 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
} catch { /* no .env.local — rely on process.env */ }

const get = (k) => process.env[k] || env[k]

const token = get('TELEGRAM_BOT_TOKEN')
const secret = get('TELEGRAM_WEBHOOK_SECRET')
const base = process.argv[2] || get('NEXT_PUBLIC_APP_URL')

if (!token) { console.error('Missing TELEGRAM_BOT_TOKEN'); process.exit(1) }
if (!secret) { console.error('Missing TELEGRAM_WEBHOOK_SECRET'); process.exit(1) }
if (!base) { console.error('Provide the public base URL as an argument or set NEXT_PUBLIC_APP_URL'); process.exit(1) }

const url = `${base.replace(/\/$/, '')}/api/telegram`
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url, secret_token: secret, allowed_updates: ['message', 'callback_query'] }),
})
const data = await res.json()
console.log('setWebhook ->', JSON.stringify(data))
console.log('webhook url:', url)
