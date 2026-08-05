# Hybrid Fitness — Design

**Date:** 2026-08-05
**Status:** Awaiting user review
**Scope:** Five subsystems, one schema. Replaces the read-only Hevy-import Workouts tab with a full training system.

---

## 1. Goal

Het is starting a 6-day hybrid-athlete programme (3 lifts, 3 runs) built around his SEM5 timetable. The app must hold the programme as **real editable data**, let him run a live logging session at the gym on his phone, ingest his runs from Strava, and report on both.

The training content itself is specified in the companion plan (Block 1, weeks 1–4). This document specifies the software.

### Non-goals

- No Wear OS / Samsung Watch app. Wear OS needs a separate native build for a worse logging experience; the watch's job is recording runs, which reaches us via Strava.
- No Samsung Health integration. It has no public cloud API — the Health Data SDK is on-device Android only. Runs arrive via Strava.
- Nutrition is untouched. `meals`, `nutrition_targets` and the AI vision flow stay exactly as they are. Only `nutrition_targets` values change (protein 117 → 135 g), which is data, not code.
- AI Report and Group features stay untouched (standing constraint).

---

## 2. Current state

`/fitness` has five tabs; **Workouts** is read-only analytics over a Hevy CSV import.

- `workouts` — id, user_id, title, started_at, ended_at, source, external_id
- `workout_sets` — workout_id, user_id, **exercise_title (free text)**, set_index, set_type, weight_kg, reps, distance_km, duration_seconds, rpe
- `src/lib/hevy.ts` — CSV parser, `epley1RM`, `computePRs`, `weeklyVolume`, `inferMuscleGroup`
- Existing data: **~2,700 sets across ~60 distinct exercise titles**

The blocking limitation: `exercise_title` is free text with no catalog behind it. There is nowhere to store how an exercise is measured, what muscles it works, or how to perform it.

---

## 3. Architecture

Five subsystems, built in dependency order. Each is independently testable.

```
exercises  ──►  programs  ──►  live session  ──►  analytics
   (1)            (2)              (3)              (5)
                                    ▲                ▲
                              runs (Strava) ─────────┘
                                   (4)
```

### 3.1 Exercise library

The keystone. One field — `metric_type` — drives which inputs the logger renders, which stats are computable, and how PRs are defined. Everything downstream depends on getting this right.

| `metric_type` | Inputs | Example |
|---|---|---|
| `weight_reps` | weight, reps | Smith Machine Squat |
| `reps` | reps | Push Up |
| `weighted_bodyweight` | added weight, reps | Weighted Pull-up |
| `assisted_bodyweight` | assistance weight, reps | Assisted Dip |
| `duration` | seconds | Plank |
| `weight_duration` | weight, hold seconds | **Seated Calf Raise (isometric)** |
| `distance_duration` | distance, time | Treadmill run |

`weight_duration` exists specifically because the programme's isometric holds (60 s hold, then reps) cannot be expressed in any Hevy-compatible shape. A set row must be able to carry *both* a hold and reps.

**Form guidance** lives on the exercise as `form_cues text[]` plus an optional `demo_url`. Cues are short imperative lines shown inline in the logger, collapsed by default.

**Seeding:** the ~60 distinct `exercise_title` values already in `workout_sets` are seeded as exercises with inferred `primary_muscle` (reuse `inferMuscleGroup`) and inferred `metric_type` (weight+reps present → `weight_reps`, reps only → `reps`, etc.). The ~25 movements in the programme get hand-authored form cues; the rest get cues later or none.

### 3.2 Programme

A programme is an ordered set of weekday slots. Het's is one programme, seven `program_days`, three of which carry exercises.

`programs` → `program_days` (one per weekday) → `program_exercises` (ordered, with targets).

Run days carry a target distance and run type instead of exercises. Rest days carry only notes.

Targets are **ranges** (`target_reps_min` / `target_reps_max`), because the programme prescribes 5–8 and 10–12, not fixed numbers.

### 3.3 Live session

A dedicated full-screen route, `/fitness/session`, deliberately outside `.ft-wrap`.

The existing `ft-` CSS is desktop-first — `max-width: 920px`, hover states, a 7-column grid that squeezes to 44 px cells on mobile. A set-logging row needs the opposite: full-bleed, ≥56 px rows, no hover, thumb-reachable actions. The session screen gets its own `fs-` prefix rather than inheriting.

Flow: start from a programme day (pre-fills exercises and targets) or blank → log sets → finish → summary.

- Inputs render from `metric_type`
- Previous performance shown inline per exercise ("last time: 40 kg × 8, 8, 7")
- Rest timer auto-starts on set completion; Screen Wake Lock API held during the session
- Add / remove / reorder / substitute exercises mid-session
- **localStorage draft**, keyed by session id, written on every mutation, cleared on successful save

The draft is the important part. College gym wifi is unreliable and a dropped connection mid-workout must never lose sets.

**Post-workout summary:** duration, total volume, sets completed vs target, PRs hit, per-exercise comparison against last session, and an RPE prompt stored on the workout.

### 3.4 Runs via Strava

Strava is the only viable source: public OAuth2 REST API, reachable from Vercel, free, and Samsung Health can sync into it from the watch.

- `/api/strava/connect` → OAuth redirect
- `/api/strava/callback` → exchange code, store tokens **server-side only**
- `/api/strava/sync` → pull `/athlete/activities` since last sync, upsert on `external_id`
- Token refresh handled server-side; access tokens never reach the client

Sync is pull-based on demand plus a daily piggyback on the existing `/api/cron/reminders` route. Webhooks are deliberately deferred — they need a public callback and subscription management, and a daily pull plus a manual button covers a student running three times a week.

Fallbacks: manual run entry, and matching a run to its `program_day_id` so adherence is computable.

### 3.5 Analytics

A `/fitness/stats` tab plus a streak calendar on the hub.

- **Streak calendar** — 12-month heatmap, intensity by session presence and volume, lifts and runs distinguished by colour
- **Monthly report** — sessions, volume, distance, PRs, adherence vs programme, best lifts
- **Charts** — weekly volume (exists), e1RM progression per lift, muscle-group split, run pace trend, run distance trend, HR zone distribution, lift-vs-run balance, PR timeline, adherence percentage

Reuse `epley1RM`, `computePRs`, `weeklyVolume`, `inferMuscleGroup` from `src/lib/hevy.ts` — but move them to `src/lib/fitness/stats.ts`, since they are no longer Hevy-specific. `hevy.ts` keeps only the CSV parser.

---

## 4. Schema

### New tables

**`exercises`**
`id`, `user_id` (null = seeded/global), `name`, `slug`, `metric_type`, `primary_muscle`, `secondary_muscles text[]`, `equipment`, `form_cues text[]`, `demo_url`, `is_isometric bool`, `default_rest_seconds int`, `is_archived bool`, `created_at`

**`programs`**
`id`, `user_id`, `name`, `description`, `block_number int`, `weeks int`, `start_date`, `is_active bool`, `created_at`

**`program_days`**
`id`, `program_id`, `user_id`, `day_of_week int (0–6)`, `day_type ('lift'|'run'|'rest')`, `title`, `scheduled_time time`, `target_distance_km numeric`, `run_type`, `notes`

**`program_exercises`**
`id`, `program_day_id`, `user_id`, `exercise_id`, `order_index int`, `target_sets int`, `target_reps_min int`, `target_reps_max int`, `target_hold_seconds int`, `rest_seconds int`, `notes`

**`runs`**
`id`, `user_id`, `source ('strava'|'manual')`, `external_id`, `started_at`, `name`, `distance_m int`, `moving_time_s int`, `elapsed_time_s int`, `avg_hr int`, `max_hr int`, `elevation_gain_m int`, `run_type`, `splits jsonb`, `program_day_id`, `created_at`
Unique on `(user_id, external_id)` where `external_id` is not null.

**`strava_accounts`**
`user_id pk`, `athlete_id`, `access_token`, `refresh_token`, `expires_at`, `last_synced_at`
RLS: owner-only. Tokens are read exclusively by server routes, never selected client-side.

### Altered tables

**`workouts`** — add `program_day_id`, `notes`, `perceived_effort int`, `duration_seconds int`. Extend `source` to allow `'live'`.

**`workout_sets`** — add `exercise_id` (FK, nullable), `hold_seconds int`, `is_warmup bool`, `is_pr bool`, `completed_at`.

`exercise_title` is **kept**, not dropped. The 2,700 legacy Hevy rows have no `exercise_id` and backfilling by fuzzy title match will not be perfect. Keeping the text column means a bad match degrades a stat, never destroys history.

### Backfill

One migration seeds `exercises` from `select distinct exercise_title from workout_sets`, then sets `workout_sets.exercise_id` by exact title match. Exact match only — no fuzzy matching in a migration. Anything unmatched keeps `exercise_id = null` and still renders via `exercise_title`.

### RLS

Every new table gets owner-only RLS matching existing project convention. `exercises` additionally allows `select` where `user_id is null` so seeded exercises are readable by all.

---

## 5. Design language

Matches the existing app: dark default plus the warm light theme via `[data-theme="light"]`, colours routed through CSS vars and `--on-accent`, never hardcoded. Fraunces for display.

The session screen is the one deliberate departure — full-bleed and touch-first, with its own `fs-` prefix, because the gym is a different use context from the dashboard.

Charts use Recharts, already a dependency, styled with the same CSS vars as the existing weekly-volume chart.

---

## 6. Build order

1. **Exercises** — table, seed migration, backfill, library CRUD UI
2. **Programme** — tables, Het's Block 1 seeded as data, programme view/edit UI
3. **Live session** — the logger, draft persistence, rest timer, post-workout summary
4. **Strava** — OAuth, sync, runs UI, manual entry
5. **Analytics** — streak calendar, stats tab, monthly report

Each step ships independently. Verify with `npx tsc --noEmit` and `npm run build` (no test framework in this project).

---

## 7. Risks

**Backfill mismatch.** 2,700 rows keyed by free text. Mitigated by exact-match-only and keeping `exercise_title`.

**Strava API terms.** Personal use of one's own data is within scope, but Strava has tightened its terms in recent years. Confirm current developer terms before building — and the manual-entry path must work standalone so a Strava change never blocks run logging.

**Session state loss.** Mitigated by localStorage draft written on every mutation.

**Scope.** Five subsystems is a lot. The build order is strictly sequential and each step is usable alone — if we stop after step 3, Het has a working Hevy replacement.

---

## 8. Open questions

None blocking. Resolved during design: Wear OS (no), Samsung Health vs Strava (Strava), separate app (no), programme as data (yes).
