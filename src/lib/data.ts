import { createClient } from '@/lib/supabase/client'
import type {
  Profile, DeepWorkSession, Habit, HabitLog,
  Goal, Project, Task, JournalEntry, TimeBlock,
  Achievement, XPEvent, DashboardStats, Group, Note, PlannerBlock, ScoreboardData,
  FinanceAccount, FinanceCategory, Transaction, BudgetOverview, CategorySpend, DailySpend,
  CategoryBudgetStatus, SavingsGoal, SavingsContribution, SavingsGoalStatus,
  RecurringRule, MonthlyTrend,
  GtdContext, AreaOfFocus, NotificationSettings, GtdBucket,
  NutritionTargets, Meal, MealDraftItem, MealType, MealSource, MacroDay, PantryItem,
  Workout, WorkoutSet,
} from '@/lib/types'
import { sumMacros } from '@/lib/nutrition'
import type { HevyWorkout } from '@/lib/hevy'
import { monthRange, accountBalance, daysUntil, addPeriod, monthKey, shiftMonth } from '@/lib/finance'

const supabase = createClient()

// ─── Profile ──────────────────────────────────
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data as Profile | null
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Deep Work Sessions ───────────────────────
export async function getTodaySessions(userId: string): Promise<DeepWorkSession[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('deep_work_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_date', today)
    .order('started_at', { ascending: false })
  return (data || []) as DeepWorkSession[]
}

export async function getWeekSessions(userId: string): Promise<DeepWorkSession[]> {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('deep_work_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', startOfWeek.toISOString())
    .order('started_at', { ascending: false })
  return (data || []) as DeepWorkSession[]
}

export async function createSession(session: {
  user_id: string
  started_at: string
  session_date: string
}) {
  const { data, error } = await supabase
    .from('deep_work_sessions')
    .insert(session)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function endSession(sessionId: string, updates: {
  ended_at: string
  duration_minutes: number
  intensity_score: number
  notes?: string
  deep_work_pct?: number
}) {
  const { data, error } = await supabase
    .from('deep_work_sessions')
    .update(updates)
    .eq('id', sessionId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Discard (delete) a session — used when user doesn't want to keep it
export async function discardSession(sessionId: string) {
  const { error } = await supabase
    .from('deep_work_sessions')
    .delete()
    .eq('id', sessionId)
  if (error) throw error
}

// Get sessions in a date range
export async function getAllSessions(userId: string, startDate: string, endDate: string): Promise<DeepWorkSession[]> {
  const { data } = await supabase
    .from('deep_work_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('session_date', startDate)
    .lte('session_date', endDate)
    .order('started_at', { ascending: false })
  return (data || []) as DeepWorkSession[]
}

// Compute full scoreboard analytics
// weekOffset: 0 = this week, 1 = last week, 2 = 2 weeks ago, etc.
export async function getScoreboardData(userId: string, weekOffset: number = 0): Promise<ScoreboardData> {
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // Fetch enough data to cover offset weeks + 30 day trend
  const fetchDays = 30 + weekOffset * 7
  const dStart = new Date(now); dStart.setDate(dStart.getDate() - fetchDays)
  const startDateFetch = dStart.toISOString().split('T')[0]

  // Start of selected week (Sunday), shifted by offset
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay() - weekOffset * 7)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  const weekStart = startOfWeek.toISOString().split('T')[0]
  const weekEnd = endOfWeek.toISOString().split('T')[0]

  const allSessions = await getAllSessions(userId, startDateFetch, today)

  // ─── Weekly bar chart (for selected week) ───
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const weeklyChart = dayNames.map((day, i) => {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const daySessions = allSessions.filter(s => s.session_date === dateStr)
    let deepMin = 0, shallowMin = 0
    for (const s of daySessions) {
      const dur = s.duration_minutes || 0
      const pct = s.deep_work_pct ?? 100
      deepMin += Math.round(dur * pct / 100)
      shallowMin += Math.round(dur * (100 - pct) / 100)
    }
    return { day, date: dateStr, deepMin, shallowMin }
  })

  // ─── 30-day trend line (always relative to today) ───
  const trendLine: { date: string; hours: number }[] = []
  for (let i = 30; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const mins = allSessions
      .filter(s => s.session_date === dateStr)
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
    trendLine.push({ date: dateStr, hours: Math.round(mins / 60 * 10) / 10 })
  }

  // ─── Stats (for selected week) ───
  const weekSessions = allSessions.filter(s => s.session_date && s.session_date >= weekStart && s.session_date <= weekEnd)
  const totalWeekMin = weekSessions.reduce((s, x) => s + (x.duration_minutes || 0), 0)
  const totalMonthMin = allSessions.reduce((s, x) => s + (x.duration_minutes || 0), 0)

  // Deep work ratio (for selected week)
  let totalDeepMin = 0, totalAllMin = 0
  for (const s of weekSessions) {
    const dur = s.duration_minutes || 0
    const pct = s.deep_work_pct ?? 100
    totalDeepMin += Math.round(dur * pct / 100)
    totalAllMin += dur
  }
  const deepWorkRatio = totalAllMin > 0 ? Math.round(totalDeepMin / totalAllMin * 100) : 0

  // Peak velocity (best single day in selected week)
  const dayTotals = new Map<string, number>()
  for (const s of weekSessions) {
    if (!s.session_date) continue
    dayTotals.set(s.session_date, (dayTotals.get(s.session_date) || 0) + (s.duration_minutes || 0))
  }
  const peakMin = dayTotals.size > 0 ? Math.max(...dayTotals.values()) : 0
  const peakVelocity = Math.round(peakMin / 60 * 10) / 10

  // Avg intensity (for selected week)
  const intensities = weekSessions.filter(s => s.intensity_score).map(s => s.intensity_score!)
  const avgIntensity = intensities.length > 0
    ? Math.round(intensities.reduce((a, b) => a + b, 0) / intensities.length * 10) / 10
    : 0

  return {
    weeklyChart,
    trendLine,
    peakVelocity,
    deepWorkRatio,
    avgIntensity,
    totalHoursWeek: Math.round(totalWeekMin / 60 * 10) / 10,
    totalHoursMonth: Math.round(totalMonthMin / 60 * 10) / 10,
    sessionsCount: weekSessions.length,
    sessions: allSessions.slice(0, 50),
  }
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const weekSessions = await getWeekSessions(userId)
  const today = new Date().toISOString().split('T')[0]

  const todayMinutes = weekSessions
    .filter(s => s.session_date === today)
    .reduce((sum, s) => sum + (s.duration_minutes || 0), 0)

  const weekMinutes = weekSessions
    .reduce((sum, s) => sum + (s.duration_minutes || 0), 0)

  const intensities = weekSessions
    .filter(s => s.intensity_score)
    .map(s => s.intensity_score!)
  const avgIntensity = intensities.length > 0
    ? Math.round(intensities.reduce((a, b) => a + b, 0) / intensities.length * 10) / 10
    : 0

  // Build weekly data
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const now = new Date()
  const weeklyData = dayNames.map((day, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - now.getDay() + i)
    const dateStr = d.toISOString().split('T')[0]
    const minutes = weekSessions
      .filter(s => s.session_date === dateStr)
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
    return { day, minutes }
  })

  return {
    todayMinutes,
    weekMinutes,
    avgIntensity,
    currentStreak: 0, // Computed from profile
    weeklyData,
  }
}

// ─── Habits ───────────────────────────────────
export async function getHabits(userId: string): Promise<Habit[]> {
  const { data } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return (data || []) as Habit[]
}

export async function createHabit(habit: {
  user_id: string
  name: string
  time_of_day: string
  category?: string
  identity_tag?: string
}) {
  const { data, error } = await supabase
    .from('habits')
    .insert(habit)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteHabit(habitId: string) {
  const { error } = await supabase
    .from('habits')
    .update({ is_active: false })
    .eq('id', habitId)
  if (error) throw error
}

export async function getHabitLogs(userId: string, startDate: string, endDate: string): Promise<HabitLog[]> {
  const { data } = await supabase
    .from('habit_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
  return (data || []) as HabitLog[]
}

export async function toggleHabitLog(userId: string, habitId: string, date: string, completed: boolean) {
  // Upsert: find existing log or create new one
  const { data: existing } = await supabase
    .from('habit_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .eq('log_date', date)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('habit_logs')
      .update({ completed })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('habit_logs')
      .insert({ user_id: userId, habit_id: habitId, log_date: date, completed })
    if (error) throw error
  }
}

// ─── Goals ────────────────────────────────────
export async function getGoals(userId: string): Promise<Goal[]> {
  const { data } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('is_domino_goal', { ascending: false })
  return (data || []) as Goal[]
}

export async function createGoal(goal: {
  user_id: string
  title: string
  problem?: string
  solution?: string
  status?: string
  is_domino_goal?: boolean
  is_wig?: boolean
  life_area?: string
  target_date?: string
}) {
  const { data, error } = await supabase
    .from('goals')
    .insert(goal)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateGoal(goalId: string, updates: Partial<Goal>) {
  const { data, error } = await supabase
    .from('goals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', goalId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Projects ─────────────────────────────────
export async function getProjects(userId: string): Promise<Project[]> {
  const { data } = await supabase
    .from('projects')
    .select('*, tasks(*)')
    .eq('user_id', userId)
    .order('ice_score', { ascending: false })
  return (data || []) as Project[]
}

export async function createProject(project: {
  user_id: string
  title: string
  description?: string
  status?: string
  ice_impact?: number
  ice_confidence?: number
  ice_ease?: number
  goal_id?: string
  target_date?: string
}) {
  const iceScore = project.ice_impact && project.ice_confidence && project.ice_ease
    ? ((project.ice_impact + project.ice_confidence + project.ice_ease) / 3)
    : null
  const { data, error } = await supabase
    .from('projects')
    .insert({ ...project, ice_score: iceScore })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProjectStatus(projectId: string, status: string) {
  const { error } = await supabase
    .from('projects')
    .update({ status }) // removed updated_at: new Date().toISOString() since projects doesn't have it
    .eq('id', projectId)
  if (error) throw error
}

export async function updateProject(projectId: string, updates: Partial<Project>) {
  const iceScore = updates.ice_impact && updates.ice_confidence && updates.ice_ease
    ? ((updates.ice_impact + updates.ice_confidence + updates.ice_ease) / 3)
    : updates.ice_score || null

  const { data, error } = await supabase
    .from('projects')
    .update({ ...updates, ice_score: iceScore })
    .eq('id', projectId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Tasks ────────────────────────────────────
export async function getTasks(userId: string, projectId?: string): Promise<Task[]> {
  let query = supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data } = await query
  return (data || []) as Task[]
}

export async function getActiveTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'done')
    .order('scheduled_date', { ascending: true })
    .order('priority', { ascending: false })
  
  if (error) {
    console.error("Error fetching active tasks", error)
    return []
  }
  return data as Task[]
}

export async function createTask(task: {
  user_id: string
  title: string
  project_id?: string
  drip_category?: string
  energy_level?: string
  scheduled_date?: string
  status?: string
  priority?: number
}) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTaskStatus(taskId: string, status: string) {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (status === 'done') {
    updates.completed_at = new Date().toISOString()
  }
  const { error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
  if (error) throw error
}

export async function updateTask(taskId: string, updates: Partial<Task>) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .single()
  if (error) throw error
  return data as Task
}

export async function deleteTask(taskId: string) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
  if (error) throw error
}

// ─── GTD: buckets, clarify, contexts ──────────────

// Inbox = raw captures awaiting clarification (top-down, to zero).
export async function getInbox(userId: string): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('gtd_bucket', 'inbox')
    .neq('status', 'done')
    .order('created_at', { ascending: true })
  return (data || []) as Task[]
}

export type NextActionFilters = {
  contextId?: string | null
  energyLevel?: 'high' | 'low'
  maxMinutes?: number
}

// Next Actions — the engage list. Optional 4-criteria filters.
export async function getNextActions(userId: string, f: NextActionFilters = {}): Promise<Task[]> {
  let q = supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('gtd_bucket', 'next_action')
    .neq('status', 'done')
  if (f.contextId) q = q.eq('context_id', f.contextId)
  if (f.energyLevel) q = q.eq('energy_level', f.energyLevel)
  if (f.maxMinutes != null) q = q.lte('time_estimate_minutes', f.maxMinutes)
  const { data } = await q
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
  return (data || []) as Task[]
}

export async function getWaitingFor(userId: string): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('gtd_bucket', 'waiting_for')
    .neq('status', 'done')
    .order('waiting_since', { ascending: true })
  return (data || []) as Task[]
}

export async function getCalendarTasks(userId: string): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('gtd_bucket', 'calendar')
    .neq('status', 'done')
    .order('scheduled_date', { ascending: true })
  return (data || []) as Task[]
}

export async function getSomeday(userId: string): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('gtd_bucket', 'someday')
    .order('created_at', { ascending: false })
  return (data || []) as Task[]
}

export async function getReference(userId: string): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('gtd_bucket', 'reference')
    .order('created_at', { ascending: false })
  return (data || []) as Task[]
}

// Live counts per bucket (for nav badges + bucket tabs). Excludes done/trash.
export async function getBucketCounts(userId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('tasks')
    .select('gtd_bucket, status')
    .eq('user_id', userId)
    .neq('status', 'done')
  const counts: Record<string, number> = {}
  for (const row of (data || []) as { gtd_bucket: string }[]) {
    counts[row.gtd_bucket] = (counts[row.gtd_bucket] || 0) + 1
  }
  return counts
}

// Clarify outcome — move a task to a bucket, stamping waiting_since when delegated.
export type ClarifyPatch = Partial<Task> & { gtd_bucket: GtdBucket }
export async function clarifyTask(taskId: string, patch: ClarifyPatch): Promise<Task> {
  const updates: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
  if (patch.gtd_bucket === 'waiting_for' && patch.waiting_since == null) {
    updates.waiting_since = new Date().toISOString()
  }
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single()
  if (error) throw error
  return data as Task
}

// ─── GTD Contexts ─────────────────────────────────
export async function getContexts(userId: string): Promise<GtdContext[]> {
  const { data } = await supabase
    .from('gtd_contexts')
    .select('*')
    .eq('user_id', userId)
    .order('sort', { ascending: true })
  return (data || []) as GtdContext[]
}

// Seed the user's starter contexts once (idempotent — only when none exist).
export async function ensureSeedContexts(userId: string): Promise<GtdContext[]> {
  const existing = await getContexts(userId)
  if (existing.length > 0) return existing
  const seed = [
    { name: '@calls', emoji: '📞', sort: 0 },
    { name: '@computer', emoji: '💻', sort: 1 },
    { name: '@campus', emoji: '🎓', sort: 2 },
    { name: '@errands', emoji: '🛒', sort: 3 },
  ].map(c => ({ ...c, user_id: userId }))
  const { data, error } = await supabase.from('gtd_contexts').insert(seed).select()
  if (error) throw error
  return (data || []) as GtdContext[]
}

export async function createContext(userId: string, name: string, emoji?: string): Promise<GtdContext> {
  const { data, error } = await supabase
    .from('gtd_contexts')
    .insert({ user_id: userId, name, emoji: emoji ?? null, sort: 100 })
    .select()
    .single()
  if (error) throw error
  return data as GtdContext
}

export async function updateContext(id: string, updates: Partial<GtdContext>) {
  const { error } = await supabase.from('gtd_contexts').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteContext(id: string) {
  const { error } = await supabase.from('gtd_contexts').delete().eq('id', id)
  if (error) throw error
}

// ─── Areas of Focus (Horizon 2) ───────────────────
export async function getAreas(userId: string): Promise<AreaOfFocus[]> {
  const { data } = await supabase
    .from('areas_of_focus')
    .select('*')
    .eq('user_id', userId)
    .order('sort', { ascending: true })
  return (data || []) as AreaOfFocus[]
}

export async function createArea(area: { user_id: string; name: string; description?: string; kind?: 'personal' | 'professional' }): Promise<AreaOfFocus> {
  const { data, error } = await supabase
    .from('areas_of_focus')
    .insert({ ...area, kind: area.kind ?? 'personal', sort: 100 })
    .select()
    .single()
  if (error) throw error
  return data as AreaOfFocus
}

export async function updateArea(id: string, updates: Partial<AreaOfFocus>) {
  const { error } = await supabase.from('areas_of_focus').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteArea(id: string) {
  const { error } = await supabase.from('areas_of_focus').delete().eq('id', id)
  if (error) throw error
}

// ─── Notification settings ────────────────────────
const DEFAULT_NOTIFICATION_SETTINGS: Omit<NotificationSettings, 'user_id' | 'updated_at'> = {
  timezone: 'Asia/Kolkata',
  morning_agenda: true,
  morning_hour: 8,
  inbox_nudge: false,
  weekly_review: false,
  weekly_review_dow: 0,
  weekly_review_hour: 19,
  waiting_followup: false,
  waiting_followup_days: 3,
}

// Read settings, creating the default row on first access.
export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  const { data } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (data) return data as NotificationSettings
  const { data: created, error } = await supabase
    .from('notification_settings')
    .insert({ user_id: userId, ...DEFAULT_NOTIFICATION_SETTINGS })
    .select()
    .single()
  if (error) throw error
  return created as NotificationSettings
}

export async function updateNotificationSettings(userId: string, updates: Partial<NotificationSettings>) {
  const { error } = await supabase
    .from('notification_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw error
}

// ─── Fitness & Nutrition ──────────────────────

export async function getNutritionTargets(userId: string): Promise<NutritionTargets | null> {
  const { data } = await supabase
    .from('nutrition_targets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return data as NutritionTargets | null
}

export async function upsertNutritionTargets(userId: string, values: Partial<NutritionTargets>): Promise<NutritionTargets> {
  const { data, error } = await supabase
    .from('nutrition_targets')
    .upsert({ user_id: userId, ...values, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single()
  if (error) throw error
  return data as NutritionTargets
}

export type NewMeal = {
  meal_date: string
  meal_type: MealType
  name: string
  source: MealSource
  eaten_at?: string
  photo_path?: string | null
}

// Insert a meal + its items; totals are computed from the items.
export async function createMeal(userId: string, meal: NewMeal, items: MealDraftItem[]): Promise<Meal> {
  const totals = sumMacros(items)
  const { data, error } = await supabase
    .from('meals')
    .insert({ user_id: userId, ...meal, ...totals })
    .select()
    .single()
  if (error) throw error
  const created = data as Meal
  if (items.length) {
    const rows = items.map((it, i) => ({
      meal_id: created.id, user_id: userId, name: it.name, portion: it.portion || null,
      kcal: it.kcal, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g, sort_order: i,
    }))
    const { error: e2 } = await supabase.from('meal_items').insert(rows)
    if (e2) throw e2
  }
  return created
}

export async function getMealsForDate(userId: string, ymd: string): Promise<Meal[]> {
  const { data } = await supabase
    .from('meals')
    .select('*, meal_items(*)')
    .eq('user_id', userId)
    .eq('meal_date', ymd)
    .order('eaten_at', { ascending: true })
  return (data || []) as Meal[]
}

// Per-day macro totals for the trend chart (grouped client-side).
export async function getMacroTrend(userId: string, days: number): Promise<MacroDay[]> {
  const start = new Date()
  start.setDate(start.getDate() - days + 1)
  const startYmd = start.toISOString().split('T')[0]
  const { data } = await supabase
    .from('meals')
    .select('meal_date,kcal,protein_g,carbs_g,fat_g')
    .eq('user_id', userId)
    .gte('meal_date', startYmd)
  const byDate = new Map<string, MacroDay>()
  for (const m of (data || []) as Pick<Meal, 'meal_date' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>[]) {
    const d = byDate.get(m.meal_date) || { date: m.meal_date, kcal: 0, protein: 0, carbs: 0, fat: 0 }
    d.kcal += Number(m.kcal) || 0
    d.protein += Number(m.protein_g) || 0
    d.carbs += Number(m.carbs_g) || 0
    d.fat += Number(m.fat_g) || 0
    byDate.set(m.meal_date, d)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// Update a meal; when items are passed, they replace the existing set and totals recompute.
export async function updateMeal(mealId: string, userId: string, patch: Partial<Meal>, items?: MealDraftItem[]): Promise<void> {
  const updates: Record<string, unknown> = { ...patch }
  delete updates.meal_items
  if (items) {
    Object.assign(updates, sumMacros(items))
    const { error: eDel } = await supabase.from('meal_items').delete().eq('meal_id', mealId)
    if (eDel) throw eDel
    if (items.length) {
      const rows = items.map((it, i) => ({
        meal_id: mealId, user_id: userId, name: it.name, portion: it.portion || null,
        kcal: it.kcal, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g, sort_order: i,
      }))
      const { error: eIns } = await supabase.from('meal_items').insert(rows)
      if (eIns) throw eIns
    }
  }
  const { error } = await supabase.from('meals').update(updates).eq('id', mealId)
  if (error) throw error
}

export async function deleteMeal(mealId: string): Promise<void> {
  const { error } = await supabase.from('meals').delete().eq('id', mealId)
  if (error) throw error
}

// Create a meal from a photo flow: insert meal+items, then upload the photo
// straight from the browser (storage RLS restricts to the user's own folder).
export async function createMealWithPhoto(userId: string, meal: NewMeal, items: MealDraftItem[], photo: Blob): Promise<Meal> {
  const created = await createMeal(userId, { ...meal, source: 'photo' }, items)
  try {
    const path = `${userId}/${created.id}.jpg`
    const { error: upErr } = await supabase.storage
      .from('meal-photos')
      .upload(path, photo, { contentType: 'image/jpeg', upsert: true })
    if (upErr) throw upErr
    await supabase.from('meals').update({ photo_path: path }).eq('id', created.id)
    created.photo_path = path
  } catch (err) {
    // Meal data is already saved — a failed photo upload shouldn't lose the log.
    console.error('meal photo upload failed', err)
  }
  return created
}

export async function getMealPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('meal-photos').createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

// ─── Pantry ───────────────────────────────────────
export async function getPantry(userId: string): Promise<PantryItem[]> {
  const { data } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true })
  return (data || []) as PantryItem[]
}

export async function addPantryItem(userId: string, name: string): Promise<void> {
  const clean = name.trim().toLowerCase()
  if (!clean) return
  const { error } = await supabase
    .from('pantry_items')
    .upsert({ user_id: userId, name: clean }, { onConflict: 'user_id,name', ignoreDuplicates: true })
  if (error) throw error
}

export async function removePantryItem(id: string): Promise<void> {
  const { error } = await supabase.from('pantry_items').delete().eq('id', id)
  if (error) throw error
}

// ─── Workouts (Hevy import) ───────────────────────
export async function getWorkouts(userId: string, limit = 30): Promise<Workout[]> {
  const { data } = await supabase
    .from('workouts')
    .select('*, workout_sets(*)')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit)
  return (data || []) as Workout[]
}

// All sets since a date, flattened with workout started_at (for volume/PR stats).
export async function getAllSetsForStats(userId: string, sinceIso: string): Promise<(WorkoutSet & { started_at: string })[]> {
  const { data } = await supabase
    .from('workouts')
    .select('started_at, workout_sets(*)')
    .eq('user_id', userId)
    .gte('started_at', sinceIso)
  const out: (WorkoutSet & { started_at: string })[] = []
  for (const w of (data || []) as { started_at: string; workout_sets: WorkoutSet[] }[]) {
    for (const s of w.workout_sets || []) out.push({ ...s, started_at: w.started_at })
  }
  return out
}

// Import parsed Hevy workouts; dedupes on (user_id, started_at, title).
export async function importHevyWorkouts(userId: string, workouts: HevyWorkout[]): Promise<{ imported: number; skipped: number }> {
  if (workouts.length === 0) return { imported: 0, skipped: 0 }

  // Existing keys in the file's date range → skip set.
  const times = workouts.map(w => w.startedAt).sort()
  const { data: existing } = await supabase
    .from('workouts')
    .select('started_at,title')
    .eq('user_id', userId)
    .gte('started_at', times[0])
    .lte('started_at', times[times.length - 1])
  const seen = new Set((existing || []).map(w => `${w.title}|${new Date(w.started_at).toISOString()}`))

  const fresh = workouts.filter(w => !seen.has(`${w.title}|${w.startedAt}`))
  let imported = 0
  for (const w of fresh) {
    const { data: created, error } = await supabase
      .from('workouts')
      .insert({ user_id: userId, title: w.title, started_at: w.startedAt, ended_at: w.endedAt, source: 'hevy_csv' })
      .select('id')
      .single()
    if (error) {
      // unique-constraint race or duplicate → count as skipped, keep going
      continue
    }
    const rows = w.sets.map(s => ({ workout_id: created.id, user_id: userId, ...s }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error: setErr } = await supabase.from('workout_sets').insert(rows.slice(i, i + 500))
      if (setErr) throw setErr
    }
    imported++
  }
  return { imported, skipped: workouts.length - imported }
}

// ─── Journal ──────────────────────────────────
export async function getJournalEntries(userId: string, limit = 14): Promise<JournalEntry[]> {
  const { data } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .limit(limit)
  return (data || []) as JournalEntry[]
}

export async function getJournalEntry(userId: string, date: string): Promise<JournalEntry | null> {
  const { data } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('entry_date', date)
    .single()
  return data as JournalEntry | null
}

export async function upsertJournalEntry(entry: {
  user_id: string
  entry_date: string
  entry_type?: string
  gratitude_1?: string
  gratitude_2?: string
  gratitude_3?: string
  energy_score?: number
  deep_work_hours?: number
  wins?: string
  next_day_start?: string
  shutdown_done?: boolean
  habit_pct?: number
  reflection?: string
}) {
  const { data: existing } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', entry.user_id)
    .eq('entry_date', entry.entry_date)
    .single()

  if (existing) {
    const { data, error } = await supabase
      .from('journal_entries')
      .update(entry)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase
      .from('journal_entries')
      .insert(entry)
      .select()
      .single()
    if (error) throw error
    return data
  }
}

// ─── Calendar / Time Blocks ───────────────────
export async function getTimeBlocks(userId: string, startDate: string, endDate: string): Promise<TimeBlock[]> {
  const { data } = await supabase
    .from('time_blocks')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', startDate)
    .lte('start_time', endDate)
    .order('start_time', { ascending: true })
  return (data || []) as TimeBlock[]
}

export async function createTimeBlock(block: {
  user_id: string
  title: string
  block_type: string
  start_time: string
  end_time: string
  task_id?: string
  goal_id?: string
  color?: string
}) {
  const { data, error } = await supabase
    .from('time_blocks')
    .insert(block)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTimeBlock(blockId: string, updates: Partial<TimeBlock>) {
  const { data, error } = await supabase
    .from('time_blocks')
    .update(updates)
    .eq('id', blockId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTimeBlock(blockId: string) {
  const { error } = await supabase
    .from('time_blocks')
    .delete()
    .eq('id', blockId)
  if (error) throw error
}

// ─── Notes (Second Brain) ─────────────────────
export async function getNotes(userId: string, noteType?: string): Promise<Note[]> {
  let query = supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (noteType) query = query.eq('note_type', noteType)
  const { data } = await query
  return (data || []) as Note[]
}

export async function upsertNote(note: {
  id?: string
  user_id: string
  title: string
  content: string
  note_type: string
}) {
  if (note.id) {
    const { data, error } = await supabase
      .from('notes')
      .update({ title: note.title, content: note.content, updated_at: new Date().toISOString() })
      .eq('id', note.id)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase
      .from('notes')
      .insert(note)
      .select()
      .single()
    if (error) throw error
    return data
  }
}

export async function deleteNote(noteId: string) {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
  if (error) throw error
}

// ─── Evolution / XP ───────────────────────────
export async function getXPEvents(userId: string, limit = 50): Promise<XPEvent[]> {
  const { data } = await supabase
    .from('xp_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data || []) as XPEvent[]
}

export async function getAchievements(userId: string): Promise<Achievement[]> {
  const { data } = await supabase
    .from('achievements')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false })
  return (data || []) as Achievement[]
}

// ─── Groups ───────────────────────────────────
export async function getGroup(groupId: string): Promise<Group | null> {
  const { data } = await supabase
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .single()
  return data as Group | null
}

export async function getGroupMembers(groupId: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('group_id', groupId)
    .order('xp_total', { ascending: false })
  return (data || []) as Profile[]
}

export async function joinGroup(userId: string, inviteCode: string) {
  const { data: group } = await supabase
    .from('groups')
    .select('id')
    .eq('invite_code', inviteCode)
    .single()
  if (!group) throw new Error('Invalid invite code')
  const { error } = await supabase
    .from('profiles')
    .update({ group_id: group.id })
    .eq('id', userId)
  if (error) throw error
  return group
}

export async function getGroupWeeklyStats(memberIds: string[]) {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('deep_work_sessions')
    .select('user_id, duration_minutes')
    .in('user_id', memberIds)
    .gte('started_at', startOfWeek.toISOString())
  return (data || []) as { user_id: string; duration_minutes: number | null }[]
}

// ─── Utility: XP Level Calculation ────────────
export function calculateLevel(xpTotal: number) {
  const level = Math.max(1, Math.floor(Math.sqrt(xpTotal / 100)))
  const xpStartCurrent = level === 1 ? 0 : level * level * 100
  const xpStartNext = (level + 1) * (level + 1) * 100
  const xpInLevel = xpTotal - xpStartCurrent
  const xpForNext = xpStartNext - xpStartCurrent
  const progress = (xpInLevel / xpForNext) * 100
  return { level, xpInLevel, xpForNext, progress }
}

// ─── Gamification Engine ──────────────────────
export type XPAction =
  | 'session_complete'   // +10 XP per hour of deep work
  | 'habit_complete'     // +5 XP per habit checked
  | 'shutdown_ritual'    // +15 XP for completing shutdown
  | 'journal_entry'      // +10 XP per journal entry
  | 'finance_log'        // +3 XP for first transaction logged that day
  | 'savings_funded'     // +20 XP when a savings goal is fully funded

const XP_VALUES: Record<XPAction, number> = {
  session_complete: 10,
  habit_complete: 5,
  shutdown_ritual: 15,
  journal_entry: 10,
  finance_log: 3,
  savings_funded: 20,
}

export async function awardXP(
  userId: string,
  action: XPAction,
  metadata?: Record<string, unknown>,
  customXP?: number
): Promise<{ xpAwarded: number; newTotal: number; leveledUp: boolean }> {
  const xp = customXP ?? XP_VALUES[action]

  // 1. Insert XP event
  await supabase.from('xp_events').insert({
    user_id: userId,
    event_type: action,
    xp_awarded: xp,
    metadata: metadata || null,
  })

  // 2. Get current profile
  const profile = await getProfile(userId)
  const oldTotal = profile?.xp_total || 0
  const newTotal = oldTotal + xp
  const oldLevel = calculateLevel(oldTotal).level
  const newLevel = calculateLevel(newTotal).level

  // 3. Update profile xp_total and level
  await supabase
    .from('profiles')
    .update({ xp_total: newTotal, level: newLevel })
    .eq('id', userId)

  return { xpAwarded: xp, newTotal, leveledUp: newLevel > oldLevel }
}

export async function checkAndAwardBadges(userId: string): Promise<string[]> {
  // 1. Recalculate deep work session streak
  const { data: allSessions } = await supabase
    .from('deep_work_sessions')
    .select('session_date, duration_minutes, quality_score')
    .eq('user_id', userId)
    .order('session_date', { ascending: true })

  // Compute unique session dates
  const sessionDates = Array.from(new Set((allSessions || []).map(s => s.session_date))).filter(Boolean) as string[]
  
  // Calculate deep work streaks
  let dwStreakCurrent = 0
  let dwStreakMax = 0
  if (sessionDates.length > 0) {
    const todayStr = new Date().toISOString().split('T')[0]
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    
    // Sort dates
    sessionDates.sort()
    
    // Calculate dwStreakMax
    let currentRun = 0
    let lastDate: Date | null = null
    for (const dStr of sessionDates) {
      const currentDate = new Date(dStr)
      if (lastDate) {
        const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        if (diffDays === 1) {
          currentRun++
        } else if (diffDays > 1) {
          dwStreakMax = Math.max(dwStreakMax, currentRun)
          currentRun = 1
        }
      } else {
        currentRun = 1
      }
      lastDate = currentDate
    }
    dwStreakMax = Math.max(dwStreakMax, currentRun)
    
    // Calculate dwStreakCurrent
    const lastSessionDateStr = sessionDates[sessionDates.length - 1]
    if (lastSessionDateStr === todayStr || lastSessionDateStr === yesterdayStr) {
      let currentRunBack = 0
      let expectedDate = new Date(lastSessionDateStr)
      const sessionDatesSet = new Set(sessionDates)
      while (sessionDatesSet.has(expectedDate.toISOString().split('T')[0])) {
        currentRunBack++
        expectedDate.setDate(expectedDate.getDate() - 1)
      }
      dwStreakCurrent = currentRunBack
    } else {
      dwStreakCurrent = 0
    }
  }

  // Update profile with recalculated deep work streaks
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('streak_max')
    .eq('id', userId)
    .single()
  const newStreakMax = Math.max(currentProfile?.streak_max || 0, dwStreakMax)
  await supabase
    .from('profiles')
    .update({
      streak_current: dwStreakCurrent,
      streak_max: newStreakMax,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)

  // 2. Recalculate habit completion streak
  const { data: allHabitLogs } = await supabase
    .from('habit_logs')
    .select('habit_id, log_date, completed')
    .eq('user_id', userId)
    .eq('completed', true)
    .order('log_date', { ascending: true })

  // Group by habit_id
  const habitLogsMap: Record<string, string[]> = {}
  for (const log of (allHabitLogs || [])) {
    if (!habitLogsMap[log.habit_id]) {
      habitLogsMap[log.habit_id] = []
    }
    habitLogsMap[log.habit_id].push(log.log_date)
  }

  let maxHabitStreak = 0
  for (const habitId in habitLogsMap) {
    const dates = Array.from(new Set(habitLogsMap[habitId])).sort()
    if (dates.length > 0) {
      let currentRun = 0
      let lastDate: Date | null = null
      let habitStreakMax = 0
      for (const dStr of dates) {
        const currentDate = new Date(dStr)
        if (lastDate) {
          const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime())
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          if (diffDays === 1) {
            currentRun++
          } else if (diffDays > 1) {
            habitStreakMax = Math.max(habitStreakMax, currentRun)
            currentRun = 1
          }
        } else {
          currentRun = 1
        }
        lastDate = currentDate
      }
      habitStreakMax = Math.max(habitStreakMax, currentRun)
      maxHabitStreak = Math.max(maxHabitStreak, habitStreakMax)
    }
  }

  // 3. Count total session hours
  const totalHours = (allSessions || []).reduce((s, r) => s + ((r.duration_minutes || 0) / 60), 0)

  // 4. Count shutdown rituals (journal entries with shutdown_done)
  const { count: shutdownCount } = await supabase
    .from('journal_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('shutdown_done', true)

  // 5. Max quality score
  const maxQualityScore = (allSessions || []).reduce((max, s) => {
    const q = Number(s.quality_score) || 0
    return q > max ? q : max
  }, 0)

  // 6. Perfect week check
  let hasPerfectWeek = false
  if (totalHours >= 25) {
    const { count: totalActiveHabits } = await supabase
      .from('habits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true)
    
    if (totalActiveHabits && totalActiveHabits > 0) {
      const weeklyHours: Record<string, number> = {}
      const weeklyHabitCompletions: Record<string, Set<string>> = {}
      
      const getWeekKey = (dateStr: string) => {
        const d = new Date(dateStr)
        const day = d.getDay()
        const sun = new Date(d)
        sun.setDate(d.getDate() - day)
        return sun.toISOString().split('T')[0]
      }

      for (const s of (allSessions || [])) {
        if (!s.session_date) continue
        const wk = getWeekKey(s.session_date)
        weeklyHours[wk] = (weeklyHours[wk] || 0) + ((s.duration_minutes || 0) / 60)
      }

      const { data: allLogs } = await supabase
        .from('habit_logs')
        .select('habit_id, log_date, completed')
        .eq('user_id', userId)
      
      for (const log of (allLogs || [])) {
        if (!log.completed) continue
        const wk = getWeekKey(log.log_date)
        if (!weeklyHabitCompletions[wk]) {
          weeklyHabitCompletions[wk] = new Set()
        }
        weeklyHabitCompletions[wk].add(`${log.habit_id}_${log.log_date}`)
      }

      for (const wk in weeklyHours) {
        if (weeklyHours[wk] >= 25) {
          const expectedCompletions = totalActiveHabits * 7
          const completedCount = weeklyHabitCompletions[wk]?.size || 0
          if (completedCount >= expectedCompletions) {
            hasPerfectWeek = true
            break
          }
        }
      }
    }
  }

  // 7. Get already earned achievements
  const achievements = await getAchievements(userId)
  const earnedKeys = new Set(achievements.map(a => a.badge_key))
  const newBadges: string[] = []

  const checkBadge = async (key: string, condition: boolean) => {
    if (!earnedKeys.has(key) && condition) {
      await supabase.from('achievements').insert({
        user_id: userId,
        badge_key: key,
      })
      newBadges.push(key)
    }
  }

  await checkBadge('first_session', (allSessions || []).length >= 1)
  await checkBadge('week_warrior', dwStreakCurrent >= 7)
  await checkBadge('habit_streak_7', maxHabitStreak >= 7)
  await checkBadge('100_hours', totalHours >= 100)
  await checkBadge('shutdown_30', (shutdownCount || 0) >= 30)
  await checkBadge('quality_8', maxQualityScore >= 8)
  await checkBadge('perfect_week', hasPerfectWeek)

  return newBadges
}

export async function getRecentXPGains(userId: string, sinceMinutes = 5): Promise<XPEvent[]> {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('xp_events')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  return (data || []) as XPEvent[]
}

// ─── Planner Blocks ───────────────────────────
export async function getPlannerBlocks(userId: string, date: string): Promise<PlannerBlock[]> {
  const { data } = await supabase
    .from('planner_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('block_date', date)
    .order('start_slot', { ascending: true })
  return (data || []) as PlannerBlock[]
}

export async function createPlannerBlock(block: {
  user_id: string
  block_date: string
  start_slot: number
  end_slot: number
  title: string
  task_id?: string | null
  project_id?: string | null
  block_type?: string
}) {
  const { data, error } = await supabase
    .from('planner_blocks')
    .insert(block)
    .select()
    .single()
  if (error) throw error
  return data as PlannerBlock
}

export async function updatePlannerBlock(id: string, updates: Partial<PlannerBlock>) {
  const { data, error } = await supabase
    .from('planner_blocks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as PlannerBlock
}

export async function deletePlannerBlock(id: string) {
  const { error } = await supabase
    .from('planner_blocks')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function mergePlannerBlocks(keepId: string, removeId: string, newEndSlot: number) {
  // Update the kept block's end_slot, then delete the removed block
  const { error: updateErr } = await supabase
    .from('planner_blocks')
    .update({ end_slot: newEndSlot })
    .eq('id', keepId)
  if (updateErr) throw updateErr

  const { error: delErr } = await supabase
    .from('planner_blocks')
    .delete()
    .eq('id', removeId)
  if (delErr) throw delErr
}

// ═══════════════════════════════════════════════
// Finance / Budget Tracker
// ═══════════════════════════════════════════════

// ─── Finance: Accounts (wallets) ──────────────
export async function getAccounts(userId: string): Promise<FinanceAccount[]> {
  const { data } = await supabase.from('finance_accounts')
    .select('*').eq('user_id', userId).eq('is_active', true)
    .order('sort_order').order('created_at')
  return (data || []) as FinanceAccount[]
}
export async function createAccount(a: Omit<FinanceAccount, 'id' | 'created_at'>) {
  const { data, error } = await supabase.from('finance_accounts').insert(a).select().single()
  if (error) throw error
  return data as FinanceAccount
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
  if (error) throw error
  return data as FinanceCategory
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
    const expense: [string, string][] = [
      ['Food & Dining', '#E85D5D'], ['Travel', '#5B9BD5'], ['Groceries', '#4CAF7D'],
      ['Rent/Hostel', '#F5A623'], ['Mobile/Internet', '#9B7EDE'], ['Education', '#50b380'],
      ['Entertainment', '#E89B5D'], ['Shopping', '#E85D9B'], ['Health', '#5DC9E8'], ['Misc', '#888888'],
    ]
    const income: [string, string][] = [
      ['Allowance', '#96fac2'], ['Freelance', '#5B9BD5'], ['Gifts', '#F5A623'], ['Other', '#888888'],
    ]
    const rows = [
      ...expense.map(([name, color], i) => ({ user_id: userId, name, kind: 'expense', color, sort_order: i, is_archived: false, monthly_budget: null, icon: null })),
      ...income.map(([name, color], i) => ({ user_id: userId, name, kind: 'income', color, sort_order: i, is_archived: false, monthly_budget: null, icon: null })),
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
  if (error) throw error
  return data as Transaction
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

  const isFamily = (t: Transaction) => t.scope === 'family'

  let monthIncome = 0, monthExpense = 0, monthExpenseFamily = 0
  for (const t of monthTxns) {
    if (t.type === 'income') monthIncome += Number(t.amount)
    else if (t.type === 'expense') {
      if (isFamily(t)) monthExpenseFamily += Number(t.amount)
      else monthExpense += Number(t.amount)
    }
  }

  const catMap = new Map(categories.map(c => [c.id, c]))
  const spendSelf = new Map<string, number>()
  const spendFamily = new Map<string, number>()
  for (const t of monthTxns) {
    if (t.type !== 'expense' || !t.category_id) continue
    const m = isFamily(t) ? spendFamily : spendSelf
    m.set(t.category_id, (m.get(t.category_id) || 0) + Number(t.amount))
  }
  const toCatSpend = (m: Map<string, number>): CategorySpend[] => [...m.entries()].map(([id, total]) => ({
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
    totalBalance, monthIncome, monthExpense, monthExpenseFamily,
    monthNet: monthIncome - monthExpense - monthExpenseFamily,
    accounts: accountsWithBal,
    categorySpend: toCatSpend(spendSelf), categorySpendFamily: toCatSpend(spendFamily),
    dailySeries, recentTransactions: monthTxns.slice(0, 8),
  }
}

// Per-expense-category budget vs actual for the month. Used by the Budgets tab.
export async function getBudgetStatus(userId: string, ref: Date = new Date()): Promise<CategoryBudgetStatus[]> {
  const { start, end } = monthRange(ref)
  const [categories, monthTxns] = await Promise.all([
    getCategories(userId),
    getTransactions(userId, { start, end, type: 'expense' }),
  ])
  const spend = new Map<string, number>()
  for (const t of monthTxns) {
    if (!t.category_id || t.scope === 'family') continue // budgets track personal spend only
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
      if ((a.budget > 0) !== (b.budget > 0)) return a.budget > 0 ? -1 : 1
      if (a.budget > 0) return b.pct - a.pct
      return b.spent - a.spent
    })
}

// ─── Finance: Savings goals ───────────────────
// Goal "saved" = wallet→goal deposits minus goal→wallet withdrawals (linked transactions),
// plus any legacy savings_contributions rows (pre-transaction model).
export async function getSavingsGoals(userId: string): Promise<SavingsGoalStatus[]> {
  const [{ data: goals }, { data: goalTx }, { data: contribs }] = await Promise.all([
    supabase.from('savings_goals').select('*').eq('user_id', userId).order('is_achieved').order('sort_order').order('created_at'),
    supabase.from('transactions').select('goal_id, type, amount, account_id, to_account_id').eq('user_id', userId).not('goal_id', 'is', null),
    supabase.from('savings_contributions').select('goal_id, amount').eq('user_id', userId),
  ])
  const savedMap = new Map<string, number>()
  for (const t of (goalTx || []) as { goal_id: string; type: string; amount: number; account_id: string | null; to_account_id: string | null }[]) {
    // deposit = transfer out of a wallet into the goal (+); withdraw = income back to a wallet (−),
    // or legacy transfer-to-wallet (−)
    let delta = 0
    if (t.type === 'income') delta = -Number(t.amount)
    else if (t.type === 'transfer') delta = (t.account_id ? Number(t.amount) : 0) - (t.to_account_id ? Number(t.amount) : 0)
    savedMap.set(t.goal_id, (savedMap.get(t.goal_id) || 0) + delta)
  }
  for (const c of (contribs || []) as { goal_id: string; amount: number }[]) {
    savedMap.set(c.goal_id, (savedMap.get(c.goal_id) || 0) + Number(c.amount))
  }
  return ((goals || []) as SavingsGoal[]).map(g => {
    const saved = Math.max(0, savedMap.get(g.id) || 0)
    const target = Number(g.target_amount) || 0
    const remaining = Math.max(0, target - saved)
    const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0
    return { ...g, saved, remaining, pct, daysLeft: g.target_date ? daysUntil(g.target_date) : null }
  })
}

// Move money into ('add') or out of ('withdraw') a goal, recorded as a wallet↔goal transfer.
// Returns { justAchieved } when an add first funds the goal.
export async function moveGoalMoney(
  userId: string,
  goal: SavingsGoalStatus,
  amount: number,
  direction: 'add' | 'withdraw',
  walletId: string | null,
): Promise<{ justAchieved: boolean }> {
  const isAdd = direction === 'add'
  // Add = transfer out of the wallet into the goal (neutral to income/expense).
  // Withdraw = income back into the wallet, flagged as moved from the goal.
  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    type: isAdd ? 'transfer' : 'income',
    amount,
    category_id: null,
    account_id: walletId,
    to_account_id: null,
    goal_id: goal.id,
    scope: 'self',
    txn_date: new Date().toISOString().split('T')[0],
    note: isAdd ? `Savings → ${goal.name}` : `Moved from ${goal.name}`,
    recurring_id: null,
  })
  if (error) throw error
  const newSaved = goal.saved + (isAdd ? amount : -amount)
  const justAchieved = isAdd && !goal.is_achieved && newSaved >= Number(goal.target_amount)
  if (justAchieved) await supabase.from('savings_goals').update({ is_achieved: true }).eq('id', goal.id)
  else if (!isAdd && goal.is_achieved && newSaved < Number(goal.target_amount)) {
    await supabase.from('savings_goals').update({ is_achieved: false }).eq('id', goal.id)
  }
  return { justAchieved }
}

// Reconcile a wallet to its true balance by inserting an adjustment transaction
// for the difference (income if you have more than logged, expense if less).
export async function adjustWalletBalance(
  userId: string,
  accountId: string,
  currentBalance: number,
  actualBalance: number,
): Promise<number> {
  const diff = Math.round((actualBalance - currentBalance) * 100) / 100
  if (diff === 0) return 0
  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    type: diff > 0 ? 'income' : 'expense',
    amount: Math.abs(diff),
    category_id: null,
    account_id: accountId,
    to_account_id: null,
    goal_id: null,
    scope: 'self',
    txn_date: new Date().toISOString().split('T')[0],
    note: 'Balance adjustment',
    recurring_id: null,
  })
  if (error) throw error
  return diff
}

export async function createSavingsGoal(g: Omit<SavingsGoal, 'id' | 'created_at'>) {
  const { data, error } = await supabase.from('savings_goals').insert(g).select().single()
  if (error) throw error
  return data as SavingsGoal
}
export async function updateSavingsGoal(id: string, updates: Partial<SavingsGoal>) {
  const { error } = await supabase.from('savings_goals').update(updates).eq('id', id)
  if (error) throw error
}
export async function deleteSavingsGoal(id: string) {
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

// ─── Finance: Recurring rules ─────────────────
export async function getRecurringRules(userId: string): Promise<RecurringRule[]> {
  const { data } = await supabase.from('recurring_rules')
    .select('*').eq('user_id', userId).eq('is_active', true)
    .order('next_run')
  return (data || []) as RecurringRule[]
}
export async function createRecurringRule(r: Omit<RecurringRule, 'id' | 'created_at'>) {
  const { data, error } = await supabase.from('recurring_rules').insert(r).select().single()
  if (error) throw error
  return data as RecurringRule
}
export async function updateRecurringRule(id: string, updates: Partial<RecurringRule>) {
  const { error } = await supabase.from('recurring_rules').update(updates).eq('id', id)
  if (error) throw error
}
export async function deleteRecurringRule(id: string) {
  const { error } = await supabase.from('recurring_rules').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// Materializes any due recurring occurrences into transactions and advances next_run.
// Cron-free: runs on page load. Returns how many transactions were created.
export async function processDueRecurring(userId: string): Promise<number> {
  const rules = await getRecurringRules(userId)
  const today = new Date().toISOString().split('T')[0]
  let created = 0
  for (const r of rules) {
    let next = r.next_run
    const toInsert: Omit<Transaction, 'id' | 'created_at'>[] = []
    let guard = 0
    while (next <= today && guard < 120) {
      toInsert.push({
        user_id: userId, type: r.type, amount: Number(r.amount),
        category_id: r.category_id, account_id: r.account_id, to_account_id: null, goal_id: null, scope: 'self',
        txn_date: next, note: r.note, recurring_id: r.id,
      })
      next = addPeriod(next, r.frequency)
      guard++
    }
    if (toInsert.length > 0) {
      await supabase.from('transactions').insert(toInsert)
      await supabase.from('recurring_rules').update({ next_run: next }).eq('id', r.id)
      created += toInsert.length
    }
  }
  return created
}

// ─── Finance: Monthly trends ──────────────────
export async function getMonthlyTrends(userId: string, months = 6, ref: Date = new Date()): Promise<MonthlyTrend[]> {
  const startDate = shiftMonth(ref, -(months - 1))
  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`
  const end = monthRange(ref).end
  const txns = await getTransactions(userId, { start, end })

  // Pre-seed every month bucket so gaps render as zero.
  const buckets = new Map<string, MonthlyTrend>()
  for (let i = months - 1; i >= 0; i--) {
    const m = shiftMonth(ref, -i)
    buckets.set(monthKey(m), {
      month: monthKey(m),
      label: m.toLocaleDateString('en-IN', { month: 'short' }),
      income: 0, expense: 0, net: 0,
    })
  }
  for (const t of txns) {
    const key = t.txn_date.slice(0, 7)
    const b = buckets.get(key)
    if (!b) continue
    if (t.type === 'income') b.income += Number(t.amount)
    else if (t.type === 'expense') b.expense += Number(t.amount)
  }
  return [...buckets.values()].map(b => ({ ...b, net: b.income - b.expense }))
}
