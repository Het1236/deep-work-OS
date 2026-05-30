# Budget Tracker — Phase 4 Implementation Plan

> Execute via superpowers:executing-plans.

**Goal:** Power-user polish — recurring transactions (auto-logged), CSV/PDF export, and month-over-month trends with a month switcher.

**Architecture:**
- New `recurring_rules` table. On each Budget page load, `processDueRecurring()` materializes any due occurrences into `transactions` (stamped with `recurring_id`) and advances `next_run` — a cron-free "catch up on load" approach.
- A `refMonth` state on the page drives the month switcher; `getBudgetOverview`/`getBudgetStatus`/transactions all accept a ref date.
- `getMonthlyTrends()` buckets the last N months for a trends bar chart on the Overview.
- Export helpers build CSV (Blob download) and PDF (jspdf + jspdf-autotable, already deps).

---

## Task 1: Migration `finance_phase4_recurring` (project hwygulsmtanmdovdcozw)
```sql
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid references public.finance_categories(id) on delete set null,
  account_id uuid references public.finance_accounts(id) on delete set null,
  note text,
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  next_run date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_recurring_user on public.recurring_rules(user_id);
alter table public.recurring_rules enable row level security;
create policy "own recurring_rules" on public.recurring_rules for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
```

## Task 2: Types
`RecurringFrequency = 'daily'|'weekly'|'monthly'`; `RecurringRule`; `MonthlyTrend = { month: string; label: string; income: number; expense: number; net: number }`.

## Task 3: finance.ts helpers
`addPeriod(dateStr, freq)`, `monthKey(ref)` (YYYY-MM), `monthLabel(ref)` ("May 2026"), `shiftMonth(ref, delta)`.

## Task 4: data.ts
- `getRecurringRules(userId)` (active), CRUD (`createRecurringRule`, `updateRecurringRule`, `deleteRecurringRule` soft).
- `processDueRecurring(userId)` materializes due txns (guard cap 120), advances next_run; returns count.
- `getMonthlyTrends(userId, months=6, ref)`.

## Task 5: finance helpers + export util
`src/app/(dashboard)/budget/exportUtils.ts`: `exportTransactionsCSV(rows, catMap, acctMap)` and `exportTransactionsPDF(...)`.

## Task 6: page.tsx
`refMonth` state; month switcher header; load uses ref for overview/budget-status/trends; `processDueRecurring` before fetch; pass `refMonth` to TransactionsTab; pass `trends` to OverviewTab.

## Task 7: OverviewTab
Add a 6-month trends bar chart (income vs expense) above category donut.

## Task 8: TransactionsTab
Use `refMonth` prop for the month range; add Export (CSV/PDF) menu + a "Recurring" button opening RecurringDrawer.

## Task 9: RecurringDrawer.tsx
List active rules + create form (type, amount, category, account, frequency, start date). Delete rule.

## Task 10: Verify — tsc, build, advisors, commit.
