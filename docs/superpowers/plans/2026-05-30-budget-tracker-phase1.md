# Budget Tracker — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a usable budget tracker foundation — wallets, categories, and transactions — with an Overview dashboard (charts) and a Transactions CRUD tab, plus daily-log XP.

**Architecture:** New Supabase tables (`finance_accounts`, `finance_categories`, `transactions`) with RLS, applied via Supabase MCP `apply_migration` on project `hwygulsmtanmdovdcozw`. A `/budget` client-component route reads/writes through new functions in `src/lib/data.ts`, follows the existing `useUser()` + manual-loading pattern, renders with recharts + framer-motion, and awards XP through the existing `awardXP()`/`useXPToast()`.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (`@supabase/ssr`) · recharts · framer-motion · lucide-react.

**Spec:** `docs/superpowers/specs/2026-05-30-budget-tracker-design.md`

> **No test framework note:** This project has no test runner. Each task is verified by `npx tsc --noEmit` (typecheck), `npm run lint`, and — for UI — a manual check in `npm run dev`. "Verify" steps below use these, not unit tests.
> **Next.js 16 note:** Per `AGENTS.md`, consult `node_modules/next/dist/docs/` before using any framework API that might have changed.

---

## File Structure

- **Migration (via MCP):** `finance_phase1_schema` — three tables + RLS policies + indexes.
- Modify `src/lib/types.ts` — add `FinanceAccount`, `FinanceCategory`, `Transaction`, and view types (`BudgetOverview`, `CategorySpend`, `DailySpend`).
- Modify `src/lib/data.ts` — add finance data functions; extend `XPAction`/`XP_VALUES`.
- Modify `src/components/layout/Sidebar.tsx` — add Budget nav item.
- Create `src/lib/finance.ts` — pure helpers: INR formatting, month range, balance/aggregation math (no Supabase, easy to reason about).
- Create `src/app/(dashboard)/budget/page.tsx` — route shell + tab switching + shared summary header.
- Create `src/app/(dashboard)/budget/budget.css` — page styles using global CSS vars.
- Create `src/app/(dashboard)/budget/OverviewTab.tsx` — charts + hero.
- Create `src/app/(dashboard)/budget/TransactionsTab.tsx` — list + add/edit/delete + filters.
- Create `src/app/(dashboard)/budget/TransactionModal.tsx` — add/edit form.
- Create `src/app/(dashboard)/budget/ManageDrawer.tsx` — manage wallets & categories.

---

## Task 1: Database migration (3 tables + RLS + indexes)

**Files:**
- Apply via MCP `apply_migration`, name `finance_phase1_schema`, project `hwygulsmtanmdovdcozw`.

- [ ] **Step 1: Apply the migration**

SQL:

```sql
-- finance_accounts (wallets)
create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash','bank','upi','wallet','other')),
  opening_balance numeric(12,2) not null default 0,
  icon text,
  color text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- finance_categories
create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income','expense')),
  icon text,
  color text,
  monthly_budget numeric(12,2),
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('income','expense','transfer')),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid references public.finance_categories(id) on delete set null,
  account_id uuid references public.finance_accounts(id) on delete set null,
  to_account_id uuid references public.finance_accounts(id) on delete set null,
  txn_date date not null default current_date,
  note text,
  recurring_id uuid,
  created_at timestamptz not null default now()
);

create index idx_transactions_user_date on public.transactions(user_id, txn_date desc);
create index idx_transactions_user_cat on public.transactions(user_id, category_id);
create index idx_fin_cat_user on public.finance_categories(user_id);
create index idx_fin_acct_user on public.finance_accounts(user_id);

-- RLS
alter table public.finance_accounts enable row level security;
alter table public.finance_categories enable row level security;
alter table public.transactions enable row level security;

create policy "own finance_accounts" on public.finance_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own finance_categories" on public.finance_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Verify**

Run MCP `list_tables` (schemas `["public"]`) and confirm the three tables exist with `rls_enabled: true`. Run MCP `get_advisors` (type `security`) and confirm no new RLS-disabled warnings for these tables.

---

## Task 2: Types

**Files:**
- Modify: `src/lib/types.ts` (append at end)

- [ ] **Step 1: Add finance types**

```typescript
// ─── Finance / Budget ─────────────────────────
export type FinanceAccount = {
  id: string
  user_id: string
  name: string
  type: 'cash' | 'bank' | 'upi' | 'wallet' | 'other'
  opening_balance: number
  icon: string | null
  color: string | null
  is_active: boolean
  sort_order: number
  created_at: string
}

export type FinanceCategory = {
  id: string
  user_id: string
  name: string
  kind: 'income' | 'expense'
  icon: string | null
  color: string | null
  monthly_budget: number | null
  sort_order: number
  is_archived: boolean
  created_at: string
}

export type Transaction = {
  id: string
  user_id: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  category_id: string | null
  account_id: string | null
  to_account_id: string | null
  txn_date: string
  note: string | null
  recurring_id: string | null
  created_at: string
}

export type CategorySpend = { categoryId: string; name: string; color: string; total: number }
export type DailySpend = { date: string; income: number; expense: number }

export type BudgetOverview = {
  totalBalance: number
  monthIncome: number
  monthExpense: number
  monthNet: number
  accounts: (FinanceAccount & { balance: number })[]
  categorySpend: CategorySpend[]      // expense breakdown for the month
  dailySeries: DailySpend[]           // per-day income/expense for the month
  recentTransactions: Transaction[]   // latest 8
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(budget): add finance types"
```

---

## Task 3: Pure helpers (`finance.ts`)

**Files:**
- Create: `src/lib/finance.ts`

- [ ] **Step 1: Implement helpers**

```typescript
// Pure, Supabase-free helpers for the budget tracker.
import type { Transaction, FinanceAccount } from '@/lib/types'

// INR formatting, e.g. 123456.5 -> "₹1,23,457" (rounded) ; withPaise keeps 2 dp
export function formatINR(amount: number, withPaise = false): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: withPaise ? 2 : 0,
    minimumFractionDigits: withPaise ? 2 : 0,
  }).format(amount || 0)
}

// First/last day (YYYY-MM-DD) of the month containing `ref` (default: today)
export function monthRange(ref: Date = new Date()): { start: string; end: string } {
  const y = ref.getFullYear(), m = ref.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(start), end: fmt(end) }
}

// Running balance of one account given all of the user's transactions.
export function accountBalance(account: FinanceAccount, txns: Transaction[]): number {
  let bal = Number(account.opening_balance) || 0
  for (const t of txns) {
    const amt = Number(t.amount) || 0
    if (t.type === 'income' && t.account_id === account.id) bal += amt
    else if (t.type === 'expense' && t.account_id === account.id) bal -= amt
    else if (t.type === 'transfer') {
      if (t.account_id === account.id) bal -= amt
      if (t.to_account_id === account.id) bal += amt
    }
  }
  return bal
}

// Whole days from today until `dateStr` (YYYY-MM-DD); negative = overdue
export function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/finance.ts
git commit -m "feat(budget): add pure finance helpers"
```

---

## Task 4: Data layer + XP actions

**Files:**
- Modify: `src/lib/data.ts`

- [ ] **Step 1: Extend XP actions** — change the `XPAction` union and `XP_VALUES` map:

```typescript
export type XPAction =
  | 'session_complete'
  | 'habit_complete'
  | 'shutdown_ritual'
  | 'journal_entry'
  | 'finance_log'        // +3 XP for first transaction logged that day

const XP_VALUES: Record<XPAction, number> = {
  session_complete: 10,
  habit_complete: 5,
  shutdown_ritual: 15,
  journal_entry: 10,
  finance_log: 3,
}
```

- [ ] **Step 2: Add finance data functions** (append near end of `data.ts`, before final exports):

```typescript
import type {
  FinanceAccount, FinanceCategory, Transaction, BudgetOverview, CategorySpend, DailySpend,
} from '@/lib/types'
import { monthRange, accountBalance } from '@/lib/finance'

// ─── Finance: Accounts ────────────────────────
export async function getAccounts(userId: string): Promise<FinanceAccount[]> {
  const { data } = await supabase.from('finance_accounts')
    .select('*').eq('user_id', userId).eq('is_active', true)
    .order('sort_order').order('created_at')
  return (data || []) as FinanceAccount[]
}
export async function createAccount(a: Omit<FinanceAccount, 'id' | 'created_at'>) {
  const { data, error } = await supabase.from('finance_accounts').insert(a).select().single()
  if (error) throw error; return data as FinanceAccount
}
export async function updateAccount(id: string, updates: Partial<FinanceAccount>) {
  const { error } = await supabase.from('finance_accounts').update(updates).eq('id', id)
  if (error) throw error
}
export async function deleteAccount(id: string) {
  const { error } = await supabase.from('finance_accounts').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// ─── Finance: Categories ──────────────────────
export async function getCategories(userId: string): Promise<FinanceCategory[]> {
  const { data } = await supabase.from('finance_categories')
    .select('*').eq('user_id', userId).eq('is_archived', false)
    .order('sort_order').order('created_at')
  return (data || []) as FinanceCategory[]
}
export async function createCategory(c: Omit<FinanceCategory, 'id' | 'created_at'>) {
  const { data, error } = await supabase.from('finance_categories').insert(c).select().single()
  if (error) throw error; return data as FinanceCategory
}
export async function updateCategory(id: string, updates: Partial<FinanceCategory>) {
  const { error } = await supabase.from('finance_categories').update(updates).eq('id', id)
  if (error) throw error
}
export async function deleteCategory(id: string) {
  const { error } = await supabase.from('finance_categories').update({ is_archived: true }).eq('id', id)
  if (error) throw error
}

// Seed default student categories + wallets if user has none. Idempotent.
export async function seedFinanceDefaults(userId: string): Promise<void> {
  const existing = await getCategories(userId)
  if (existing.length === 0) {
    const expense = [
      ['Food & Dining', '#E85D5D'], ['Travel', '#5B9BD5'], ['Groceries', '#4CAF7D'],
      ['Rent/Hostel', '#F5A623'], ['Mobile/Internet', '#9B7EDE'], ['Education', '#50b380'],
      ['Entertainment', '#E89B5D'], ['Shopping', '#E85D9B'], ['Health', '#5DC9E8'], ['Misc', '#888888'],
    ] as const
    const income = [
      ['Allowance', '#96fac2'], ['Freelance', '#5B9BD5'], ['Gifts', '#F5A623'], ['Other', '#888888'],
    ] as const
    const rows = [
      ...expense.map(([name, color], i) => ({ user_id: userId, name, kind: 'expense' as const, color, sort_order: i, is_archived: false, monthly_budget: null, icon: null })),
      ...income.map(([name, color], i) => ({ user_id: userId, name, kind: 'income' as const, color, sort_order: i, is_archived: false, monthly_budget: null, icon: null })),
    ]
    await supabase.from('finance_categories').insert(rows)
  }
  const accts = await getAccounts(userId)
  if (accts.length === 0) {
    await supabase.from('finance_accounts').insert([
      { user_id: userId, name: 'Cash', type: 'cash', opening_balance: 0, color: '#96fac2', sort_order: 0, is_active: true, icon: null },
      { user_id: userId, name: 'UPI', type: 'upi', opening_balance: 0, color: '#5B9BD5', sort_order: 1, is_active: true, icon: null },
      { user_id: userId, name: 'Bank', type: 'bank', opening_balance: 0, color: '#F5A623', sort_order: 2, is_active: true, icon: null },
    ])
  }
}

// ─── Finance: Transactions ────────────────────
export async function getTransactions(userId: string, opts?: {
  start?: string; end?: string; type?: 'income' | 'expense' | 'transfer'; categoryId?: string; limit?: number
}): Promise<Transaction[]> {
  let q = supabase.from('transactions').select('*').eq('user_id', userId)
  if (opts?.start) q = q.gte('txn_date', opts.start)
  if (opts?.end) q = q.lte('txn_date', opts.end)
  if (opts?.type) q = q.eq('type', opts.type)
  if (opts?.categoryId) q = q.eq('category_id', opts.categoryId)
  q = q.order('txn_date', { ascending: false }).order('created_at', { ascending: false })
  if (opts?.limit) q = q.limit(opts.limit)
  const { data } = await q
  return (data || []) as Transaction[]
}
export async function createTransaction(t: Omit<Transaction, 'id' | 'created_at'>) {
  const { data, error } = await supabase.from('transactions').insert(t).select().single()
  if (error) throw error; return data as Transaction
}
export async function updateTransaction(id: string, updates: Partial<Transaction>) {
  const { error } = await supabase.from('transactions').update(updates).eq('id', id)
  if (error) throw error
}
export async function deleteTransaction(id: string) {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw error
}

// Returns true if no transaction exists yet for today's date (drives once-per-day XP).
export async function isFirstLogToday(userId: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0]
  const { count } = await supabase.from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('txn_date', today)
  return (count || 0) === 0
}

// ─── Finance: Overview aggregation ────────────
export async function getBudgetOverview(userId: string, ref: Date = new Date()): Promise<BudgetOverview> {
  const { start, end } = monthRange(ref)
  const [accounts, categories, allTxns, monthTxns] = await Promise.all([
    getAccounts(userId),
    getCategories(userId),
    getTransactions(userId),                       // all-time, for true balances
    getTransactions(userId, { start, end }),       // this month, for stats
  ])

  const accountsWithBal = accounts.map(a => ({ ...a, balance: accountBalance(a, allTxns) }))
  const totalBalance = accountsWithBal.reduce((s, a) => s + a.balance, 0)

  let monthIncome = 0, monthExpense = 0
  for (const t of monthTxns) {
    if (t.type === 'income') monthIncome += Number(t.amount)
    else if (t.type === 'expense') monthExpense += Number(t.amount)
  }

  const catMap = new Map(categories.map(c => [c.id, c]))
  const spendByCat = new Map<string, number>()
  for (const t of monthTxns) {
    if (t.type !== 'expense' || !t.category_id) continue
    spendByCat.set(t.category_id, (spendByCat.get(t.category_id) || 0) + Number(t.amount))
  }
  const categorySpend: CategorySpend[] = [...spendByCat.entries()].map(([id, total]) => ({
    categoryId: id, name: catMap.get(id)?.name || 'Uncategorized',
    color: catMap.get(id)?.color || '#888888', total,
  })).sort((a, b) => b.total - a.total)

  const dayMap = new Map<string, DailySpend>()
  for (const t of monthTxns) {
    const d = dayMap.get(t.txn_date) || { date: t.txn_date, income: 0, expense: 0 }
    if (t.type === 'income') d.income += Number(t.amount)
    else if (t.type === 'expense') d.expense += Number(t.amount)
    dayMap.set(t.txn_date, d)
  }
  const dailySeries = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalBalance, monthIncome, monthExpense, monthNet: monthIncome - monthExpense,
    accounts: accountsWithBal, categorySpend, dailySeries,
    recentTransactions: monthTxns.slice(0, 8),
  }
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` passes. (Note: the existing `import type` block at the top of `data.ts` already imports app types — adding a second `import type ... from '@/lib/types'` is valid TS; alternatively merge into the existing import. Either compiles.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/data.ts
git commit -m "feat(budget): finance data layer + finance_log XP action"
```

---

## Task 5: Sidebar nav entry

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1:** Add `Wallet` to the lucide import line, and add a nav item after the `Planner` entry:

```typescript
// in the import from 'lucide-react', add: Wallet
{ icon: Wallet, label: 'Budget', href: '/budget' },
```

Place the object directly after the `{ icon: Timer, label: 'Focus Timer', href: '/timer' }` line (so finance sits among the personal-tracking tools, before Second Brain).

- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes; in `npm run dev` the sidebar shows a "Budget" link.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(budget): add Budget to sidebar nav"
```

---

## Task 6: Route shell + summary header + tabs

**Files:**
- Create: `src/app/(dashboard)/budget/page.tsx`
- Create: `src/app/(dashboard)/budget/budget.css`

- [ ] **Step 1: Create `budget.css`** — page styles using global vars. Include at minimum: `.bg-page` (padding container), `.bg-header`, `.bg-tabs`/`.bg-tab`/`.bg-tab--active`, `.bg-card` (glass card matching `.sb-card`), `.bg-stat-grid`, `.bg-stat`, `.bg-empty`. Mirror the glass/card aesthetic from `src/app/(dashboard)/scoreboard/scoreboard.css` (`background: var(--bg-surface-glass); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);`). Use `--accent` for highlights, `--status-success/-warning/-danger` for amounts.

- [ ] **Step 2: Create `page.tsx`** — client component:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@/components/UserContext'
import { seedFinanceDefaults, getBudgetOverview, getCategories, getAccounts } from '@/lib/data'
import type { BudgetOverview, FinanceCategory, FinanceAccount } from '@/lib/types'
import { formatINR } from '@/lib/finance'
import { Loader2, Wallet, TrendingUp, TrendingDown, Scale } from 'lucide-react'
import OverviewTab from './OverviewTab'
import TransactionsTab from './TransactionsTab'
import './budget.css'

type Tab = 'overview' | 'transactions'

export default function BudgetPage() {
  const { userId, lastUpdate, triggerRefresh } = useUser()
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<BudgetOverview | null>(null)
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    await seedFinanceDefaults(userId)
    const [ov, cats, accts] = await Promise.all([
      getBudgetOverview(userId), getCategories(userId), getAccounts(userId),
    ])
    setOverview(ov); setCategories(cats); setAccounts(accts); setLoading(false)
  }, [userId, lastUpdate])

  useEffect(() => { load() }, [load])

  if (loading || !overview) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const stats = [
    { label: 'Total Balance', value: overview.totalBalance, icon: Wallet, color: 'var(--accent)' },
    { label: 'Income (this month)', value: overview.monthIncome, icon: TrendingUp, color: 'var(--status-success)' },
    { label: 'Spent (this month)', value: overview.monthExpense, icon: TrendingDown, color: 'var(--status-danger)' },
    { label: 'Net (this month)', value: overview.monthNet, icon: Scale, color: overview.monthNet >= 0 ? 'var(--status-success)' : 'var(--status-danger)' },
  ]

  return (
    <div className="bg-page">
      <div className="bg-header animate-fade-in">
        <div>
          <div className="text-subheading">MONEY PROTOCOL</div>
          <h1 className="text-display">Budget Tracker</h1>
        </div>
      </div>

      <div className="bg-stat-grid animate-fade-in" style={{ animationDelay: '0.05s' }}>
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div className="bg-stat bg-card" key={s.label}>
              <div className="bg-stat-icon" style={{ color: s.color }}><Icon size={18} /></div>
              <div className="bg-stat-label">{s.label}</div>
              <div className="bg-stat-value" style={{ color: s.color }}>{formatINR(s.value)}</div>
            </div>
          )
        })}
      </div>

      <div className="bg-tabs animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <button className={`bg-tab${tab === 'overview' ? ' bg-tab--active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`bg-tab${tab === 'transactions' ? ' bg-tab--active' : ''}`} onClick={() => setTab('transactions')}>Transactions</button>
      </div>

      {tab === 'overview'
        ? <OverviewTab overview={overview} />
        : <TransactionsTab userId={userId!} categories={categories} accounts={accounts} onChanged={() => { load(); triggerRefresh() }} />}
    </div>
  )
}
```

- [ ] **Step 3: Verify** — page compiles; visiting `/budget` shows header + 4 stat cards + tabs. (Tabs reference components built in Tasks 7–8; until then, temporarily stub `OverviewTab`/`TransactionsTab` as `() => null` if checking early, or build Tasks 7–8 before first run.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/budget/page.tsx" "src/app/(dashboard)/budget/budget.css"
git commit -m "feat(budget): budget route shell, summary header, tabs"
```

---

## Task 7: Overview tab (charts)

**Files:**
- Create: `src/app/(dashboard)/budget/OverviewTab.tsx`

- [ ] **Step 1: Implement** — props `{ overview: BudgetOverview }`. Render:
  1. **Wallet chips** row — one chip per `overview.accounts` showing `name` + `formatINR(balance)`, colored by `account.color`.
  2. **Spending by category donut** — recharts `PieChart`/`Pie` over `overview.categorySpend` (`dataKey="total"`, `nameKey="name"`), `<Cell fill={c.color}/>` per slice, `innerRadius={60} outerRadius={90}`, custom dark tooltip (copy the tooltip pattern from `scoreboard/page.tsx`), center label = `formatINR(monthExpense)`. Empty state if `categorySpend.length === 0`.
  3. **Daily flow area chart** — recharts `AreaChart` over `overview.dailySeries`, two `Area`s: `income` (`var(--status-success)`) and `expense` (`var(--status-danger)`), `XAxis dataKey="date"` formatted to `DD`, tooltip formats values with `formatINR`.
  4. **Recent transactions** mini-list — `overview.recentTransactions` with date, note, signed `formatINR` (green income / red expense).

Use `formatINR` from `@/lib/finance`. Wrap charts in `<ResponsiveContainer width="100%" height={240}>`. Use `.bg-card` wrappers. Each card has a title via `.bg-card-title` (add to `budget.css` if missing). Provide an empty state (`.bg-empty`, "No data yet — add a transaction") when the month has zero transactions.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes; with seeded data the Overview renders without runtime errors (check after Task 8 lets you add a transaction; or temporarily insert a test row via MCP `execute_sql` then delete it).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/budget/OverviewTab.tsx" "src/app/(dashboard)/budget/budget.css"
git commit -m "feat(budget): overview tab with category donut and daily flow charts"
```

---

## Task 8: Transactions tab + add/edit modal + manage drawer

**Files:**
- Create: `src/app/(dashboard)/budget/TransactionsTab.tsx`
- Create: `src/app/(dashboard)/budget/TransactionModal.tsx`
- Create: `src/app/(dashboard)/budget/ManageDrawer.tsx`

- [ ] **Step 1: `TransactionModal.tsx`** — props `{ open, onClose, userId, categories, accounts, editing?: Transaction | null, onSaved }`. Form fields: type toggle (Expense / Income / Transfer), `amount` (number, required, > 0), `category_id` (select, filtered to `kind` matching type; hidden for transfer), `account_id` (wallet select; for transfer this is "from"), `to_account_id` (transfer only, "to"), `txn_date` (date input, default today), `note` (text). On save:
  - For create: if `await isFirstLogToday(userId)` is true, after `createTransaction(...)` call `awardXP(userId, 'finance_log')` and `showXP(...)` via `useXPToast()`. Always call `createTransaction` with the right shape (`category_id`/`to_account_id` null where not applicable).
  - For edit: call `updateTransaction(editing.id, ...)` (no XP).
  - Then `onSaved()` and `onClose()`.
  Validate amount > 0 and (type !== 'transfer' ? category required : to_account required & to ≠ from). Style as a centered modal/overlay matching app dark theme.

- [ ] **Step 2: `ManageDrawer.tsx`** — props `{ open, onClose, userId, categories, accounts, onChanged }`. Two sections: **Wallets** (list with name + type + opening balance; add via `createAccount`, edit opening balance via `updateAccount`, remove via `deleteAccount`) and **Categories** (list grouped by `kind` with color dot + name; add via `createCategory` with a color picker / preset palette and `kind` toggle; remove via `deleteCategory`). Call `onChanged()` after any mutation.

- [ ] **Step 3: `TransactionsTab.tsx`** — props `{ userId, categories, accounts, onChanged }`. State: local `txns`, filters (`type`, `categoryId`, month via `monthRange`), modal open + editing, drawer open. Load via `getTransactions(userId, { ...filters })` in a `useEffect`. Render:
  - Toolbar: "Add Transaction" button (opens modal in create mode), "Manage wallets & categories" button (opens drawer), filter selects (type, category).
  - List: each row shows date, category name (lookup from `categories` by `category_id`) with color dot, note, wallet name, signed `formatINR`. Row actions: edit (opens modal with `editing`), delete (`deleteTransaction` then reload + `onChanged`).
  - Empty state via `.bg-empty`.
  - After any create/edit/delete: reload local list AND call `onChanged()` (so the parent refreshes the summary header + overview).

- [ ] **Step 4: Verify** — `npx tsc --noEmit` passes; in `npm run dev`: add an expense and an income, confirm they appear, the summary header + Overview charts update, editing and deleting work, and the first log of the day shows an XP toast.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/budget/TransactionsTab.tsx" "src/app/(dashboard)/budget/TransactionModal.tsx" "src/app/(dashboard)/budget/ManageDrawer.tsx"
git commit -m "feat(budget): transactions tab, add/edit modal, manage drawer"
```

---

## Task 9: Final verification & build

- [ ] **Step 1:** Run `npx tsc --noEmit` → no errors.
- [ ] **Step 2:** Run `npm run lint` → no new errors in budget files.
- [ ] **Step 3:** Run `npm run build` → succeeds.
- [ ] **Step 4:** Manual smoke in `npm run dev`: seed runs once, add/edit/delete transactions across wallets, transfer between wallets updates both balances, charts + header reflect changes, XP toast fires on first daily log, AI Report & Group pages still work untouched.
- [ ] **Step 5:** Run MCP `get_advisors` (security) → no new warnings.
- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore(budget): phase 1 verification fixes"
```

---

## Self-Review notes

- **Spec coverage:** wallets (Task 1/4/8), categories + seeds (Task 1/4), transactions CRUD (Task 4/8), Overview charts (Task 7), INR formatting (Task 3), computed balances (Task 3/4), `finance_log` XP + daily streak via `isFirstLogToday` (Task 4/8), sidebar entry (Task 5), AI Report/Group untouched (no tasks touch them). Budgets/Goals/Recurring are intentionally Phases 2–4, not here.
- **Type consistency:** `getBudgetOverview`, `getTransactions(opts)`, `BudgetOverview`, `CategorySpend`, `DailySpend`, `accountBalance`, `formatINR`, `monthRange`, `isFirstLogToday`, `seedFinanceDefaults` names are used identically across tasks.
- **No placeholders:** all code shown; UI tabs (Tasks 7–8) specify exact data props, recharts components, and data sources rather than vague "build the UI".
