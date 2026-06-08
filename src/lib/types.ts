// Simplified app-level types derived from Supabase schema

export type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  level: number
  xp_total: number
  streak_current: number
  streak_max: number
  identity_statement: string | null
  personality_type: string | null
  deep_work_baseline: number
  group_id: string | null
  created_at: string
}

export type DeepWorkSession = {
  id: string
  user_id: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  intensity_score: number | null
  quality_score: number | null
  task_id: string | null
  notes: string | null
  session_date: string | null
  deep_work_pct: number  // 0–100: slider percentage of deep work
  created_at: string
}

export type Habit = {
  id: string
  user_id: string
  name: string
  category: string | null
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'anytime'
  identity_tag: string | null
  is_active: boolean
  sort_order: number
  created_at: string
}

export type HabitLog = {
  id: string
  habit_id: string
  user_id: string
  log_date: string
  completed: boolean
  note: string | null
}

export type Goal = {
  id: string
  user_id: string
  title: string
  problem: string | null
  solution: string | null
  ai_solution: string | null
  status: 'aspirational' | 'developing' | 'integrated'
  is_domino_goal: boolean
  is_wig: boolean
  target_date: string | null
  progress_pct: number
  life_area: string | null
  created_at: string
}

export type Project = {
  id: string
  user_id: string
  goal_id: string | null
  title: string
  description: string | null
  status: 'active' | 'upcoming' | 'done' | 'archived'
  ice_impact: number | null
  ice_confidence: number | null
  ice_ease: number | null
  ice_score: number | null
  target_date?: string | null
  created_at: string
  tasks?: Task[]
}

export type Task = {
  id: string
  user_id: string
  project_id: string | null
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done'
  drip_category: 'draining' | 'recharging' | 'investing' | 'producing' | null
  energy_level: 'high' | 'low' | null
  priority: number
  scheduled_date: string | null
  completed_at: string | null
  created_at: string
}

export type JournalEntry = {
  id: string
  user_id: string
  entry_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  entry_date: string
  gratitude_1: string | null
  gratitude_2: string | null
  gratitude_3: string | null
  energy_score: number | null
  deep_work_hours: number | null
  wins: string | null
  next_day_start: string | null
  shutdown_done: boolean
  habit_pct: number | null
  reflection: string | null
  improvements: string | null
  created_at: string
}

export type TimeBlock = {
  id: string
  user_id: string
  title: string
  block_type: 'deep_work' | 'wig' | 'distraction_break' | 'personal' | 'meeting'
  start_time: string
  end_time: string
  is_recurring: boolean
  recurrence_rule: string | null
  task_id: string | null
  goal_id: string | null
  color: string | null
  created_at: string
}

export type Note = {
  id: string
  user_id: string
  title: string
  content: string
  note_type: 'scratchpad' | 'blueprint'
  created_at: string
  updated_at: string
}

export type PlannerBlock = {
  id: string
  user_id: string
  block_date: string
  start_slot: number   // 0–47 (30-min slots from 00:00)
  end_slot: number     // 1–48 (exclusive end)
  title: string
  task_id: string | null
  project_id: string | null
  block_type: 'deep_work' | 'wig' | 'break' | 'personal' | 'meeting'
  color: string | null
  created_at: string
}

export type Achievement = {
  id: string
  user_id: string
  badge_key: string
  earned_at: string
}

export type XPEvent = {
  id: string
  user_id: string
  event_type: string
  xp_awarded: number
  metadata: Record<string, unknown> | null
  created_at: string
}

export type Group = {
  id: string
  name: string
  invite_code: string
  created_by: string | null
  professor_email: string | null
}

// Dashboard computed stats
export type DashboardStats = {
  todayMinutes: number
  weekMinutes: number
  avgIntensity: number
  currentStreak: number
  weeklyData: { day: string; minutes: number }[]
}

// Extended scoreboard stats
export type ScoreboardData = {
  // Weekly bar chart data (deep vs shallow per day)
  weeklyChart: { day: string; date: string; deepMin: number; shallowMin: number }[]
  // 30-day trend line
  trendLine: { date: string; hours: number }[]
  // Stat cards
  peakVelocity: number      // best day's hours
  deepWorkRatio: number     // percentage (0–100)
  avgIntensity: number
  totalHoursWeek: number
  totalHoursMonth: number
  sessionsCount: number
  // Session history
  sessions: DeepWorkSession[]
}

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
  goal_id: string | null
  txn_date: string
  note: string | null
  recurring_id: string | null
  created_at: string
}

export type CategorySpend = { categoryId: string; name: string; color: string; total: number }
export type DailySpend = { date: string; income: number; expense: number }

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

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly'

export type RecurringRule = {
  id: string
  user_id: string
  type: 'income' | 'expense'
  amount: number
  category_id: string | null
  account_id: string | null
  note: string | null
  frequency: RecurringFrequency
  next_run: string
  is_active: boolean
  created_at: string
}

export type MonthlyTrend = { month: string; label: string; income: number; expense: number; net: number }
