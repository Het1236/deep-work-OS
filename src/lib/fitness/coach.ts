// The prescriptive engine. Pure and deterministic — given the same inputs it
// always returns the same prescription.
//
// The rails below are code, not prompt text. An LLM may later phrase the
// reasoning in nicer English, but it must never be the thing deciding training
// load. If you are tempted to move any of this into a model prompt, don't.

import type {
  ProgramDay, PrescribedSession, AcwrPoint, ZoneSeconds, DailyReadiness,
} from '@/lib/types'
import { easyShare } from '@/lib/fitness/load'

export type CoachInput = {
  date: string
  programDay: ProgramDay | null
  acwr: AcwrPoint | null
  zones7d: ZoneSeconds | null
  readiness: DailyReadiness | null
  rhr: { baseline: number | null; latest: number | null; elevated: boolean; delta: number | null }
  weeklyKm: { week: string; km: number }[]
  weeksSinceDeload: number
  recentDecouplingPct: number | null
}

export type CoachOutput = {
  session: PrescribedSession
  reasoning: string
  inputsUsed: string[]
  flags: string[]
}

const EASY_TARGET = 80          // % of run time that should be Z1+Z2
const VOLUME_CAP = 1.10         // never more than +10% weekly running volume
const ACWR_NO_HARD = 1.4
const DELOAD_AFTER_WEEKS = 6

export function prescribe(input: CoachInput): CoachOutput {
  const {
    programDay, acwr, zones7d, readiness, rhr, weeklyKm, weeksSinceDeload, recentDecouplingPct,
  } = input

  const inputsUsed: string[] = []
  const flags: string[] = []
  const reasons: string[] = []

  if (acwr && acwr.band !== 'insufficient') inputsUsed.push('acwr')
  if (zones7d) inputsUsed.push('zone_distribution')
  if (readiness) inputsUsed.push('readiness')
  if (rhr.elevated || rhr.latest != null) inputsUsed.push('resting_hr')
  if (weeklyKm.length >= 2) inputsUsed.push('weekly_volume')
  if (recentDecouplingPct != null) inputsUsed.push('decoupling')

  // ── Rest days pass straight through. Recovery is prescribed, not earned. ──
  if (!programDay || programDay.day_type === 'rest') {
    return {
      session: { kind: 'rest', title: programDay?.title ?? 'Rest', adjustment: 'hold' },
      reasoning: 'Scheduled rest and mobility. This is training, not a gap — it is what lets you stack good weeks.',
      inputsUsed, flags,
    }
  }

  // ── Rail 3: forced deload, overrides everything below ──
  if (weeksSinceDeload >= DELOAD_AFTER_WEEKS) {
    flags.push('deload_due')
    return {
      session: {
        kind: programDay.day_type === 'run' ? 'run' : 'lift',
        title: `${programDay.title} (deload)`,
        distanceKm: programDay.target_distance_km
          ? Math.round(programDay.target_distance_km * 0.5 * 10) / 10 : undefined,
        adjustment: 'reduce',
      },
      reasoning:
        `You are ${weeksSinceDeload} weeks into this block without a deload. Halve today's volume regardless of ` +
        `how good you feel — what usually reads as a plateau is an under-recovered nervous system, and training ` +
        `through it is how people get hurt.`,
      inputsUsed, flags,
    }
  }

  // ── Rail 2: high acute load blocks hard sessions ──
  const hardBlocked = !!acwr && acwr.band !== 'insufficient' && acwr.ratio > ACWR_NO_HARD
  if (hardBlocked) {
    flags.push('acwr_high')
    reasons.push(
      `Your acute:chronic workload ratio is ${acwr!.ratio} (${acwr!.band.replace('_', ' ')}) — ` +
      `you have ramped faster than your base supports, so nothing hard today.`)
  }

  // ── Rail 4: readiness and RHR may only hold or reduce ──
  let reduce = hardBlocked
  if (readiness && readiness.readiness <= 2) {
    reduce = true
    flags.push('low_readiness')
    reasons.push(`You rated readiness ${readiness.readiness}/5, so today is dialled back rather than pushed.`)
  }
  if (rhr.elevated) {
    reduce = true
    flags.push('rhr_elevated')
    reasons.push(
      `Your resting heart rate is ${rhr.delta} bpm above your ${rhr.baseline} bpm baseline — a reliable early ` +
      `sign of overreaching or something coming on.`)
  }
  if (readiness && readiness.sleep_hours != null && readiness.sleep_hours < 6) {
    reduce = true
    flags.push('low_sleep')
    reasons.push(`${readiness.sleep_hours} h of sleep. Sleep sits above everything else — today is not the day to add load.`)
  }

  // ── Run days ──
  if (programDay.day_type === 'run') {
    const planned = programDay.target_distance_km ?? 4
    let km = planned

    // Rail 1: cap weekly growth at +10%
    if (weeklyKm.length >= 2) {
      const last = weeklyKm[weeklyKm.length - 1].km
      const prev = weeklyKm[weeklyKm.length - 2].km
      if (prev > 0 && last > prev * VOLUME_CAP) {
        flags.push('volume_cap')
        reasons.push(
          `Last week was ${last} km against ${prev} km the week before — more than the 10% step that tendons and ` +
          `bone adapt at. Holding volume steady this week.`)
        km = Math.min(km, planned)
      }
    }
    if (reduce) km = Math.round(planned * 0.7 * 10) / 10

    // The zone check — this user's actual problem
    let hrRange = '130–150 bpm'
    if (zones7d) {
      const share = easyShare(zones7d)
      if (share > 0 && share < EASY_TARGET) {
        flags.push('running_too_hard')
        reasons.push(
          `Only ${share}% of your running time last week was genuinely easy, against a target of ${EASY_TARGET}%. ` +
          `Slow down — running your easy runs at moderate intensity is the classic way to plateau and then get injured.`)
      } else if (share >= EASY_TARGET) {
        reasons.push(`${share}% of last week's running was in the easy zones. That is exactly right — keep it there.`)
      }
    }
    if (recentDecouplingPct != null && recentDecouplingPct > 5) {
      flags.push('decoupling_high')
      reasons.push(
        `Your heart rate drifted ${recentDecouplingPct}% relative to pace on your last long run, which means the ` +
        `aerobic base is still building. Stay easy rather than pushing pace.`)
    }

    const isQuality = programDay.run_type === 'interval' || programDay.run_type === 'tempo'
    if (isQuality && hardBlocked) {
      return {
        session: {
          kind: 'run', title: `${programDay.title} → easy instead`,
          distanceKm: km, hrRange, adjustment: 'reduce',
        },
        reasoning: reasons.join(' '),
        inputsUsed, flags,
      }
    }
    if (isQuality) hrRange = 'hard efforts, full recovery between'

    return {
      session: {
        kind: 'run',
        title: programDay.title,
        distanceKm: km,
        hrRange,
        paceRange: isQuality ? undefined : 'run to heart rate, not pace',
        adjustment: reduce ? 'reduce' : 'hold',
      },
      reasoning: reasons.length > 0
        ? reasons.join(' ')
        : `${km} km as planned, easy. Nothing in your data says otherwise.`,
      inputsUsed, flags,
    }
  }

  // ── Lift days ──
  const exercises = (programDay.program_exercises || []).map(pe => ({
    name: pe.exercises?.name ?? 'Exercise',
    sets: reduce ? Math.max(2, pe.target_sets - 1) : pe.target_sets,
    reps: pe.target_reps_min === pe.target_reps_max
      ? `${pe.target_reps_min}`
      : `${pe.target_reps_min}–${pe.target_reps_max}`,
  }))

  if (reduce) reasons.push('Dropping a set from each movement rather than skipping — keep the pattern, lose the load.')
  else reasons.push('Compounds at 5–8 reps. Add 2.5 kg only where you hit the top of the range on every set last time.')

  return {
    session: {
      kind: 'lift',
      title: reduce ? `${programDay.title} (reduced)` : programDay.title,
      exercises,
      adjustment: reduce ? 'reduce' : 'hold',
    },
    reasoning: reasons.join(' '),
    inputsUsed, flags,
  }
}

// How many weeks since the last deload. Used by rail 3.
export function weeksSinceDeload(startDate: string | null, today = new Date()): number {
  if (!startDate) return 0
  const start = new Date(startDate)
  return Math.floor((today.getTime() - start.getTime()) / (7 * 86_400_000))
}
