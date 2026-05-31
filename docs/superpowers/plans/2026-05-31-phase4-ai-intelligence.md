# Phase 4 — AI Intelligence Layer

> Verify: `npx tsc --noEmit` + `npm run build`. Reuses Phase 1 provider (`src/lib/ai`) + Phase 2 intent engine (`src/lib/ai/intent.ts`).

**Goal:** Bring the AI into the app itself — natural-language quick capture, a weekly coach, anomaly alerts, and a month-end forecast — all on the free Groq tier with caching.

## Parts
**Part 1 — In-app NL Quick Capture (this chunk):**
- `src/app/api/capture/route.ts` — POST (authed via server supabase client). Body `{ text }`. Loads the user's categories/wallets/habits, runs `parseCapture`, inserts the right record via the user's RLS session, returns `{ ok, module, detail }`. Mirrors the Telegram engine so phone + desktop behave identically.
- `src/components/QuickCapture.tsx` — global modal (portaled to body) opened by **Ctrl/⌘ + J** or a Topbar ✨ button. Input → POST `/api/capture` → inline parsed confirmation + XP toast + `triggerRefresh()`. Mount in `DashboardProviders`; add trigger button to Topbar.

**Part 2 — AI Coach & Insights (next chunk):**
- `src/app/api/insights/route.ts` — gathers cross-module weekly data, computes deterministic metrics (spend vs last month, habit streaks at risk, deep-work trend, month-end balance forecast from income/expense run-rate), then asks the provider for a short narrated digest. Cache latest in a new `ai_insights` table (1/day) to respect quota.
- Surface on the Dashboard as an "AI Coach" card + inline anomaly badges (e.g. "Food spending +40% vs last month", "Gym streak breaks today").

This plan file documents Part 1 in detail; Part 2 gets built after Part 1 ships.

## Part 1 tasks
1. **Capture route** — parse + insert (budget/task/journal/habit) for the authed user; award `finance_log`/`journal_entry`/`habit_complete` XP; graceful `AI_NOT_CONFIGURED`/unknown handling.
2. **QuickCapture component** — input, loading state, parsed-result confirmation, error display; keyboard shortcut + window event `lifeos:capture`.
3. **Topbar trigger** — a ✨ button dispatching `lifeos:capture`.
4. **Mount** in `DashboardProviders`.
5. Verify, commit, merge, push.
