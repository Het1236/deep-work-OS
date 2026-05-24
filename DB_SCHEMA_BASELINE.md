# Deep Work OS Database Schema Baseline

Date: 2026-04-21

## Important note

I could not inspect a live Supabase database or local migration history from this repo, because there is no checked-in `supabase/migrations` folder or SQL dump. This baseline is reconstructed from:

- `systemdesign.md`
- `systemarchitecture.md`
- `src/lib/types.ts`
- `src/lib/data.ts`
- feature page usage across `src/app/(dashboard)`

Use this document as the current schema working baseline for planning and migration work.

## Schema source-of-truth status

Right now the schema is split across three layers:

1. Documented schema in `systemdesign.md`
2. App-assumed schema in `src/lib/types.ts`
3. Query-layer schema in `src/lib/data.ts`

Before major feature implementation, these need to be brought back into one source of truth.

## Table-by-table baseline

### `profiles`

Documented:
- `id`
- `username`
- `display_name`
- `avatar_url`
- `level`
- `xp_total`
- `streak_max`
- `identity_statement`
- `personality_type`
- `group_id`
- `created_at`
- `updated_at`

App additionally expects:
- `streak_current`
- `deep_work_baseline`

Notes:
- The app reads `streak_current` in group, evolution, and badge logic.
- The app reads `deep_work_baseline` in types even though it is not used widely yet.
- A profile bootstrap trigger from `auth.users` is strongly recommended.

### `groups`

Documented:
- `id`
- `name`
- `invite_code`
- `created_by`
- `professor_email`
- `created_at`

Related documented table:
- `group_members`

Current app behavior:
- join flow updates `profiles.group_id`
- current UI does not use `group_members`

Decision needed:
- keep `group_members` as the real relationship table and sync `profiles.group_id` for convenience
- or simplify the whole app to `profiles.group_id`

Recommendation:
- keep both, but make `group_members` canonical in Phase 4

### `deep_work_sessions`

Documented:
- `id`
- `user_id`
- `started_at`
- `ended_at`
- `duration_minutes`
- `intensity_score`
- `quality_score`
- `task_id`
- `notes`
- `session_date`
- `created_at`

App additionally expects:
- `deep_work_pct`

Notes:
- `deep_work_pct` is required by scoreboard analytics and timer wrap-up.
- The app currently treats this as a 0-100 percentage split between deep and shallow work.

### `habits`

Documented and app-aligned:
- `id`
- `user_id`
- `name`
- `category`
- `time_of_day`
- `identity_tag`
- `is_active`
- `sort_order`
- `created_at`

### `habit_logs`

Documented and app-aligned:
- `id`
- `habit_id`
- `user_id`
- `log_date`
- `completed`
- `note`
- `created_at`

### `goals`

Documented and app-aligned:
- `id`
- `user_id`
- `title`
- `problem`
- `solution`
- `ai_solution`
- `status`
- `is_domino_goal`
- `is_wig`
- `target_date`
- `progress_pct`
- `life_area`
- `created_at`
- `updated_at`

Notes:
- The UI currently updates `progress_pct` manually.
- Longer term this should become derived from linked project/task progress.

### `projects`

Documented:
- `id`
- `user_id`
- `goal_id`
- `title`
- `status`
- `ice_impact`
- `ice_confidence`
- `ice_ease`
- `ice_score`
- `created_at`

App additionally expects:
- `description`
- `target_date`

Notes:
- The edit modal reads and writes `description` and `target_date`.
- Current app manually writes `ice_score`, while the document describes a generated column.
- The documented ICE formula is multiplicative, but current app code averages the three values.

### `tasks`

Documented:
- `id`
- `user_id`
- `project_id`
- `title`
- `status`
- `drip_category`
- `energy_level`
- `money_value`
- `scheduled_date`
- `scheduled_time`
- `is_quick_capture`
- `created_at`

App additionally expects:
- `description`
- `priority`
- `completed_at`
- `updated_at`

App currently does not use well:
- `money_value`
- `scheduled_time`
- `is_quick_capture`

Notes:
- `priority`, `completed_at`, and `updated_at` are required by the current data layer.
- `money_value` exists in docs but is not surfaced properly in the UI.

### `journal_entries`

Documented and mostly app-aligned:
- `id`
- `user_id`
- `entry_type`
- `entry_date`
- `gratitude_1`
- `gratitude_2`
- `gratitude_3`
- `energy_score`
- `deep_work_hours`
- `wins`
- `next_day_start`
- `shutdown_done`
- `habit_pct`
- `reflection`
- `improvements`
- `next_period_priorities`
- `metrics_snapshot`
- `created_at`

Current UI only uses:
- daily entry flow
- shutdown flag
- gratitude
- energy
- wins
- next_day_start

### `xp_events`

Documented and app-aligned:
- `id`
- `user_id`
- `event_type`
- `xp_awarded`
- `metadata`
- `created_at`

### `achievements`

Documented and app-aligned:
- `id`
- `user_id`
- `badge_key`
- `earned_at`

### `challenges`

Documented:
- `id`
- `week_start`
- `title`
- `description`
- `xp_reward`
- `target_type`
- `target_value`

Current app state:
- challenge cards are computed client-side
- no database reads or writes yet

### `challenge_completions`

Documented:
- `challenge_id`
- `user_id`
- `completed_at`

Current app state:
- not used yet

### `ai_reports`

Documented:
- `id`
- `user_id`
- `report_type`
- `period_start`
- `period_end`
- `execution_snapshot`
- `drip_audit`
- `pattern_insights`
- `recommendations`
- `input_snapshot`
- `generated_at`

Current app state:
- page and API exist
- no stored reports yet
- no history UI
- no recommendation tracking table yet

### `time_blocks`

Documented and app-aligned:
- `id`
- `user_id`
- `title`
- `block_type`
- `start_time`
- `end_time`
- `is_recurring`
- `recurrence_rule`
- `task_id`
- `goal_id`
- `color`
- `created_at`

### `notes`

Not documented in `systemdesign.md`, but required by app:
- `id`
- `user_id`
- `title`
- `content`
- `note_type`
- `created_at`
- `updated_at`

Used by:
- scratchpad
- blueprints

### `planner_blocks`

Not documented in `systemdesign.md`, but required by app:
- `id`
- `user_id`
- `block_date`
- `start_slot`
- `end_slot`
- `title`
- `task_id`
- `project_id`
- `block_type`
- `color`
- `created_at`

Used by:
- planner day view
- block merge/edit/delete flow

## Immediate schema mismatches to fix first

These are the highest-priority mismatches between docs and the running app:

1. `profiles.streak_current`
2. `profiles.deep_work_baseline`
3. `deep_work_sessions.deep_work_pct`
4. `projects.description`
5. `projects.target_date`
6. `tasks.description`
7. `tasks.priority`
8. `tasks.completed_at`
9. `tasks.updated_at`
10. `notes` table
11. `planner_blocks` table

## Backend integrity issues to solve in Phase 1

1. Auto-create `profiles` row on signup
2. Add `updated_at` trigger coverage for mutable tables
3. Add baseline RLS on all user-owned tables
4. Align SQL schema with what `src/lib/data.ts` currently writes
5. Decide canonical group membership strategy

## Recommended canonical ownership model

### User-owned tables
- `profiles`
- `deep_work_sessions`
- `habits`
- `habit_logs`
- `goals`
- `projects`
- `tasks`
- `journal_entries`
- `time_blocks`
- `notes`
- `planner_blocks`
- `xp_events`
- `achievements`
- `ai_reports`

### Shared/group-aware tables
- `groups`
- `group_members`
- `challenge_completions`
- group submission/snapshot tables to be added later

## Recommended next step

Use `supabase_scripts/phase_01_schema_alignment.sql` first, then treat `PHASE_WISE_IMPLEMENTATION_PLAN.md` as the rollout order for feature work.
