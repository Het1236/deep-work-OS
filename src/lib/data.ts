import { createClient } from '@/lib/supabase/client'
import type {
  Profile, DeepWorkSession, Habit, HabitLog,
  Goal, Project, Task, JournalEntry, TimeBlock,
  Achievement, XPEvent, DashboardStats, Group, Note, PlannerBlock, ScoreboardData
} from '@/lib/types'

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
  const level = Math.floor(xpTotal / 1000) + 1
  const xpInLevel = xpTotal % 1000
  const xpForNext = 1000
  const progress = (xpInLevel / xpForNext) * 100
  return { level, xpInLevel, xpForNext, progress }
}

// ─── Gamification Engine ──────────────────────
export type XPAction =
  | 'session_complete'   // +10 XP per hour of deep work
  | 'habit_complete'     // +5 XP per habit checked
  | 'shutdown_ritual'    // +15 XP for completing shutdown
  | 'journal_entry'      // +10 XP per journal entry

const XP_VALUES: Record<XPAction, number> = {
  session_complete: 10,
  habit_complete: 5,
  shutdown_ritual: 15,
  journal_entry: 10,
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

// Badge definitions with check logic
type BadgeCheck = {
  key: string
  check: (ctx: BadgeContext) => boolean
}

type BadgeContext = {
  totalHours: number
  streakCurrent: number
  sessionCount: number
  shutdownCount: number
  achievements: Achievement[]
}

const BADGE_CHECKS: BadgeCheck[] = [
  { key: 'first_session', check: (ctx) => ctx.sessionCount >= 1 },
  { key: 'week_warrior', check: (ctx) => ctx.streakCurrent >= 7 },
  { key: 'habit_streak_7', check: (ctx) => ctx.streakCurrent >= 7 },
  { key: '100_hours', check: (ctx) => ctx.totalHours >= 100 },
  { key: 'shutdown_30', check: (ctx) => ctx.shutdownCount >= 30 },
]

export async function checkAndAwardBadges(userId: string): Promise<string[]> {
  // Gather context
  const [profile, achievements] = await Promise.all([
    getProfile(userId),
    getAchievements(userId),
  ])

  // Count total session hours
  const { data: sessions } = await supabase
    .from('deep_work_sessions')
    .select('duration_minutes')
    .eq('user_id', userId)
    .not('duration_minutes', 'is', null)
  const totalHours = (sessions || []).reduce((s, r) => s + ((r.duration_minutes || 0) / 60), 0)

  // Count shutdown rituals (journal entries with shutdown_done)
  const { count: shutdownCount } = await supabase
    .from('journal_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('shutdown_done', true)

  const ctx: BadgeContext = {
    totalHours,
    streakCurrent: profile?.streak_current || 0,
    sessionCount: (sessions || []).length,
    shutdownCount: shutdownCount || 0,
    achievements,
  }

  const earnedKeys = new Set(achievements.map(a => a.badge_key))
  const newBadges: string[] = []

  for (const badge of BADGE_CHECKS) {
    if (!earnedKeys.has(badge.key) && badge.check(ctx)) {
      await supabase.from('achievements').insert({
        user_id: userId,
        badge_key: badge.key,
      })
      newBadges.push(badge.key)
    }
  }

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
