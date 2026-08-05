# Day Plan & Adaptive Coach — Design

**Date:** 2026-08-05
**Status:** Awaiting user review
**Builds on:** `2026-08-05-hybrid-fitness-design.md` (exercises, programme, live logger, Strava, analytics)

---

## 1. Goal

Two things Het asked for, which turn out to share a spine:

1. **A day plan in the app** — today and tomorrow, hour by hour, composing lectures, training, meals, commute, study and sleep into one timeline.
2. **A prescriptive coach** — tells him what to do tomorrow and why, proposing rather than imposing.

Both need the same thing the app currently lacks: **the primitives to derive a day from**. Right now his lecture timetable exists only in Google Calendar, his wake time and commute exist only in conversation, and his meal plan is 44 hand-written rows with no alternatives.

### Design stance

**The day plan is derived, never authored.** A timeline is composed from schedule primitives plus the programme plus the meal plan. Hand-writing 7 days × ~14 blocks would be 98 rows that go stale the moment a lecture moves.

**Meals are stable by default.** Explicit user constraint: breakfast and lunch do not change until he says so. Options exist to be *chosen*, never rotated automatically. Nothing in the coach layer may touch a meal selection.

### Non-goals

- No Google Calendar OAuth. His SEM5 timetable is stable for a semester; a `class_schedule` table seeded once and editable in-app is far less machinery for the same result.
- No Wear OS app, no Samsung Health integration. Established previously: no public cloud API.
- The coach never auto-applies. Propose-and-approve only (user's explicit choice).
- No HRV. Samsung Watch measures it; there is no path to a web app.

---

## 2. Current state

- `programs` / `program_days` / `program_exercises` — Block 1 seeded, 19 exercises
- `meal_plan_items` — 44 rows, one per slot per day, **no alternatives, no selection**
- `runs` — 6 Strava runs, summary fields only (no streams, laps or splits)
- `workouts` / `workout_sets` — 2,781 legacy sets; `perceived_effort` column exists but unused
- Lecture timetable — **not in the app at all**
- Wake time, routine duration, commute — **not in the app at all**

Known data reality: five of six runs have no heart rate. The one that does reads 154 bpm at 9:11/km, which is Zone 3 at a pace slower than prescribed. The coach is being built on very thin data, and its rails must reflect that.

---

## 3. Part 1 — Schedule primitives

Three small tables. Everything in the day plan derives from these.

**`class_schedule`** — recurring weekly lectures.
`id`, `user_id`, `day_of_week` (0=Mon), `start_time`, `end_time`, `course_code`, `title`, `location`, `term`, `is_active`

Seeded from the SEM5 Google Calendar already read during design. Editable in-app; no OAuth.

**`routine_settings`** — one row per user.
`user_id`, `wake_time` (05:00), `routine_minutes` (90), `commute_minutes` (60), `sleep_time` (22:00), `winddown_minutes` (45), `gym_closed_from`/`gym_closed_to` (11:00–12:00)

**`day_overrides`** — one-off deviations.
`id`, `user_id`, `date`, `kind` ('holiday'|'exam'|'travel'|'skip_training'), `note`

### Derivation

`buildDayPlan(date)` is a **pure function** in `src/lib/fitness/dayplan.ts` — no I/O, fully testable:

```
inputs:  classes[], programDay, mealSlots[], routineSettings, overrides[]
output:  TimelineBlock[]  { start, end, kind, title, detail, meta }
```

Rules, in order:
1. **Anchor on the first lecture.** `leave_home = first_class.start − commute_minutes`. No lectures → anchor on training time.
2. **Routine ends at leave_home.** `routine_start = leave_home − routine_minutes`.
3. **Training placement.** Run days: between wake and routine_start (needs `wake + run_duration ≤ routine_start`; if it doesn't fit, flag rather than silently truncate). Lift days: first gap ≥ 90 min after lectures, respecting gym closure.
4. **Meals** slot in at their configured times, marked if they collide with a lecture.
5. **Free blocks** — any gap ≥ 45 min becomes a study block.
6. **Wind-down and sleep** close the day from `sleep_time`.

Conflicts are **surfaced, never silently resolved**. "Your run does not fit before an 08:00 lecture" is useful; a silently shortened run is not.

### UI

`/fitness/day` — today and tomorrow, tab-switched. Vertical timeline, current block highlighted, "you are here" marker. Each block expandable for detail. Same `ft-` design system.

The morning cron (`/api/cron/reminders`, already firing 08:30 IST) gains today's plan summary in the Telegram agenda.

---

## 4. Part 2 — Meal options

Current model has one fixed row per slot. Required: several options per slot, one selected, **changing only on explicit user action**.

**`meal_options`** — a library of interchangeable meals.
`id`, `user_id`, `category` ('breakfast'|'lunch'|'dinner'|'snack'|'pre_workout'|'post_workout'), `title`, `detail`, `recipe`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `fibre_g`, `tags text[]` (e.g. `{high_protein, gut_friendly, packable, fast_compliant}`), `prep_minutes`, `is_archived`

**`meal_plan_items`** gains `selected_option_id` → `meal_options.id`, and keeps its own macro columns as a fallback for slots with no option library.

Swapping a meal changes one pointer. Nothing else moves, nothing recalculates.

**Seeded options** (from the plan artifact): 5 breakfasts, 5 lunches, 5 snacks, plus soya chunk curry with its recipe and macros. Options within a category are matched to within ~40 kcal and ~4 g protein so swapping never breaks the day's totals.

**Invariant, enforced in code:** nothing outside an explicit user action writes `selected_option_id`. The coach layer has no write access to it. This is a hard boundary, not a convention.

---

## 5. Part 3 — Deep Strava ingestion

Currently we store summary fields and discard everything else. The analyses that matter need per-second data.

Verified against the Strava API reference:

| Endpoint | Gives | Scope | Available |
|---|---|---|---|
| `/activities/{id}/streams` | per-second heartrate, velocity_smooth, cadence, altitude, distance, time, moving, grade | `activity:read_all` | ✅ authorised |
| `/activities/{id}/laps` | lap splits — 400 m repeats individually | `activity:read_all` | ✅ authorised |
| `/activities/{id}` detailed | `splits_metric`, `best_efforts`, avg cadence, `suffer_score` | `activity:read_all` | ✅ authorised |
| `/athlete/zones` | configured HR zones | `profile:read_all` | ❌ needs re-auth |
| `/activities/{id}/zones` | pre-computed zone buckets | `activity:read_all` | ✅ user has paid tier |

**Tables**

**`run_streams`** — `run_id` (pk), `user_id`, `time_s int[]`, `heartrate int[]`, `velocity_ms real[]`, `cadence int[]`, `altitude real[]`, `distance_m real[]`, `moving bool[]`, `fetched_at`
Postgres arrays, one row per run. A 60-minute run is ~3,600 points per channel — a few hundred KB. Fine at this scale; revisit if he ever has hundreds of runs.

**`run_laps`** — `id`, `run_id`, `user_id`, `lap_index`, `distance_m`, `moving_time_s`, `avg_hr`, `max_hr`, `avg_speed_ms`

**`runs`** gains — `splits_metric jsonb`, `suffer_score int`, `avg_cadence real`, `calories int`, `has_streams bool`

**`hr_zones`** — `user_id` (pk), `max_hr`, `resting_hr`, `z1_max`…`z5_max`, `source` ('manual'|'strava'|'estimated'), `updated_at`

**Fetch strategy.** Streams are one request per activity. Rate limits constrain backfill (the docs page did not state current numbers — **verify before writing the backfill loop**). Design accordingly: fetch streams lazily for runs missing them, newest first, capped per sync run, with progress surfaced. Never a blind loop over all history.

**Zone derivation.** Compute from `heartrate` streams against `hr_zones` rather than trusting `/activities/{id}/zones`, so boundaries are his. Use the Strava endpoint as a cross-check and log disagreement.

**Max HR.** The 220−age formula is unreliable and currently gives 200. Prefer the maximum observed across all streams, floored at the formula value, and let him override manually.

---

## 6. Part 4 — Load, zone & decoupling model

Pure functions in `src/lib/fitness/load.ts`. No I/O, no framework.

**Zone distribution.** Time in Z1–Z5 per run and per week, from streams. Weekly polarisation ratio against an 80/20 target. Directly answers his actual problem: are the easy runs easy.

**Aerobic decoupling.** Split a run in half; compare speed-per-heartbeat first half vs second. Under ~5% indicates a genuine aerobic base. Only meaningful on steady runs ≥ 30 min — **must be suppressed on intervals and short runs rather than reported as a misleading number.**

**Run load — TRIMP.** Banister TRIMP from HR streams, using resting and max HR. Falls back to duration × intensity factor when HR is absent — five of six of his runs currently.

**Lift load — session RPE × duration.** The established method for resistance training. `workouts.perceived_effort` already exists and is unused; the logger prompts for it at Finish.

**Combined ACWR.** 7-day acute over 28-day chronic, exponentially weighted. Bands: `< 0.8` detraining, `0.8–1.3` optimal, `1.3–1.5` caution, `> 1.5` high risk.

**Interference detection.** Correlate run load on day N with lift performance on N+1, and leg-day volume with next-run pace at matched HR. Genuinely hybrid-specific. **Needs many weeks of data — must show "insufficient data" until it has them, not a spurious correlation from six points.**

---

## 7. Part 5 — Prescriptive coach

Runs nightly, piggybacking the existing `/api/cron/reminders` (08:30 IST, already sends a Telegram agenda).

**Inputs:** sessions completed vs prescribed · 7-day zone distribution · combined ACWR · decoupling trend · morning readiness · last session RPE.

**Output:** a `prescriptions` row — `id`, `user_id`, `date`, `program_day_id`, `status` ('proposed'|'accepted'|'modified'|'skipped'), `session jsonb`, `reasoning text`, `inputs_used text[]`, `created_at`.

Delivered as an in-app card plus a Telegram line. **Nothing in the programme changes until he taps accept.**

**`daily_readiness`** — `user_id`, `date` (pk), `readiness int` (1–5, required), `sleep_hours numeric` (optional), `resting_hr int` (optional), `soreness int` (optional), `note`

**Graceful degradation is a rule, not a nicety.** The engine computes with whatever inputs exist and states which it used in `inputs_used`. Readiness alone → can hold or reduce. Plus resting HR → early overreaching warning (RHR 5+ bpm over baseline). Missing input never blocks a prescription; it narrows what the prescription is allowed to do.

### Safety rails — hard-coded, not model-decided

1. Never increase weekly running volume more than 10%.
2. Never prescribe a hard session when ACWR > 1.4.
3. Force a deload every 4–6 weeks regardless of metrics.
4. **Readiness may only hold or reduce, never increase.** Feeling good is not evidence of recovery.
5. Every prescription states its reasoning and the inputs used.
6. Override is always one tap and is never nagged.
7. The coach has **no write access** to `meal_plan_items.selected_option_id` or to `meal_options`.

Rails live in code with explicit tests, not in a prompt. The AI provider (Groq, existing abstraction) writes the *explanation*; the *decision* is deterministic. An LLM must never be the thing deciding training load.

**Scope statement:** this is training software, not medical advice. Rails are deliberately conservative so failures err toward under-training. If the user reports feeling injured or ill, the app defers entirely.

---

## 8. Build order

1. **Schedule primitives + day plan** — `class_schedule`, `routine_settings`, `day_overrides`, `buildDayPlan()`, `/fitness/day`. Immediately useful, no dependencies.
2. **Meal options** — `meal_options`, `selected_option_id`, seed the library, swap UI.
3. **Deep Strava ingestion** — streams, laps, splits, zones, lazy backfill.
4. **Load model** — zones, decoupling, TRIMP, ACWR. Pure functions, testable.
5. **Analysis dashboard** — visualise 4.
6. **Prescriptive coach** — needs 3–5 to have anything to say.

Each step ships alone. Verify with `npx tsc --noEmit` and `npm run build` (no test framework in this project — the pure functions in 4 are the strongest argument for adding one).

---

## 9. Risks

**Coach built on thin data.** Six runs, one with HR. Mitigated by conservative rails, propose-not-impose, and requiring minimum data before any analysis is shown.

**Streams storage growth.** Postgres arrays are fine at his volume. Revisit past ~200 runs.

**Rate limits unverified.** Current thresholds not confirmed from docs. Backfill must be capped and resumable, never a blind loop.

**Timetable drift.** `class_schedule` is a snapshot; a mid-semester change silently breaks the day plan. Mitigate with a visible "last updated" and an easy edit path.

**Spurious correlation.** Interference detection on small samples will find patterns that are not there. Must gate on sample size and say so.

---

## 10. Open questions

- Re-authorise Strava for `profile:read_all` to read configured zones, or set zones manually? (Manual works; re-auth is nicer.)
- Add a test framework for the pure load functions? The rails deserve tests; the project has none today.
