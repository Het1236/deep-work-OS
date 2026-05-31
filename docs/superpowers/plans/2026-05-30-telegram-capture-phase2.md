# Phase 2 — Telegram Capture Brain Implementation Plan

> Execute via superpowers:executing-plans. Verify with `npx tsc --noEmit` + `npm run build` (no test framework).

**Goal:** Message a Telegram bot in plain language and have it land in the right module (budget / task / journal / habit) with a confirmation + Undo button.

**Architecture:** Telegram webhook → Next.js `/api/telegram` route (on Vercel). The route verifies a secret header, resolves the user by `telegram_chat_id`, parses the message with the existing AI provider (Groq) into a structured intent, inserts via a **service-role** Supabase client (server-only), and replies with a confirmation + inline **Undo** button. Account linking uses a one-time code generated in Settings and sent to the bot as `/start <code>`.

**Tech Stack:** Next 16 route handlers · Supabase service-role client · Groq (via `src/lib/ai`) · Telegram Bot API (fetch).

**Spec:** `docs/superpowers/specs/2026-05-30-life-os-upgrade-proposal.md` §6.

> **Runtime testing needs (Het, when back):** create bot via @BotFather → `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME`; pick a `TELEGRAM_WEBHOOK_SECRET`; copy `SUPABASE_SERVICE_ROLE_KEY` from Supabase dashboard; deploy; run `node scripts/set-telegram-webhook.mjs`.

---

## Task 1: Migration — link columns on `profiles`
MCP `apply_migration` name `telegram_link_columns`, project `hwygulsmtanmdovdcozw`:
```sql
alter table public.profiles
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_link_code text,
  add column if not exists telegram_linked_at timestamptz;
create index if not exists idx_profiles_telegram_chat on public.profiles(telegram_chat_id);
create index if not exists idx_profiles_telegram_code on public.profiles(telegram_link_code);
```
Verify with `get_advisors security` (no new warnings expected — RLS already on `profiles`).

## Task 2: Service-role admin client — `src/lib/supabase/admin.ts`
Server-only client using `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS; never imported by client components).
```ts
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin client not configured (missing URL or SUPABASE_SERVICE_ROLE_KEY).')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
```

## Task 3: Telegram API helper — `src/lib/telegram/api.ts`
`sendMessage(chatId, text, buttons?)`, `answerCallbackQuery(id, text?)`, `editMessageText(chatId, messageId, text)`. Reads `TELEGRAM_BOT_TOKEN`. Uses `parse_mode: 'HTML'` and an `escapeHtml` helper. Inline buttons via `reply_markup.inline_keyboard`.

## Task 4: Intent parser — `src/lib/ai/intent.ts`
`parseCapture(message, ctx)` where `ctx = { categories: {id,name,kind}[], wallets: {id,name}[], habits: {id,name}[] }`. Builds a strict-JSON prompt listing the user's real categories/wallets/habits, calls `getAIProvider().complete(..., { json: true })`, returns:
```ts
type CaptureIntent =
  | { module: 'budget'; type: 'expense'|'income'; amount: number; categoryName: string|null; walletName: string|null; note: string|null }
  | { module: 'task'; title: string; scheduledDate: string|null }
  | { module: 'journal'; text: string }
  | { module: 'habit'; habitName: string }
  | { module: 'unknown'; reason: string }
```
Regex fallback: if the model fails/rate-limits and the message matches `^\s*(\d+(?:\.\d+)?)\s+(.+)$`, treat as a budget expense `{ amount, note }`.

## Task 5: Webhook route — `src/app/api/telegram/route.ts`
POST handler:
1. Verify header `x-telegram-bot-api-secret-token === TELEGRAM_WEBHOOK_SECRET` (else 401).
2. Parse update. If `message.text`:
   - `/start <code>` → bind: find profile by `telegram_link_code=code`, set `telegram_chat_id`, `telegram_linked_at`, clear code; reply "🔗 Connected". Plain `/start` or `/help` → instructions.
   - Else resolve user by `telegram_chat_id`; if unlinked → reply how to link. If linked → load ctx (categories/wallets/habits via admin client) → `parseCapture` → insert per module → reply confirmation + inline **Undo** button with `callback_data = u:<kind>:<id>` (kind ∈ tx|task|journal|habit).
3. If `callback_query` with `u:<kind>:<id>` → delete that row (habit → delete habit_log), answer callback, edit message to "↩️ Removed."
4. Always return `200 OK` quickly (Telegram retries on non-200).

Inserts (admin client):
- **budget**: match categoryName→id (case-insensitive, kind matches type), walletName→id; insert `transactions` row (user_id, type, amount, category_id, account_id, txn_date today, note, recurring_id null). Award `finance_log` XP on first today (reuse logic: count today's txns).
- **task**: insert `tasks` (user_id, title, status 'todo', priority 0, scheduled_date).
- **journal**: find today's daily entry; if exists append text to `reflection`, else insert `journal_entries` (entry_type 'daily', entry_date today, reflection text).
- **habit**: fuzzy-match habitName to an active habit; upsert `habit_logs` for today (select existing by habit_id+log_date → update completed true, else insert).

## Task 6: Link API — `src/app/api/telegram/link/route.ts`
- `POST` (authed via `@/lib/supabase/server`): generate 8-char code, store in `profiles.telegram_link_code` for the user, return `{ code, botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null }`.
- `DELETE`: clear `telegram_chat_id` + `telegram_linked_at` (disconnect).
- `GET`: return `{ connected: boolean }` from `telegram_chat_id`.

## Task 7: Settings panel — `src/app/(dashboard)/settings/TelegramConnect.tsx`
Client component: shows connection status (GET), a "Connect Telegram" button that POSTs to get a code, then shows the deep link `https://t.me/<botUsername>?start=<code>` (or manual `/start <code>` instructions if no username), and a Disconnect button. Mount it as a new card in `settings/page.tsx`.

## Task 8: Webhook registration script — `scripts/set-telegram-webhook.mjs`
Reads `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and the public base URL (arg or `NEXT_PUBLIC_APP_URL`); calls Telegram `setWebhook` with `url=<base>/api/telegram` and `secret_token`. Prints result.

## Task 9: Verify & finalize
`npx tsc --noEmit`, `npm run build`, `get_advisors security`. Commit; merge to `main`; push. Leave Het the runtime checklist.
