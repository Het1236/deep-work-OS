# Life OS — Full Upgrade Proposal & Roadmap

**Date:** 2026-05-30
**Author:** Het (with Claude)
**Status:** Proposal for review

---

## 1. Vision

**Today:** "Deep Work OS" is a desktop-first life tracker you must open and type into. Powerful, but passive capture is impossible and it lives on a laptop.

**Target:** a **phone-first, AI-native personal Life OS** that:
- captures your life from anywhere (a Telegram message, a home-screen tap),
- understands plain language (Gemini parses "120 chai" into a categorized expense),
- connects every module into one intelligence brain, and
- coaches you with weekly insights and alerts —
all on **strictly free** infrastructure.

**Audience:** just you — a personal power tool. Optimize for *your* speed and depth, not stranger-facing polish.

---

## 2. The Free Stack

| Concern | Service | Free-tier reality |
|---|---|---|
| Database + Auth + Edge Functions | **Supabase** (already used) | 500MB DB, plenty for personal use |
| Web hosting + serverless API routes | **Vercel Hobby** | Free; gives a public HTTPS URL (needed for Telegram + phone access) |
| Phone capture | **Telegram Bot API** | Completely free, instant, works everywhere |
| AI parsing + insights | **Google Gemini** (already used via `GEMINI_API_KEY`) | Generous free tier; reused across the app |
| Installable phone app | **PWA** (web standard) | Free; no app store |

No new paid services. Confirmed constraint: **strictly free tiers only.**

---

## 3. Roadmap — 5 Sub-Projects

Each is an independent spec → plan → build cycle and delivers standalone value. Recommended order:

| # | Sub-project | Outcome |
|---|---|---|
| **0** | Deploy + Mobile Foundation | App live on Vercel; installable PWA on your phone home screen |
| **1** | Telegram Capture Brain ⭐ | Message a bot → Gemini parses → lands in budget/tasks/journal/habits with a confirm+fix reply |
| **2** | Visual & UX Redesign | Unified design system, mobile responsiveness, ⌘K command palette, light/dark, motion polish |
| **3** | AI Intelligence Layer | Natural-language entry in-app, weekly AI coach, anomaly alerts, predictions |
| **4** | Unified Life Insights | Cross-module correlation brain (deep work × habits × money × goals), unified timeline, life-score |

The rest of this doc details **#0 and #1** (the first buildable chunk). #2–#4 are summarized; each gets its own full spec when we reach it.

---

## 4. Sub-Project #0 — Deploy + Mobile Foundation

**Goal:** Get the app on a public HTTPS URL and installable on your phone.

### 4.1 Deploy to Vercel (free hobby)
- Connect the GitHub repo to Vercel; framework auto-detected (Next.js 16).
- Environment variables to set in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, and `NEXT_PUBLIC_APP_URL` (set to the Vercel domain). (#1 adds Telegram + service-role vars.)
- Verify auth redirect URLs in Supabase include the Vercel domain.
- Note: the repo's `middleware` is flagged deprecated in favor of `proxy` (seen during build) — address as a small clean-up here so deploys are warning-free.

### 4.2 PWA (installable, offline shell)
- `app/manifest` (Next 16 metadata route) with name "Life OS", short_name, theme/background colors matching the app's dark theme, `display: standalone`, icons (192/512 + maskable + apple-touch-icon).
- Generate icon set from a simple logo mark.
- A minimal service worker for installability + an offline fallback shell (hand-rolled; avoid `next-pwa` which lags Next 16 / Turbopack). Cache the app shell; never cache authed API/data responses.
- Ensure the base layout has the correct mobile viewport meta and that core pages are usable at 390px width (full responsive pass happens in #2; #0 only guarantees "installable + not broken on phone").
- An "Add to Home Screen" hint banner on mobile (dismissible).

> **Next 16 caveat:** per `AGENTS.md`, the implementer must consult `node_modules/next/dist/docs/` for the current manifest/metadata + service-worker registration approach before coding.

**Done when:** you can open the Vercel URL on your phone, install it to the home screen, and it launches full-screen and logs you in.

---

## 5. Sub-Project #1 — Telegram Capture Brain ⭐

**Goal:** From your phone, message a Telegram bot in plain language and have it land in the right module, with a confirmation you can quickly fix.

**Captures:** Budget (priority), Tasks, Journal, Habits.
**Behavior:** Confirm + allow quick fix (safest — catches misparses).

### 5.1 Architecture (Approach A — chosen)
```
You (Telegram app on phone)
        │  "120 chai"
        ▼
Telegram Bot API ──webhook──► Next.js API route  /api/telegram   (on Vercel)
                                   │  1. verify secret header
                                   │  2. resolve user by chat_id
                                   │  3. Gemini → intent JSON
                                   │  4. map names→ids (user's categories/wallets/habits)
                                   │  5. insert via Supabase service-role client
                                   ▼
                              Supabase (RLS tables)
                                   │
                                   ▼
                       reply to Telegram: "✅ Logged ₹120 · Food · Cash   [Fix category] [Fix wallet] [Undo]"
```
One repo, reuses existing Gemini + Supabase. The bot writes on your behalf using a **service-role key kept server-side only** (never shipped to the browser).

### 5.2 Account linking (one-time)
- New columns on `profiles`: `telegram_chat_id text`, `telegram_link_code text`, `telegram_linked_at timestamptz`.
- In **Settings**, a "Connect Telegram" panel generates a short code and shows a deep link `https://t.me/<bot>?start=<code>`.
- You tap it → Telegram opens → send `/start <code>` → webhook matches the code to your user and stores `chat_id`; clears the code. Bot replies "🔗 Connected."
- Unlink button clears `telegram_chat_id`.

### 5.3 Parsing (Gemini)
- The route fetches *your* current categories, wallets, habit names, and task lists, and passes them to Gemini as context so it maps to **your** real records (not invented ones).
- Gemini returns strict JSON, e.g.
  ```json
  { "module": "budget", "type": "expense", "amount": 120,
    "category": "Food & Dining", "wallet": "Cash", "note": "chai",
    "confidence": 0.93 }
  ```
- Supported intents: `budget` (expense/income/transfer), `task`, `journal`, `habit`. A `module: "unknown"` triggers a clarifying reply.
- Robustness: if Gemini fails or is rate-limited, a regex fallback handles the common `"<amount> <words>"` expense case so capture never fully breaks.

### 5.4 Confirm + quick-fix (Telegram inline keyboard)
- After insert, reply with a summary and inline buttons. For budget: `[Category ▸]`, `[Wallet ▸]`, `[Undo]`. Tapping opens a compact button list of your categories/wallets; selecting one updates the just-created row (tracked by the message's record id). For task/journal/habit: `[Undo]` (+ `[Edit]` where it makes sense).
- Callback queries arrive as the same webhook; the handler updates or deletes the referenced row.
- `/undo` command and the Undo button both delete the last item created in this chat session.

### 5.5 Data & security
- Migration: the three `profiles` columns above; an index on `telegram_chat_id`.
- New env vars (Vercel + local): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
- The `/api/telegram` route verifies the `X-Telegram-Bot-Api-Secret-Token` header; rejects anything else. Only linked chat_ids can write. Service-role client lives in a server-only module.
- Reuses existing XP (`finance_log`, `journal_entry`, `habit_complete`) so phone captures still gamify.

**Done when:** from your phone you can message `120 chai`, `got 5000 allowance`, `journal: rough day but gym done`, `done meditation`, `task: submit DSA assignment` — each lands correctly with a confirmation you can fix in one tap.

---

## 6. Sub-Projects #2–#4 (summary; full specs later)

**#2 Visual & UX Redesign** — Extract a real design-system layer (tokens already exist in `globals.css`); full mobile-responsive pass on every module; a ⌘K command palette for navigation + quick actions; light/dark toggle; consistent motion language; empty/loading/error states. Goal: the now-on-phone app feels first-class on phone.

**#3 AI Intelligence Layer** — In-app natural-language quick-add bar (same Gemini intent engine as #1, reused); a weekly AI coach that reads all modules and writes an actionable digest (upgrade of the existing AI Report); anomaly alerts ("spending up 40% vs last month", "habit streak about to break"); light predictions (month-end balance forecast). All via Gemini free tier with caching to respect quotas.

**#4 Unified Life Insights** — A correlation engine over deep work × habits × money × goals (e.g. *"you spend ~2× on days with <1h deep work"*); a unified life timeline; a composite "life score". This is the capstone and depends on clean data flowing from #1–#3.

---

## 7. Risks & Mitigations
- **Gemini free-tier limits** → cache insights; regex fallback for capture; batch insight generation weekly, not per-request.
- **Next 16 API drift** → implementer consults `node_modules/next/dist/docs/` before using manifest/SW/route APIs (per `AGENTS.md`).
- **Service-role key leakage** → server-only module, never imported by client components; set only in Vercel/local env.
- **Telegram misparse** → confirm+quick-fix UX and `/undo` keep bad entries one tap from correction.
- **No test framework in repo** → continue verifying via `tsc --noEmit` + `next build` + manual phone checks, matching the existing codebase convention.

---

## 8. What we build first
Sub-projects **#0 (Deploy + PWA)** then **#1 (Telegram Capture Brain)** — together they deliver your headline want: *budget (and more) from your phone, free, auto-synced.* We'll write the implementation plan for #0+#1 next, build, verify, then move to #2.
