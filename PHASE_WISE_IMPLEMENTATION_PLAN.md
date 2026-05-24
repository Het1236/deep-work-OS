# Deep Work OS Phase-Wise Implementation Plan

Date: 2026-04-21

## Planning principles

This roadmap is designed to:

- keep backend and schema ahead of UI work
- reduce rework from mismatched tables and missing columns
- ship in vertical slices
- preserve your current product direction: premium dark glassmorphism productivity OS

This plan assumes the app is already at the "broad prototype" stage and now needs structured hardening.

## Phase 0 - Schema Baseline and Design Sync

### Goal

Create a reliable source of truth before feature expansion.

### Deliverables

- reconcile documented schema with app-assumed schema
- define canonical group membership model
- update `design.md` so it matches the current glassmorphism direction
- create idempotent Supabase schema alignment script

### Backend/Supabase work

- align tables and columns used by the current app
- add missing tables: `notes`, `planner_blocks`
- add missing columns used in code
- add `profiles` bootstrap trigger from `auth.users`
- enable baseline RLS on all user-owned tables
- add `updated_at` triggers where the app writes updates

### Files

- `DB_SCHEMA_BASELINE.md`
- `PHASE_WISE_IMPLEMENTATION_PLAN.md`
- `supabase_scripts/phase_01_schema_alignment.sql`
- `design.md`

### Exit gate

- current app schema is fully represented in docs
- `src/lib/data.ts` no longer depends on undocumented columns/tables
- design source of truth matches current product direction

## Phase 1 - Foundation and Auth Integrity

### Goal

Make the app safe and stable enough that every later feature builds on a clean backend.

### Product scope

- auth/profile integrity
- shell consistency
- stable shared data layer

### Backend/Supabase work

- create or verify profile bootstrap trigger
- backfill missing profile rows for existing users
- align `projects`, `tasks`, `deep_work_sessions`, `notes`, `planner_blocks`
- add indexes for dashboard, scoreboard, planner, and notes queries
- lock down RLS for all current user-owned tables
- refactor AI route to derive user identity from auth, not request body

### Frontend/app work

- unify auth pages with the new design system
- remove hardcoded scoreboard export name
- normalize shared loading/error patterns
- fix schema assumptions in the data layer

### Acceptance criteria

- no missing-column runtime failures
- signup reliably results in a profile row
- every current screen reads and writes against a documented schema
- AI route is ownership-safe

## Phase 2 - Execution Core

### Goal

Turn the current CRUD screens into a real execution engine.

### Product scope

- dashboard
- timer
- habits
- projects/tasks
- goals
- planner/calendar linkage

### Backend/Supabase work

- enforce WIP limit checks for projects
- enforce DRIP requirements before task status transitions
- add derived goal progress logic from linked project/task completion
- add better session analytics fields if needed
- add helper SQL functions/views for dashboard and scoreboard summaries

### Frontend/app work

- pin top 3 WIGs on dashboard
- add real shutdown card/widget on dashboard
- connect planner and calendar more tightly to tasks and goals
- convert task/project flows from "data entry" to "execution workflow"
- add task detail model including DRIP, energy, and money tags

### Recommended SQL work

- status transition guard functions for tasks/projects
- goal progress recompute function
- dashboard summary view or RPCs for weekly metrics

### Acceptance criteria

- goals, projects, tasks, planner, and calendar all reference each other cleanly
- WIP and DRIP are system rules, not just UI text
- dashboard surfaces the day's actual priorities

## Phase 3 - Operating System Loop

### Goal

Implement the daily and weekly operating cadence that makes the app feel like a true Life OS.

### Product scope

- onboarding wizard
- daily shutdown
- weekly review
- monthly review
- journal system upgrade

### Backend/Supabase work

- store onboarding completion and baseline values
- expand review data capture and metrics snapshots
- add derived journal auto-fill helpers for habit percentage and deep work totals
- support review status and completeness checks

### Frontend/app work

- onboarding flow: identity, WIGs, starter habits, baseline, group join/create
- proper weekly review screen
- monthly review screen
- journal UX redesign to match current visual language
- convert shutdown from checkbox-only behavior into a true ritual flow

### Recommended SQL work

- onboarding state on `profiles` or dedicated onboarding table
- journal helper functions for weekly/monthly rollups

### Acceptance criteria

- new users get structured into the system instead of landing in a blank app
- weekly review becomes a core loop, not a missing concept
- journal entries and reviews become useful inputs to AI and group reporting

## Phase 4 - AI Reports, Scoreboard, and Group System

### Goal

Complete the accountability loop for the cohort experiment.

### Product scope

- stored AI reports
- report history
- recommendation tracking
- group create/join/manage
- professor submission
- before/after snapshots
- richer scoreboard

### Backend/Supabase work

- create real `ai_reports` persistence flow
- add `ai_report_actions` to track whether recommendations were acted on
- add `group_weekly_submissions`
- add `progress_snapshots` for baseline/final comparison
- add cron endpoints and scheduling strategy for weekly generation
- define shared read policies for group leaderboard and group snapshots

### Frontend/app work

- scoreboard before/after comparison
- group create flow
- professor submission flow
- report history UI
- action tracker UI for AI recommendations
- share/export behavior aligned with your chosen output format

### Recommended SQL work

- `supabase_scripts/phase_02_reviews_ai_group.sql`

### Acceptance criteria

- every user can generate and revisit reports
- groups can be created and joined properly
- weekly submission is a real workflow
- baseline vs final outcomes can be exported for presentation

## Phase 5 - Gamification Depth and Second Brain Expansion

### Goal

Move from basic XP to a memorable product layer.

### Product scope

- level titles
- challenge persistence
- avatar evolution
- skill tree
- richer achievement logic
- second brain knowledge system

### Backend/Supabase work

- activate `challenges` and `challenge_completions`
- add title/unlock metadata tables if needed
- expand achievements logic beyond the current hardcoded checks
- add second-brain states and note categories

### Frontend/app work

- persistent weekly challenge system
- avatar or identity evolution layer
- second-brain library for books, podcasts, articles, and blueprints
- blueprint lifecycle states: researching, active, integrated

### Acceptance criteria

- gamification is progression-based, not just toast-based
- second brain supports real long-term knowledge capture

## Phase 6 - Hardening, Realtime, and Production Readiness

### Goal

Make the app resilient enough for sustained use.

### Product scope

- realtime sync
- offline-safe timer strategy
- performance
- testing
- analytics

### Backend/Supabase work

- realtime subscriptions for habits, sessions, XP, and reports
- timer sync strategy for offline or reconnect flows
- analytics events and materialized summaries where needed
- data cleanup jobs
- security review of RLS and API surface

### Frontend/app work

- replace brittle client fetch patterns with a consistent query/cache model
- reduce duplicated timer and dashboard session logic
- add test coverage around session logging, XP, reviews, and reports
- resolve lint/build issues

### Acceptance criteria

- lint passes
- build is reliable
- core flows are tested
- realtime updates work where promised

## Build order recommendation

Do the phases in this exact order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6

Do not start Phase 4 before Phase 1 and Phase 3 are complete. AI/group/reporting becomes much harder if onboarding, review data, and schema alignment are still unstable.

## Immediate next implementation sequence

If we start right now, the best concrete order is:

1. Run and verify `supabase_scripts/phase_01_schema_alignment.sql`
2. fix profile bootstrap and current schema mismatches
3. clean the AI route auth model
4. unify `projects`, `tasks`, and `goals` data behavior
5. ship onboarding
6. ship weekly review
7. ship stored AI reports and group submissions

## Notes on design direction

This roadmap assumes the active design direction is:

- dark premium glassmorphism
- structured productivity dashboard
- restrained motion
- consistent blur/elevation system
- stronger atmosphere than the earlier Notion-only spec

That direction is now reflected in the updated `design.md`.
