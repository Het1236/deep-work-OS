// Data access for the hybrid fitness system: exercises, programmes, live
// sessions, runs and the meal plan. Kept out of the main data.ts, which is
// already large — this module owns everything the /fitness routes need.

import { createClient } from '@/lib/supabase/client'
import type {
  Exercise, Program, ProgramDay, ProgramExercise, Run,
  MealPlanItem, SessionDraft, Workout, WorkoutSet, MetricType,
} from '@/lib/types'

const supabase = createClient()

// ─── Exercises ────────────────────────────────────────────────
export async function getExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('is_archived', false)
    .order('name')
  if (error) throw error
  return (data || []) as Exercise[]
}

export async function createExercise(userId: string, e: Partial<Exercise>): Promise<Exercise> {
  const slug = (e.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      user_id: userId,
      name: e.name,
      slug,
      metric_type: e.metric_type || 'weight_reps',
      primary_muscle: e.primary_muscle || 'Other',
      secondary_muscles: e.secondary_muscles || [],
      equipment: e.equipment || 'other',
      form_cues: e.form_cues || [],
      is_isometric: e.is_isometric ?? false,
      default_rest_seconds: e.default_rest_seconds ?? 90,
    })
    .select()
    .single()
  if (error) throw error
  return data as Exercise
}

export async function updateExercise(id: string, updates: Partial<Exercise>): Promise<void> {
  const { error } = await supabase.from('exercises').update(updates).eq('id', id)
  if (error) throw error
}

// Archive rather than delete — logged sets reference the exercise.
export async function archiveExercise(id: string): Promise<void> {
  const { error } = await supabase.from('exercises').update({ is_archived: true }).eq('id', id)
  if (error) throw error
}

// ─── Programme ────────────────────────────────────────────────
export async function getActiveProgram(userId: string): Promise<Program | null> {
  const { data, error } = await supabase
    .from('programs')
    .select('*, program_days(*, program_exercises(*, exercises(*)))')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('day_of_week', { referencedTable: 'program_days', ascending: true })
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const program = data as Program
  for (const d of program.program_days || []) {
    d.program_exercises = (d.program_exercises || []).sort((a, b) => a.order_index - b.order_index)
  }
  program.program_days = (program.program_days || []).sort((a, b) => a.day_of_week - b.day_of_week)
  return program
}

export async function updateProgramDay(id: string, updates: Partial<ProgramDay>): Promise<void> {
  const { error } = await supabase.from('program_days').update(updates).eq('id', id)
  if (error) throw error
}

export async function addProgramExercise(
  userId: string, programDayId: string, exerciseId: string, orderIndex: number,
): Promise<ProgramExercise> {
  const { data, error } = await supabase
    .from('program_exercises')
    .insert({
      program_day_id: programDayId, user_id: userId, exercise_id: exerciseId,
      order_index: orderIndex, target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90,
    })
    .select('*, exercises(*)')
    .single()
  if (error) throw error
  return data as ProgramExercise
}

export async function updateProgramExercise(id: string, updates: Partial<ProgramExercise>): Promise<void> {
  const { error } = await supabase.from('program_exercises').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteProgramExercise(id: string): Promise<void> {
  const { error } = await supabase.from('program_exercises').delete().eq('id', id)
  if (error) throw error
}

export async function reorderProgramExercises(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id, i) =>
    supabase.from('program_exercises').update({ order_index: i }).eq('id', id)))
}

// ─── Live session ─────────────────────────────────────────────
// Only completed, non-empty sets are persisted. A set the user skipped should
// leave no trace, otherwise every stat is polluted by sets that never happened.
function setHasData(s: { weight_kg: number | null; reps: number | null; hold_seconds: number | null; duration_seconds: number | null; distance_km: number | null }) {
  return s.weight_kg != null || s.reps != null || s.hold_seconds != null
      || s.duration_seconds != null || s.distance_km != null
}

export async function saveSession(userId: string, draft: SessionDraft): Promise<string> {
  const endedAt = new Date().toISOString()
  const durationSeconds = Math.max(
    0, Math.round((new Date(endedAt).getTime() - new Date(draft.startedAt).getTime()) / 1000))

  const { data: workout, error: wErr } = await supabase
    .from('workouts')
    .insert({
      user_id: userId,
      title: draft.title,
      started_at: draft.startedAt,
      ended_at: endedAt,
      source: 'live',
      program_day_id: draft.programDayId,
      duration_seconds: durationSeconds,
    })
    .select()
    .single()
  if (wErr) throw wErr

  const rows: Record<string, unknown>[] = []
  for (const ex of draft.exercises) {
    let idx = 0
    for (const s of ex.sets) {
      if (!s.done || !setHasData(s)) continue
      rows.push({
        workout_id: workout.id,
        user_id: userId,
        exercise_id: ex.exercise_id,
        exercise_title: ex.name,
        set_index: idx++,
        set_type: s.is_warmup ? 'warmup' : 'normal',
        weight_kg: s.weight_kg,
        reps: s.reps,
        hold_seconds: s.hold_seconds,
        duration_seconds: s.duration_seconds,
        distance_km: s.distance_km,
        rpe: s.rpe,
        is_warmup: s.is_warmup,
        completed_at: endedAt,
      })
    }
  }
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('workout_sets').insert(rows.slice(i, i + 500))
      if (error) throw error
    }
  }
  return workout.id as string
}

// Most recent completed sets for one exercise — powers the "last time: 40kg x 8"
// line in the logger, which is the single most useful thing on the screen.
export async function getLastSetsForExercise(
  userId: string, exerciseId: string,
): Promise<{ started_at: string; sets: WorkoutSet[] } | null> {
  const { data } = await supabase
    .from('workout_sets')
    .select('*, workouts!inner(started_at)')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .order('started_at', { referencedTable: 'workouts', ascending: false })
    .limit(30)
  const rows = (data || []) as (WorkoutSet & { workouts: { started_at: string } })[]
  if (rows.length === 0) return null
  const latest = rows.reduce((a, b) => (a.workouts.started_at > b.workouts.started_at ? a : b))
  const day = latest.workouts.started_at
  return {
    started_at: day,
    sets: rows.filter(r => r.workouts.started_at === day).sort((a, b) => a.set_index - b.set_index),
  }
}

export async function getWorkoutWithSets(id: string): Promise<Workout | null> {
  const { data } = await supabase.from('workouts').select('*, workout_sets(*)').eq('id', id).single()
  return (data as Workout) || null
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', id)
  if (error) throw error
}

// ─── Runs ─────────────────────────────────────────────────────
export async function getRuns(userId: string, limit = 200): Promise<Run[]> {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []) as Run[]
}

export async function createRun(userId: string, r: Partial<Run>): Promise<Run> {
  const { data, error } = await supabase
    .from('runs')
    .insert({
      user_id: userId,
      source: 'manual',
      started_at: r.started_at || new Date().toISOString(),
      name: r.name || 'Run',
      distance_m: r.distance_m || 0,
      moving_time_s: r.moving_time_s || 0,
      avg_hr: r.avg_hr ?? null,
      run_type: r.run_type ?? null,
      program_day_id: r.program_day_id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Run
}

export async function deleteRun(id: string): Promise<void> {
  const { error } = await supabase.from('runs').delete().eq('id', id)
  if (error) throw error
}

export async function isStravaConnected(userId: string): Promise<boolean> {
  const { data } = await supabase.from('strava_accounts').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}

// ─── Meal plan ────────────────────────────────────────────────
export async function getMealPlan(userId: string): Promise<MealPlanItem[]> {
  const { data, error } = await supabase
    .from('meal_plan_items')
    .select('*')
    .eq('user_id', userId)
    .order('day_of_week')
    .order('order_index')
  if (error) throw error
  return (data || []) as MealPlanItem[]
}

export async function updateMealPlanItem(id: string, updates: Partial<MealPlanItem>): Promise<void> {
  const { error } = await supabase.from('meal_plan_items').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteMealPlanItem(id: string): Promise<void> {
  const { error } = await supabase.from('meal_plan_items').delete().eq('id', id)
  if (error) throw error
}

export async function createMealPlanItem(userId: string, item: Partial<MealPlanItem>): Promise<MealPlanItem> {
  const { data, error } = await supabase
    .from('meal_plan_items')
    .insert({ user_id: userId, ...item })
    .select()
    .single()
  if (error) throw error
  return data as MealPlanItem
}

// One-tap log: turn a plan slot into a real `meals` row for the given IST date.
export async function logPlannedMeal(userId: string, item: MealPlanItem, mealDate: string): Promise<void> {
  const { error } = await supabase.from('meals').insert({
    user_id: userId,
    meal_date: mealDate,
    meal_type: item.meal_type,
    name: item.title,
    source: 'plan',
    kcal: item.kcal,
    protein_g: item.protein_g,
    carbs_g: item.carbs_g,
    fat_g: item.fat_g,
  })
  if (error) throw error
}

// ─── Stats bundle ─────────────────────────────────────────────
export type StatsBundle = {
  workouts: (Workout & { workout_sets: WorkoutSet[] })[]
  runs: Run[]
  sets: (WorkoutSet & { started_at: string; muscle: string | null })[]
}

export async function getStatsBundle(userId: string, sinceIso: string): Promise<StatsBundle> {
  const [wRes, rRes] = await Promise.all([
    supabase
      .from('workouts')
      .select('*, workout_sets(*, exercises(primary_muscle, metric_type))')
      .eq('user_id', userId)
      .gte('started_at', sinceIso)
      .order('started_at', { ascending: false }),
    supabase
      .from('runs')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', sinceIso)
      .order('started_at', { ascending: false }),
  ])

  type SetWithEx = WorkoutSet & { exercises: { primary_muscle: string; metric_type: MetricType } | null }
  const workouts = (wRes.data || []) as (Workout & { workout_sets: SetWithEx[] })[]
  const sets: (WorkoutSet & { started_at: string; muscle: string | null })[] = []
  for (const w of workouts) {
    for (const s of w.workout_sets || []) {
      sets.push({ ...s, started_at: w.started_at, muscle: s.exercises?.primary_muscle ?? null })
    }
  }
  return {
    workouts: workouts as unknown as (Workout & { workout_sets: WorkoutSet[] })[],
    runs: (rRes.data || []) as Run[],
    sets,
  }
}
