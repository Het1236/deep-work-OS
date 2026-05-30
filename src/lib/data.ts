import { createClient } from '@/lib/supabase/client'
import type {
  Profile, DeepWorkSession, Habit, HabitLog,
  Goal, Project, Task, JournalEntry, TimeBlock,
  Achievement, XPEvent, DashboardStats, Group, Note, PlannerBlock, ScoreboardData,
  FinanceAccount, FinanceCategory, Transaction, BudgetOverview, CategorySpend, DailySpend,
} from '@/lib/types'
import { monthRange, accountBalance } from '@/lib/finance'

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

const XP_VALUES: Record<XPAction, number> = {
  session_complete: 10,
  habit_complete: 5,
  shutdown_ritual: 15,
  journal_entry: 10,
  finance_log: 3,
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
