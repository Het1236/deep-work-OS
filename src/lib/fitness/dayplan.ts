// Day plan derivation. Pure — no I/O, no framework, no clock reads beyond what
// is passed in. A day is composed from schedule primitives rather than authored,
// so a lecture moving in one place moves it everywhere.
//
// Conflicts are SURFACED, never silently resolved. A run that does not fit
// before an 08:00 lecture must say so; a quietly shortened run teaches the user
// to distrust the planner and they only find out when training stops working.

import type {
  ClassScheduleItem, RoutineSettings, DayOverride, ProgramDay,
  MealPlanItem, MealOption, TimelineBlock, DayPlan,
} from '@/lib/types'

// ─── Time helpers (minutes from midnight) ─────────────────────
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}
export function toHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Estimated door-to-door minutes for a prescribed run: warm-up, the run itself
// at an easy-pace assumption, strides, cool-down.
export function runDurationMinutes(distanceKm: number | null, runType: string | null): number {
  const km = distanceKm ?? 4
  const easyPaceMinPerKm = 9.25          // deliberately conservative
  const core = km * easyPaceMinPerKm
  const strides = runType === 'strides' ? 8 : 0
  const intervals = runType === 'interval' ? 12 : 0
  return Math.round(core + strides + intervals + 12)   // +12 warm-up & cool-down
}

export type DayPlanInput = {
  date: string                       // YYYY-MM-DD
  dayOfWeek: number                  // 0 = Monday
  classes: ClassScheduleItem[]
  programDay: ProgramDay | null
  mealSlots: (MealPlanItem & { option?: MealOption | null })[]
  routine: RoutineSettings
  overrides: DayOverride[]
}

export function buildDayPlan(input: DayPlanInput): DayPlan {
  const { date, dayOfWeek, routine, overrides } = input
  const blocks: TimelineBlock[] = []
  const warnings: string[] = []

  const skipTraining = overrides.some(o => o.kind === 'skip_training')
  const isHoliday = overrides.some(o => o.kind === 'holiday')

  const classes = (isHoliday ? [] : input.classes)
    .filter(c => c.is_active && c.day_of_week === dayOfWeek)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  const wake = toMin(routine.wake_time)
  const sleep = toMin(routine.sleep_time)
  const programDay = skipTraining ? null : input.programDay

  // ── 1. Anchor: leaving home, and therefore when the routine starts ──
  let leaveHome: number | null = null
  let routineStart = wake
  if (classes.length > 0) {
    leaveHome = toMin(classes[0].start_time) - routine.commute_minutes
    routineStart = leaveHome - routine.routine_minutes
    if (routineStart < wake) {
      warnings.push(
        `Your ${routine.routine_minutes}-minute routine does not fit before leaving at ${toHHMM(leaveHome)}. ` +
        `You would need to wake at ${toHHMM(routineStart)}.`)
      routineStart = wake
    }
  } else {
    routineStart = wake + 15
  }

  // ── 2. Morning training (runs) ──
  const isRunDay = programDay?.day_type === 'run'
  const isLiftDay = programDay?.day_type === 'lift'
  let runEnd: number | null = null

  if (isRunDay && programDay) {
    const dur = runDurationMinutes(programDay.target_distance_km, programDay.run_type)
    const preMeal = 10
    const start = wake + preMeal
    const end = start + dur
    if (classes.length > 0 && end > routineStart) {
      warnings.push(
        `A ${programDay.target_distance_km ?? '?'} km run needs about ${dur} min, which does not fit ` +
        `between waking at ${toHHMM(wake)} and starting your routine at ${toHHMM(routineStart)}. ` +
        `Wake ${end - routineStart} min earlier, or move the run to the evening.`)
    }
    blocks.push({
      start: toHHMM(wake), end: toHHMM(wake + preMeal), kind: 'wake',
      title: 'Wake', detail: '500 ml warm water before anything else.',
    })
    blocks.push({
      start: toHHMM(start), end: toHHMM(end), kind: 'run',
      title: programDay.title,
      detail: programDay.notes ?? undefined,
      meta: [
        programDay.target_distance_km ? `${programDay.target_distance_km} km` : null,
        programDay.run_type,
        'run to heart rate, not pace',
      ].filter(Boolean).join(' · '),
    })
    runEnd = end
  } else {
    blocks.push({
      start: toHHMM(wake), end: toHHMM(Math.min(wake + 15, routineStart)), kind: 'wake',
      title: 'Wake', detail: '500 ml warm water before anything else.',
    })
  }

  // ── 3. Routine ──
  const actualRoutineStart = Math.max(routineStart, runEnd ?? routineStart)
  blocks.push({
    start: toHHMM(actualRoutineStart),
    end: toHHMM(actualRoutineStart + routine.routine_minutes),
    kind: 'routine',
    title: 'Shower · prayer · breakfast',
    meta: `${routine.routine_minutes} min`,
  })

  // ── 4. Commute out, lectures, commute back ──
  if (leaveHome != null && classes.length > 0) {
    blocks.push({
      start: toHHMM(leaveHome), end: toHHMM(leaveHome + routine.commute_minutes),
      kind: 'travel', title: 'Leave home → campus',
      meta: `${routine.commute_minutes} min`,
    })
    for (const c of classes) {
      blocks.push({
        start: c.start_time.slice(0, 5), end: c.end_time.slice(0, 5), kind: 'class',
        title: c.course_code ? `${c.course_code} ${c.title}` : c.title,
        detail: c.location ?? undefined,
      })
    }
  }

  // ── 5. Lifts — first workable gap, respecting the gym closure ──
  if (isLiftDay && programDay) {
    const lastClassEnd = classes.length > 0 ? toMin(classes[classes.length - 1].end_time) : null
    const preferred = programDay.scheduled_time ? toMin(programDay.scheduled_time) : null
    const gymShut = routine.gym_closed_from && routine.gym_closed_to
      ? [toMin(routine.gym_closed_from), toMin(routine.gym_closed_to)] as const
      : null

    let start = preferred ?? (lastClassEnd != null ? lastClassEnd + 15 : wake + 240)

    // Push out of the gym's closed window rather than scheduling into it.
    if (gymShut && start >= gymShut[0] && start < gymShut[1]) start = gymShut[1] + 15

    // Never schedule on top of a lecture.
    const clash = classes.find(c => start < toMin(c.end_time) && start + 90 > toMin(c.start_time))
    if (clash) {
      const moved = toMin(clash.end_time) + 15
      warnings.push(
        `Gym at ${toHHMM(start)} clashes with ${clash.course_code ?? clash.title}. Moved to ${toHHMM(moved)}.`)
      start = moved
    }

    blocks.push({
      start: toHHMM(start), end: toHHMM(start + 90), kind: 'lift',
      title: programDay.title,
      detail: programDay.notes ?? undefined,
      meta: `${programDay.program_exercises?.length ?? 0} exercises · 90 min`,
    })
  }

  if (programDay?.day_type === 'rest') {
    const start = programDay.scheduled_time ? toMin(programDay.scheduled_time) : wake + 180
    blocks.push({
      start: toHHMM(start), end: toHHMM(start + 40), kind: 'mobility',
      title: programDay.title,
      detail: programDay.notes ?? 'Yoga or mobility: hips, ankles, thoracic spine, hamstrings.',
      meta: '40 min',
    })
  }

  if (classes.length > 0) {
    const lastEnd = toMin(classes[classes.length - 1].end_time)
    const liftBlock = blocks.find(b => b.kind === 'lift')
    const homeAt = liftBlock ? Math.max(lastEnd, toMin(liftBlock.end)) : lastEnd
    blocks.push({
      start: toHHMM(homeAt), end: toHHMM(homeAt + routine.commute_minutes),
      kind: 'travel', title: 'Campus → home', meta: `${routine.commute_minutes} min`,
    })
  }

  // ── 6. Meals ──
  let kcal = 0, protein = 0
  for (const slot of input.mealSlots) {
    const o = slot.option
    const start = toMin(slot.slot_time)
    const k = o?.kcal ?? slot.kcal
    const p = Number(o?.protein_g ?? slot.protein_g)
    kcal += k; protein += p

    const during = classes.find(c => start >= toMin(c.start_time) && start < toMin(c.end_time))
    blocks.push({
      start: toHHMM(start), end: toHHMM(start + 25), kind: 'meal',
      title: o?.title ?? slot.title,
      detail: o?.detail ?? slot.detail ?? undefined,
      meta: slot.slot_label,
      macros: { kcal: k, protein_g: p },
      mealPlanItemId: slot.id,
      conflict: during
        ? `Falls during ${during.course_code ?? during.title} — pack it or shift it.`
        : undefined,
    })
  }

  // ── 7. Study blocks in any gap of 45 min or more ──
  // Meals count as busy: excluding them produced a single six-hour "study
  // block" spanning dinner, which is an empty evening with a label on it rather
  // than a plan. Long gaps are also split, because nobody studies for 6 hours
  // straight and a block you can't honour teaches you to ignore the planner.
  const MAX_BLOCK = 120
  const MIN_BLOCK = 45
  const windDownStart = sleep - routine.winddown_minutes

  const busy = blocks
    .map(b => [toMin(b.start), toMin(b.end)] as const)
    .sort((a, b) => a[0] - b[0])

  const gaps: [number, number][] = []
  let cursor = actualRoutineStart + routine.routine_minutes
  for (const [s, e] of busy) {
    if (s > cursor && cursor < windDownStart) gaps.push([cursor, Math.min(s, windDownStart)])
    cursor = Math.max(cursor, e)
  }
  if (cursor < windDownStart) gaps.push([cursor, windDownStart])

  for (const [gs, ge] of gaps) {
    let s = gs
    while (ge - s >= MIN_BLOCK) {
      const e = Math.min(s + MAX_BLOCK, ge)
      blocks.push({
        start: toHHMM(s), end: toHHMM(e), kind: 'study',
        title: 'Study block', meta: `${e - s} min`,
      })
      s = e
    }
  }

  // ── 8. Wind-down and sleep ──
  blocks.push({
    start: toHHMM(windDownStart), end: toHHMM(sleep), kind: 'winddown',
    title: 'Wind-down', detail: 'Pack tomorrow’s tiffin, lay out kit, screens down.',
  })
  blocks.push({
    start: toHHMM(sleep), end: toHHMM(toMin(routine.wake_time)), kind: 'sleep',
    title: 'Sleep',
    meta: `${Math.round(((toMin(routine.wake_time) + 1440 - sleep) % 1440) / 6) / 10} h`,
  })

  blocks.sort((a, b) => toMin(a.start) - toMin(b.start))

  if (isHoliday) warnings.push('Marked as a holiday — lectures removed from this day.')
  if (skipTraining) warnings.push('Training skipped for this day by override.')

  return {
    date, dayOfWeek, blocks, warnings,
    totals: { kcal: Math.round(kcal), protein_g: Math.round(protein) },
  }
}
