# Budget Tracker — Phase 2 Implementation Plan

> Execute via superpowers:executing-plans. No DB migration (the `finance_categories.monthly_budget` column already exists from Phase 1).

**Goal:** Let the user set a monthly spending limit per expense category and see live progress bars + over-budget alerts.

**Architecture:** Add a `getBudgetStatus()` aggregator to `data.ts` that joins this month's expense totals against each category's `monthly_budget`. A new "Budgets" tab renders progress bars; the Manage drawer gains a budget input per expense category; the Overview surfaces an over-budget alert banner.

**Tech Stack:** Same as Phase 1 (React 19, recharts not needed here, framer-motion for bars).

---

## File Structure
- Modify `src/lib/types.ts` — add `CategoryBudgetStatus`.
- Modify `src/lib/data.ts` — add `getBudgetStatus()`; ensure `updateCategory` covers `monthly_budget` (it does — `Partial<FinanceCategory>`).
- Create `src/app/(dashboard)/budget/BudgetsTab.tsx` — progress UI.
- Modify `src/app/(dashboard)/budget/ManageDrawer.tsx` — per-category budget input.
- Modify `src/app/(dashboard)/budget/page.tsx` — add "Budgets" tab + pass data.
- Modify `src/app/(dashboard)/budget/budget.css` — progress bar styles.

---

## Task 1: Types

- [ ] Add to `types.ts`:

```typescript
export type CategoryBudgetStatus = {
  categoryId: string
  name: string
  color: string
  budget: number       // monthly_budget (0 if unset)
  spent: number        // this month's expense in this category
  remaining: number    // budget - spent (can be negative)
  pct: number          // 0..100+ (spent/budget*100; 0 if no budget)
  over: boolean        // spent > budget (and budget > 0)
}
```

- [ ] Verify `npx tsc --noEmit`. Commit.

## Task 2: Data aggregator

- [ ] Add to `data.ts` (uses existing `getCategories`, `getTransactions`, `monthRange`):

```typescript
export async function getBudgetStatus(userId: string, ref: Date = new Date()): Promise<CategoryBudgetStatus[]> {
  const { start, end } = monthRange(ref)
  const [categories, monthTxns] = await Promise.all([
    getCategories(userId),
    getTransactions(userId, { start, end, type: 'expense' }),
  ])
  const spend = new Map<string, number>()
  for (const t of monthTxns) {
    if (!t.category_id) continue
    spend.set(t.category_id, (spend.get(t.category_id) || 0) + Number(t.amount))
  }
  return categories
    .filter(c => c.kind === 'expense')
    .map(c => {
      const budget = Number(c.monthly_budget) || 0
      const spent = spend.get(c.id) || 0
      const remaining = budget - spent
      const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0
      return { categoryId: c.id, name: c.name, color: c.color || '#888888', budget, spent, remaining, pct, over: budget > 0 && spent > budget }
    })
    .sort((a, b) => {
      // budgeted first (by pct desc), then unbudgeted with spend, then empty
      if ((a.budget > 0) !== (b.budget > 0)) return a.budget > 0 ? -1 : 1
      if (a.budget > 0) return b.pct - a.pct
      return b.spent - a.spent
    })
}
```

- [ ] Verify `npx tsc --noEmit`. Commit.

## Task 3: CSS — progress bars

- [ ] Append to `budget.css`:

```css
.bg-budget-row { padding: 14px 0; border-bottom: 1px solid var(--border-subtle); }
.bg-budget-row:last-child { border-bottom: none; }
.bg-budget-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.bg-budget-name { font-size: 0.875rem; color: var(--text-primary); font-weight: 600; flex: 1; }
.bg-budget-figs { font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-tertiary); }
.bg-bar-track { height: 8px; border-radius: var(--radius-full); background: var(--bg-input); overflow: hidden; }
.bg-bar-fill { height: 100%; border-radius: var(--radius-full); transition: width 0.5s ease; }
.bg-budget-foot { display: flex; justify-content: space-between; margin-top: 6px; font-size: 0.6875rem; }
.bg-alert { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: var(--radius-md);
  background: rgba(232,93,93,0.1); border: 1px solid rgba(232,93,93,0.3); color: var(--status-danger);
  font-size: 0.8125rem; margin-bottom: var(--space-lg); }
.bg-budget-set { width: 110px; }
```

- [ ] Commit (with Task 4).

## Task 4: BudgetsTab component

- [ ] Create `src/app/(dashboard)/budget/BudgetsTab.tsx`:

```tsx
'use client'

import type { CategoryBudgetStatus } from '@/lib/types'
import { formatINR } from '@/lib/finance'
import { motion } from 'framer-motion'
import { AlertTriangle, Target } from 'lucide-react'

export default function BudgetsTab({ status, onManage }: { status: CategoryBudgetStatus[]; onManage: () => void }) {
  const budgeted = status.filter(s => s.budget > 0)
  const totalBudget = budgeted.reduce((s, c) => s + c.budget, 0)
  const totalSpent = budgeted.reduce((s, c) => s + c.spent, 0)
  const overList = budgeted.filter(s => s.over)

  function barColor(s: CategoryBudgetStatus) {
    if (s.over) return 'var(--status-danger)'
    if (s.pct >= 80) return 'var(--status-warning)'
    return s.color
  }

  if (budgeted.length === 0) {
    return (
      <div className="bg-card bg-empty animate-fade-in">
        <div className="bg-empty-icon"><Target size={32} /></div>
        No budgets set yet. Open <strong>Manage</strong> and give your expense categories a monthly limit.
        <div style={{ marginTop: 16 }}>
          <button className="bg-btn bg-btn--primary" onClick={onManage}>Set budgets</button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {overList.length > 0 && (
        <div className="bg-alert">
          <AlertTriangle size={16} />
          You&apos;ve gone over budget in {overList.length} {overList.length === 1 ? 'category' : 'categories'}: {overList.map(o => o.name).join(', ')}.
        </div>
      )}

      <div className="bg-card" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="bg-card-title">Monthly Budget</div>
        <div className="bg-card-subtitle">{formatINR(totalSpent)} of {formatINR(totalBudget)} spent</div>
        <div className="bg-bar-track" style={{ marginTop: 14, height: 10 }}>
          <div className="bg-bar-fill" style={{
            width: `${totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0}%`,
            background: totalSpent > totalBudget ? 'var(--status-danger)' : 'var(--primary-gradient)',
          }} />
        </div>
      </div>

      <div className="bg-card">
        <div className="bg-card-title">By Category</div>
        <div style={{ marginTop: 8 }}>
          {budgeted.map((s, i) => (
            <div className="bg-budget-row" key={s.categoryId}>
              <div className="bg-budget-head">
                <span className="bg-txn-dot" style={{ background: s.color }} />
                <span className="bg-budget-name">{s.name}</span>
                <span className="bg-budget-figs">{formatINR(s.spent)} / {formatINR(s.budget)}</span>
              </div>
              <div className="bg-bar-track">
                <motion.div className="bg-bar-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, s.pct)}%` }}
                  transition={{ delay: 0.04 * i, duration: 0.5 }}
                  style={{ background: barColor(s) }}
                />
              </div>
              <div className="bg-budget-foot">
                <span style={{ color: s.over ? 'var(--status-danger)' : 'var(--text-tertiary)' }}>
                  {s.over ? `Over by ${formatINR(Math.abs(s.remaining))}` : `${formatINR(s.remaining)} left`}
                </span>
                <span style={{ color: s.over ? 'var(--status-danger)' : 'var(--text-tertiary)' }}>{s.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] Commit (CSS + component).

## Task 5: Wire into page + Manage drawer budget input

- [ ] In `page.tsx`: add `'budgets'` to the `Tab` union; load `getBudgetStatus` alongside the others in `load()`; store in state `budgetStatus`; add a third tab button "Budgets"; render `<BudgetsTab status={budgetStatus} onManage={...}>` — since Manage drawer lives in TransactionsTab, the Budgets tab "Set budgets" / onManage should switch to the transactions tab and the user opens Manage there. Simplest: `onManage={() => setTab('transactions')}`.

- [ ] In `ManageDrawer.tsx`: for each expense category row, add a small number input bound to `monthly_budget`, calling `updateCategory(c.id, { monthly_budget: value || null })` on blur, then `onChanged()`. Import `updateCategory` from `@/lib/data`.

- [ ] Verify `npx tsc --noEmit`, `npm run build`. Commit.

## Task 6: Final verification
- [ ] `npx tsc --noEmit` clean, `npm run build` succeeds, `/budget` serves.
