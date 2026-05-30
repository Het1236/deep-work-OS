# Budget Tracker — Phase 3 Implementation Plan

> Execute via superpowers:executing-plans.

**Goal:** Let the user create savings goals (e.g. "₹5,000 for a trip"), log contributions toward them, and see progress + a celebration when a goal is funded.

**Architecture:** Two new RLS-protected tables — `savings_goals` and `savings_contributions` (saved amount = sum of contributions). A `getGoals()` aggregator computes saved/remaining/pct/daysLeft per goal. A new "Goals" tab renders goal cards with progress rings; modals create/edit goals and add contributions. Funding a goal awards XP via a new `savings_funded` action.

**Tech Stack:** Same as prior phases.

---

## Task 1: Migration (via MCP apply_migration `finance_phase3_savings`, project hwygulsmtanmdovdcozw)

```sql
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  target_date date,
  icon text,
  color text,
  is_achieved boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  contributed_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index idx_savings_goals_user on public.savings_goals(user_id);
create index idx_savings_contrib_user on public.savings_contributions(user_id);
create index idx_savings_contrib_goal on public.savings_contributions(goal_id);

alter table public.savings_goals enable row level security;
alter table public.savings_contributions enable row level security;

create policy "own savings_goals" on public.savings_goals for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own savings_contributions" on public.savings_contributions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
```

Verify with `list_tables` + `get_advisors security`.

## Task 2: Types (types.ts)

```typescript
export type SavingsGoal = {
  id: string
  user_id: string
  name: string
  target_amount: number
  target_date: string | null
  icon: string | null
  color: string | null
  is_achieved: boolean
  sort_order: number
  created_at: string
}

export type SavingsContribution = {
  id: string
  user_id: string
  goal_id: string
  amount: number
  contributed_at: string
  note: string | null
  created_at: string
}

export type SavingsGoalStatus = SavingsGoal & {
  saved: number
  remaining: number
  pct: number          // 0..100 (capped)
  daysLeft: number | null
}
```

## Task 3: Data layer (data.ts)

- Extend `XPAction` union with `'savings_funded'` and `XP_VALUES` with `savings_funded: 20`.
- Add import of new types + `daysUntil` from `@/lib/finance`.
- Functions:

```typescript
export async function getGoals(userId: string): Promise<SavingsGoalStatus[]> {
  const [{ data: goals }, { data: contribs }] = await Promise.all([
    supabase.from('savings_goals').select('*').eq('user_id', userId).order('is_achieved').order('sort_order').order('created_at'),
    supabase.from('savings_contributions').select('goal_id, amount').eq('user_id', userId),
  ])
  const savedMap = new Map<string, number>()
  for (const c of (contribs || []) as { goal_id: string; amount: number }[]) {
    savedMap.set(c.goal_id, (savedMap.get(c.goal_id) || 0) + Number(c.amount))
  }
  return ((goals || []) as SavingsGoal[]).map(g => {
    const saved = savedMap.get(g.id) || 0
    const target = Number(g.target_amount) || 0
    const remaining = Math.max(0, target - saved)
    const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0
    return { ...g, saved, remaining, pct, daysLeft: g.target_date ? daysUntil(g.target_date) : null }
  })
}

export async function createGoal(g: Omit<SavingsGoal, 'id' | 'created_at'>) {
  const { data, error } = await supabase.from('savings_goals').insert(g).select().single()
  if (error) throw error
  return data as SavingsGoal
}
export async function updateGoal(id: string, updates: Partial<SavingsGoal>) {
  const { error } = await supabase.from('savings_goals').update(updates).eq('id', id)
  if (error) throw error
}
export async function deleteGoal(id: string) {
  const { error } = await supabase.from('savings_goals').delete().eq('id', id)
  if (error) throw error
}
export async function getContributions(goalId: string): Promise<SavingsContribution[]> {
  const { data } = await supabase.from('savings_contributions').select('*').eq('goal_id', goalId)
    .order('contributed_at', { ascending: false }).order('created_at', { ascending: false })
  return (data || []) as SavingsContribution[]
}
export async function deleteContribution(id: string) {
  const { error } = await supabase.from('savings_contributions').delete().eq('id', id)
  if (error) throw error
}

// Adds a contribution; if it funds the goal for the first time, marks achieved.
// Returns { justAchieved } so the UI can celebrate + award XP.
export async function addContribution(
  c: Omit<SavingsContribution, 'id' | 'created_at'>,
  goal: SavingsGoalStatus,
): Promise<{ justAchieved: boolean }> {
  const { error } = await supabase.from('savings_contributions').insert(c)
  if (error) throw error
  const newSaved = goal.saved + Number(c.amount)
  const justAchieved = !goal.is_achieved && newSaved >= Number(goal.target_amount)
  if (justAchieved) {
    await supabase.from('savings_goals').update({ is_achieved: true }).eq('id', goal.id)
  }
  return { justAchieved }
}
```

## Task 4: CSS (budget.css) — goal cards

```css
.bg-goal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-lg); }
.bg-goal-card { display: flex; flex-direction: column; gap: 12px; }
.bg-goal-top { display: flex; align-items: center; gap: 12px; }
.bg-goal-ring { position: relative; width: 56px; height: 56px; flex-shrink: 0; }
.bg-goal-ring-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; font-weight: 700; font-family: var(--font-mono); }
.bg-goal-name { font-size: 0.9375rem; font-weight: 700; color: var(--text-primary); }
.bg-goal-sub { font-size: 0.6875rem; color: var(--text-tertiary); margin-top: 2px; }
.bg-goal-figs { display: flex; justify-content: space-between; font-size: 0.8125rem; font-family: var(--font-mono); }
.bg-goal-actions { display: flex; gap: 8px; }
.bg-goal-badge { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); background: var(--accent-subtle); color: var(--accent); }
.bg-btn--sm { padding: 6px 12px; font-size: 0.75rem; }
.bg-btn--full { width: 100%; justify-content: center; }
```

## Task 5: GoalModal.tsx (create/edit goal)

Fields: name (required), target_amount (>0), target_date (optional date), color (palette). On save: create or update; call `onSaved()`. Reuse `.bg-modal` styling and the `PALETTE` colors.

## Task 6: ContributeModal.tsx (add money to a goal)

Props `{ open, onClose, userId, goal, onSaved }`. Fields: amount (>0), contributed_at (date, default today), note. On save: `addContribution({...}, goal)`; if `justAchieved`, `showXP(20, 'Goal funded! 🎉', false)` via useXPToast; then `onSaved()`. 

## Task 7: GoalsTab.tsx

Props `{ userId, goals, onChanged }`. Render: "New Goal" button; a `.bg-goal-grid` of goal cards. Each card: SVG progress ring (circle stroke-dashoffset by pct) colored by goal color (or success when achieved), name, target-date countdown ("12 days left" / "Due today" / "Overdue by N days" / "No deadline"), `saved / target` figures, "remaining" line, an "Add money" primary button + edit/delete icon buttons, and an "ACHIEVED" badge when `is_achieved`. Empty state with a "Create your first goal" button. Manage modals (GoalModal, ContributeModal) wired with local open state; after save call `onChanged()`.

Progress ring SVG (reusable inline):
```tsx
function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 24, c = 2 * Math.PI * r
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--bg-input)" strokeWidth="5" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, pct)) / 100}
        transform="rotate(-90 28 28)" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  )
}
```

## Task 8: Wire into page.tsx

- Add `'goals'` to Tab union; load `getGoals(userId)` into `goals` state; add "Goals" tab button; render `<GoalsTab userId={userId!} goals={goals} onChanged={() => { load(); triggerRefresh() }} />`.

## Task 9: Verify
`npx tsc --noEmit`, `npm run build`, `/budget` serves, `get_advisors security` clean. Commit.
