# Budget Tracker — Design Spec

**Date:** 2026-05-30
**Author:** Het Patel (with Claude)
**App:** DeepWork Life OS (`deep-work-os`)
**Supabase project:** DeepWork Life OS (`hwygulsmtanmdovdcozw`)

## 1. Goal

A fully practical, visually rich budget tracker inside the existing Life OS app where the user (a university student, not yet earning a salary) can track **every** expense, income, and money movement. It must:

- Track money flowing **in** (allowance/pocket money, part-time/freelance, gifts/one-off).
- Track money flowing **out** by category.
- Show where money sits across **wallets** (Cash / UPI / Bank) with a true total balance.
- Let the user set **monthly budgets** per category and see how close they are.
- Let the user save toward **goals** (e.g. a ₹15k laptop).
- Track **recurring** bills/subscriptions and remind about upcoming ones.
- Plug into the app's existing **XP / streak gamification**.
- Use the app's "Organized Darkness" design language with strong charts and motion.

Currency: **INR (₹)**, Indian number formatting (e.g. `₹1,23,456`).

## 2. Scope / Non-goals

- **In scope:** the five tables below, a `/budget` route with tabbed sections, recharts visualizations, framer-motion polish, XP hooks.
- **Out of scope (do not touch):** the AI Report feature and the Group feature. No changes to their pages or data.
- No bank API / SMS auto-import. No multi-currency. No shared/household budgets.

## 3. Architecture

Single route **`/budget`** (a client component, like every other feature page) with internal tabs:

| Tab | Contents |
|---|---|
| **Overview** | Balance hero, income-vs-expense, spending-by-category donut, daily-spend trend, budget health, savings rings, upcoming bills. Read-only dashboard. |
| **Transactions** | Add/edit/delete transactions, filterable/searchable list, category + wallet management entry points. |
| **Budgets** | Per-category monthly caps + progress bars + over-budget alerts. |
| **Goals** | Savings goals with progress rings, contribute/withdraw. |
| **Recurring** | Recurring rules, upcoming-bills list, one-click "log now". |

**Conventions to follow (verified in codebase):**

- Client pages use `'use client'`, the `useUser()` hook for `userId`, and manual `useState/useEffect/useCallback` loading keyed on `lastUpdate`. TanStack Query is installed but **not** wired up — do **not** introduce it.
- All data access goes through new functions in `src/lib/data.ts` using the browser Supabase client already exported there.
- Types added to `src/lib/types.ts`.
- Co-located `budget.css` for page styles; reuse CSS variables from `globals.css` (`--accent #96fac2`, surfaces, status colors). Charts via **recharts**; motion via **framer-motion**; icons via **lucide-react**.
- XP via existing `awardXP()` + `useXPToast()`; extend the `XPAction` union and `XP_VALUES` map in `src/lib/data.ts`.
- New sidebar entry added to `navItems` in `src/components/layout/Sidebar.tsx` (icon: `Wallet`, label: "Budget", href: `/budget`), placed sensibly in the list. Do **not** add Group/AI entries.
- **Next.js 16 caution:** per `AGENTS.md`, consult `node_modules/next/dist/docs/` before using framework APIs — this version has breaking changes vs. training data.

## 4. Data model

All tables: RLS enabled, `user_id uuid` FK → `public.profiles(id)`, RLS policies mirroring existing tables (owner-only `select/insert/update/delete` via `auth.uid() = user_id`). `created_at timestamptz default now()`. Amounts stored as `numeric(12,2)` (rupees, two decimals).

### 4.1 `finance_accounts` (wallets)
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null`
- `name text not null` (e.g. "Cash", "HDFC", "UPI")
- `type text not null check (type in ('cash','bank','upi','wallet','other'))`
- `opening_balance numeric(12,2) not null default 0`
- `icon text`, `color text`
- `is_active boolean not null default true`
- `sort_order int default 0`
- `created_at`

Current balance = `opening_balance + Σ(income) − Σ(expense) ± transfers`, computed in the data layer (not stored).

### 4.2 `finance_categories`
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null`
- `name text not null`
- `kind text not null check (kind in ('income','expense'))`
- `icon text`, `color text`
- `monthly_budget numeric(12,2)` (nullable; only meaningful for expense categories — the Budgets tab)
- `sort_order int default 0`
- `is_archived boolean not null default false`
- `created_at`

**Seeded defaults on first visit** (created client-side if the user has zero categories):
- Expense: Food & Dining, Travel/Transport, Groceries, Rent/Hostel, Mobile/Internet, Education/Books, Entertainment, Shopping, Health, Misc.
- Income: Allowance, Freelance/Part-time, Gifts, Other.

### 4.3 `transactions`
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null`
- `type text not null check (type in ('income','expense','transfer'))`
- `amount numeric(12,2) not null check (amount > 0)`
- `category_id uuid` → `finance_categories(id)` (null for transfers)
- `account_id uuid` → `finance_accounts(id)` (source wallet; null allowed)
- `to_account_id uuid` → `finance_accounts(id)` (transfers only)
- `txn_date date not null default current_date`
- `note text`
- `recurring_id uuid` → `recurring_rules(id)` (set when materialized from a rule)
- `created_at`

### 4.4 `savings_goals`
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null`
- `name text not null`
- `target_amount numeric(12,2) not null check (target_amount > 0)`
- `saved_amount numeric(12,2) not null default 0`
- `target_date date`
- `icon text`, `color text`
- `status text not null default 'active' check (status in ('active','achieved','archived'))`
- `created_at`

Contribute/withdraw updates `saved_amount`. Optional: also write a `transfer` transaction into a virtual "Savings" wallet — **deferred**; Phase 3 just updates `saved_amount` directly and flips `status` to `achieved` at 100%.

### 4.5 `recurring_rules`
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null`
- `label text not null` (e.g. "Netflix")
- `type text not null check (type in ('income','expense'))`
- `amount numeric(12,2) not null check (amount > 0)`
- `category_id uuid` → `finance_categories(id)`
- `account_id uuid` → `finance_accounts(id)`
- `frequency text not null check (frequency in ('weekly','monthly'))`
- `day_of_month int check (day_of_month between 1 and 31)` (monthly)
- `day_of_week int check (day_of_week between 0 and 6)` (weekly)
- `next_due_date date not null`
- `is_active boolean not null default true`
- `created_at`

"Log now" creates a `transactions` row (with `recurring_id` set) and advances `next_due_date`. Upcoming list = active rules with `next_due_date` within the next 7 days. (Auto-materialization on load is **deferred**; Phase 4 surfaces them and the user confirms with one click.)

## 5. Data flow

1. Page loads → `useUser()` gives `userId`.
2. On mount / `lastUpdate` change, the active tab calls its loader(s) in `src/lib/data.ts` (e.g. `getFinanceOverview(userId, month)`, `getTransactions(userId, filters)`).
3. Mutations (add txn, set budget, contribute, log recurring) call data-layer writers, then call `triggerRefresh()` from `useUser()` and/or refetch locally; XP-eligible actions also call `awardXP()` and surface via `useXPToast()`.
4. Balances and budget % are **computed** in the data layer from raw rows for the requested month — no derived columns to keep in sync.

## 6. XP / gamification

Extend `XPAction` + `XP_VALUES`:
- `finance_log` (+3) — logging any transaction (rate-limited to first log per day to drive a daily finance streak; subsequent same-day logs award 0 to avoid farming).
- `budget_win` (+25) — at month rollover, awarded per category that stayed under its `monthly_budget` (checked when the Budgets tab loads a new month).
- `savings_milestone` (+20) — when a goal crosses 25/50/75/100% (dedupe via xp_events metadata).

Reuse `awardXP()`, `useXPToast().showXP()`. No new badge logic required in Phase 1.

## 7. Visuals

- **Balance hero:** large count-up total balance (framer-motion), with per-wallet chips.
- **Income vs Expense:** recharts stacked/grouped `BarChart` per recent period.
- **Spending by category:** recharts donut (`PieChart`) with category colors + legend; center shows month total.
- **Daily spend trend:** `AreaChart` over the month.
- **Budget health:** horizontal progress bars, green→amber→red by % of cap.
- **Savings goals:** SVG progress rings (same technique as Scoreboard's deep-work ratio ring).
- **Upcoming bills:** compact list with due-in-days and amount.
- Glassmorphism cards, `animate-fade-in`, consistent with Scoreboard/Dashboard. Custom recharts tooltip matching the dark theme (copy the pattern from `scoreboard/page.tsx`).

## 8. Error handling

- Data-layer writers throw on Supabase error (existing pattern); pages catch and show inline error/toast state, never crash.
- Forms validate `amount > 0` and required category/wallet before submit.
- Empty states: friendly prompts ("No transactions yet — add your first") on every tab.
- Seeding defaults is idempotent (only when count === 0) to avoid duplicates.

## 9. Phasing (build phase-by-phase; user reviews between each)

- **Phase 1 — Foundation + Transactions:** migration for `finance_accounts`, `finance_categories`, `transactions` (+ RLS + indexes); seed defaults; types; data layer; sidebar entry + `/budget` route; Overview tab (balance hero, income-vs-expense, category donut, daily trend) + Transactions tab (CRUD, filters); `finance_log` XP + daily streak. **Usable standalone.**
- **Phase 2 — Budgets & limits:** `monthly_budget` UI, Budgets tab, progress bars, over-budget alerts, `budget_win` XP.
- **Phase 3 — Savings goals:** `savings_goals` table + RLS; Goals tab, rings, contribute/withdraw, `savings_milestone` XP.
- **Phase 4 — Recurring/subscriptions:** `recurring_rules` table + RLS; Recurring tab, upcoming-bills widget on Overview, one-click log.

Migrations applied via Supabase MCP `apply_migration` against project `hwygulsmtanmdovdcozw`. Each phase ends with a typecheck/build and a working-app check before moving on.

## 10. Open questions

None blocking. Deferred decisions (savings-as-wallet, auto-materialized recurring) are noted inline and intentionally pushed past v1.
