# Life OS — Full Upgrade Proposal & Roadmap

**Date:** 2026-05-30
**Author:** Het (with Claude)
**Status:** Approved direction; phasing refined

---

## 1. Vision

**Today:** "Deep Work OS" is a desktop-first life tracker you must open and type into. Powerful, but passive capture is impossible, it lives on a laptop, and **its AI features are currently non-functional** (provider/key not wired through cleanly).

**Target:** a **phone-capturable, PC-first, AI-native personal Life OS** that:
- captures your life from anywhere (a Telegram message, a home-screen tap),
- understands plain language (an LLM parses "120 chai" into a categorized expense),
- connects every module into one intelligence brain, and
- coaches you with weekly insights and alerts —
all on **strictly free** infrastructure.

**Audience:** just you — a personal power tool. **Visual priority: PC first, then mobile-friendly.** (Phone *capture* via Telegram is still a top feature; the *visual redesign* optimizes desktop first, then makes every screen responsive.)

---

## 2. The Free Stack

| Concern | Service | Free-tier reality |
|---|---|---|
| Database + Auth + Edge Functions | **Supabase** (already used) | 500MB DB, plenty for personal use |
| Web hosting + serverless API routes | **Vercel Hobby** | Free; public HTTPS URL (needed for Telegram + phone access) |
| Phone capture | **Telegram Bot API** | Completely free, instant, works everywhere |
| AI (parsing + insights) | **Google Gemini** *(default)* or **Groq** *(alt)* | Both have free tiers; behind one provider abstraction |
| Installable phone app | **PWA** (web standard) | Free; no app store |
| UI/UX design language | **Anthropic/Claude design** via `frontend-design` skill | Free; applied during the redesign phase |

No new paid services. Constraint: **strictly free tiers only.**

### 2.1 AI provider decision
The current AI Report does not work because the provider call/key is not cleanly wired. We will build a small **provider abstraction** (`src/lib/ai/`) with one interface and two adapters:
- **Gemini** (default) — your `GEMINI_API_KEY` slot already exists; strong JSON mode; generous free tier.
- **Groq** (alternative) — free, very fast; drop-in by setting `GROQ_API_KEY` and a config flag.

Switching providers = one env var. **Claude will ask Het for the chosen key at the start of the AI Foundation phase.**

---

## 3. Roadmap — Phased

Each phase is an independent spec → plan → build cycle and delivers standalone value. Order:

| Phase | Name | Outcome | Depends on |
|---|---|---|---|
| **0** | Deploy + Mobile Foundation | App live on Vercel; installable PWA on phone; `middleware`→`proxy` cleanup | — |
| **1** | AI Foundation (cleanup) | Clean `src/lib/ai/` provider abstraction (Gemini/Groq); the existing AI Report fixed and working | 0 |
| **2** | Telegram Capture Brain ⭐ | Message a bot → LLM parses → lands in budget/tasks/journal/habits with confirm+fix reply | 0, 1 |
| **3** | Visual & UX Redesign | Anthropic/Claude design language; **PC-first** then responsive; ⌘K palette; light/dark; motion polish | 0 |
| **4** | AI Intelligence Layer | In-app natural-language entry; weekly AI coach; anomaly alerts; forecasts | 1, 2 |
| **5** | Unified Life Insights | Cross-module correlation brain (deep work × habits × money × goals); unified timeline; life-score | all |

This doc details **#0, #1, #2** (the first buildable chunk). #3–#5 are summarized; each gets its own full spec when reached.

---

## 4. Phase 0 — Deploy + Mobile Foundation

**Goal:** Public HTTPS URL + installable on your phone.

### 4.1 Deploy to Vercel (free hobby)
- Connect the GitHub repo to Vercel; Next.js 16 auto-detected.
- Env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL` (= Vercel domain). (#1/#2 add AI + Telegram + service-role vars.)
- Add the Vercel domain to Supabase auth redirect URLs.
- **Cleanup:** the build warns `middleware` is deprecated in favor of `proxy` — migrate it here so deploys are warning-free.

### 4.2 PWA (installable, offline shell)
- `app/manifest` (Next 16 metadata route): name "Life OS", short_name, dark theme/background colors, `display: standalone`, icons (192/512 + maskable + apple-touch-icon).
- Generate icon set from a simple logo mark.
- Minimal hand-rolled service worker for installability + offline fallback shell (avoid `next-pwa`; it lags Next 16/Turbopack). Cache the app shell only; never cache authed API/data responses.
- Correct mobile viewport meta; guarantee core pages are *usable* (not yet polished) at 390px. Full responsive polish is Phase 3.
- Dismissible "Add to Home Screen" hint on mobile.

> **Next 16 caveat:** per `AGENTS.md`, consult `node_modules/next/dist/docs/` for current manifest/metadata + service-worker + `proxy` APIs before coding.

**Done when:** you open the Vercel URL on your phone, install it to the home screen, and it launches full-screen and logs in.

---

## 5. Phase 1 — AI Foundation (cleanup)

**Goal:** Make AI actually work, with a clean, reusable structure everything else builds on.

### 5.1 Provider abstraction
- New module `src/lib/ai/`:
  - `types.ts` — `AIMessage`, `AICompletionOptions` (incl. `json: true` for structured output), `AIProvider` interface (`complete(messages, options): Promise<string>`).
  - `gemini.ts` — adapter calling the Gemini REST API with `GEMINI_API_KEY`; supports JSON-mode responses.
  - `groq.ts` — adapter calling Groq's OpenAI-compatible endpoint with `GROQ_API_KEY`.
  - `index.ts` — `getAIProvider()` reads `AI_PROVIDER` env (`'gemini'|'groq'`, default `gemini`) and returns the adapter; throws a clear, actionable error if the key is missing.
- Server-only (never imported by client components). No SDK lock-in — plain `fetch`, so it stays free and dependency-light.

### 5.2 Fix the AI Report
- Rework `src/app/api/ai-report/route.ts` to call `getAIProvider().complete(...)` instead of whatever half-wired path exists now.
- Graceful failure: if no key/quota, return a clear message the UI can show (not a crash).
- Keep the existing data-gathering; just route the model call through the abstraction. Cache the generated report (it already persists to `ai_reports`) so we don't burn quota on repeat views.

### 5.3 Key handoff
- **Claude asks Het for the Gemini (or Groq) key at the start of this phase.** Het sets it locally (`.env.local`) and in Vercel. Until then, the abstraction returns the graceful "AI not configured" state.

**Done when:** AI Report generates a real report on PC, and the provider can be swapped Gemini↔Groq via one env var.

---

## 6. Phase 2 — Telegram Capture Brain ⭐

**Goal:** From your phone, message a Telegram bot in plain language; it lands in the right module with a confirmation you can quickly fix.

**Captures:** Budget (priority), Tasks, Journal, Habits. **Behavior:** confirm + one-tap fix.

### 6.1 Architecture (Approach A — chosen)
```
You (Telegram on phone) ── "120 chai" ──► Telegram Bot API
        └─ webhook ─► Next.js API route /api/telegram (Vercel)
                 1. verify secret header
                 2. resolve user by chat_id
                 3. getAIProvider().complete(...) → intent JSON   (reuses Phase 1)
                 4. map names → ids (user's categories/wallets/habits/lists)
                 5. insert via Supabase service-role client (server-only)
                 6. reply: "✅ ₹120 · Food · Cash  [Category▸][Wallet▸][Undo]"
```
One repo; reuses the Phase 1 AI abstraction + Supabase. The bot writes on your behalf via a **service-role key kept server-side only**.

### 6.2 Account linking (one-time)
- `profiles` gains: `telegram_chat_id text`, `telegram_link_code text`, `telegram_linked_at timestamptz`; index on `telegram_chat_id`.
- **Settings** shows a "Connect Telegram" panel: generates a short code + deep link `https://t.me/<bot>?start=<code>`. You tap → send `/start <code>` → webhook binds chat_id to your user, clears code, replies "🔗 Connected." Unlink clears `telegram_chat_id`.

### 6.3 Parsing (via Phase 1 AI provider)
- Route fetches *your* categories, wallets, habit names, and task context, passes them to the model so it maps to **your** real records.
- Strict JSON out, e.g. `{ "module":"budget","type":"expense","amount":120,"category":"Food & Dining","wallet":"Cash","note":"chai","confidence":0.93 }`.
- Intents: `budget` (expense/income/transfer), `task`, `journal`, `habit`; `unknown` → clarifying reply.
- Robustness: regex fallback for the common `"<amount> <words>"` expense if the model fails/rate-limits, so capture never fully breaks.

### 6.4 Confirm + quick-fix (Telegram inline keyboard)
- After insert, reply with summary + inline buttons. Budget: `[Category▸] [Wallet▸] [Undo]`; tapping shows your category/wallet list; selecting updates the just-created row. Task/journal/habit: `[Undo]` (+ `[Edit]` where sensible).
- Callback queries arrive on the same webhook; handler updates/deletes the referenced row. `/undo` also removes the last item created in the chat.

### 6.5 Data & security
- Migration: the `profiles` columns above.
- New env (Vercel + local): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. **Claude asks Het for the bot token + service-role key when this phase starts** (Het creates the bot via @BotFather — ~2 min, guided).
- Route verifies `X-Telegram-Bot-Api-Secret-Token`; only linked chat_ids can write; service-role client in a server-only module.
- Reuses existing XP (`finance_log`, `journal_entry`, `habit_complete`) so phone captures still gamify.

**Done when:** from your phone, `120 chai`, `got 5000 allowance`, `journal: rough day but gym done`, `done meditation`, `task: submit DSA assignment` each land correctly with a one-tap-fixable confirmation.

---

## 7. Phases 3–5 (summary; full specs later)

**#3 Visual & UX Redesign** — Apply the **Anthropic/Claude design language** via the `frontend-design` skill. Extract a real design-system layer (tokens already in `globals.css`); **PC-first** layouts, then a full responsive pass to mobile; ⌘K command palette for nav + quick actions; light/dark toggle; consistent motion; complete empty/loading/error states.

**#4 AI Intelligence Layer** — In-app natural-language quick-add bar (reuses the Phase 1 provider + Phase 2 intent engine); a weekly AI coach reading all modules into an actionable digest (evolution of AI Report); anomaly alerts ("spending up 40%", "streak about to break"); month-end balance forecast. Cached to respect free quotas.

**#5 Unified Life Insights** — Correlation engine over deep work × habits × money × goals (e.g. *"you spend ~2× on low-focus days"*); unified life timeline; composite life-score. Capstone; depends on clean data from #1–#4.

---

## 8. Risks & Mitigations
- **Free-tier AI limits** → cache insights; regex fallback for capture; generate weekly digests, not per-request.
- **Next 16 API drift** → consult `node_modules/next/dist/docs/` before manifest/SW/proxy/route APIs (per `AGENTS.md`).
- **Service-role / API keys** → server-only modules, never imported client-side; set only in Vercel/local env; Claude requests keys from Het exactly when each phase needs them.
- **Telegram misparse** → confirm+quick-fix UX and `/undo`.
- **No test framework** → verify via `tsc --noEmit` + `next build` + manual PC/phone checks (matches existing convention).

---

## 9. What we build first
**Phase 0 (Deploy + PWA)** → **Phase 1 (AI Foundation)** → **Phase 2 (Telegram Capture Brain)**. Together they fix AI properly and deliver your headline want: *budget (and more) from your phone, free, auto-synced.* We write the Phase 0+1 implementation plan next, build, verify, then continue phase by phase.
