-- Deep Work OS
-- Final safe delta script based on live schema in database_schema.md
-- Date: 2026-04-21
--
-- Intent:
-- 1. Do not distort or rebuild existing tables.
-- 2. Only add safe improvements that support the roadmap.
-- 3. Preserve current live schema and policies wherever possible.
--
-- This script assumes your live DB already contains:
-- profiles, deep_work_sessions, goals, projects, tasks, habits, habit_logs,
-- journal_entries, xp_events, achievements, challenges, challenge_completions,
-- ai_reports, time_blocks, notes, planner_blocks, groups, group_members,
-- handle_new_user(), get_my_group_id(), and on_auth_user_created trigger.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Shared helper for updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply only to tables that already have updated_at in your live schema.
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_goals_updated_at on public.goals;
create trigger set_goals_updated_at
before update on public.goals
for each row
execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

drop trigger if exists set_notes_updated_at on public.notes;
create trigger set_notes_updated_at
before update on public.notes
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Safe performance indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_dws_user_date
  on public.deep_work_sessions (user_id, session_date desc);

create index if not exists idx_dws_user_started_at
  on public.deep_work_sessions (user_id, started_at desc);

create index if not exists idx_goals_user_status
  on public.goals (user_id, status);

create index if not exists idx_projects_user_status
  on public.projects (user_id, status);

create index if not exists idx_projects_goal_id
  on public.projects (goal_id);

create index if not exists idx_tasks_user_status_priority
  on public.tasks (user_id, status, priority desc);

create index if not exists idx_tasks_project_id
  on public.tasks (project_id);

create index if not exists idx_tasks_scheduled_date
  on public.tasks (user_id, scheduled_date);

create index if not exists idx_habit_logs_user_date
  on public.habit_logs (user_id, log_date desc);

create index if not exists idx_journal_entries_user_type_date
  on public.journal_entries (user_id, entry_type, entry_date desc);

create index if not exists idx_time_blocks_user_start
  on public.time_blocks (user_id, start_time);

create index if not exists idx_notes_user_updated_at
  on public.notes (user_id, updated_at desc);

create index if not exists idx_planner_blocks_user_date_slot
  on public.planner_blocks (user_id, block_date, start_slot);

create index if not exists idx_ai_reports_user_period
  on public.ai_reports (user_id, period_start desc, period_end desc);

create index if not exists idx_group_members_user_id
  on public.group_members (user_id);

-- ---------------------------------------------------------------------------
-- 3. New support tables for planned AI + group accountability features
-- ---------------------------------------------------------------------------

create table if not exists public.ai_report_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.ai_reports(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_text text not null,
  action_category text,
  action_order integer not null default 0,
  status text not null default 'pending',
  acted_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_report_actions_status_check'
  ) then
    alter table public.ai_report_actions
      add constraint ai_report_actions_status_check
      check (status in ('pending', 'in_progress', 'done', 'skipped'));
  end if;
end $$;

create index if not exists idx_ai_report_actions_report_order
  on public.ai_report_actions (report_id, action_order);

create table if not exists public.group_weekly_submissions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  submission_status text not null default 'draft',
  export_url text,
  notes text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, week_start, week_end)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'group_weekly_submissions_status_check'
  ) then
    alter table public.group_weekly_submissions
      add constraint group_weekly_submissions_status_check
      check (submission_status in ('draft', 'submitted', 'failed'));
  end if;
end $$;

create index if not exists idx_group_weekly_submissions_group_week
  on public.group_weekly_submissions (group_id, week_start desc);

create table if not exists public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  snapshot_type text not null,
  snapshot_date date not null,
  deep_work_hours numeric not null default 0,
  habit_pct numeric not null default 0,
  quality_score numeric not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'progress_snapshots_snapshot_type_check'
  ) then
    alter table public.progress_snapshots
      add constraint progress_snapshots_snapshot_type_check
      check (snapshot_type in ('baseline', 'weekly', 'final'));
  end if;
end $$;

create index if not exists idx_progress_snapshots_user_type_date
  on public.progress_snapshots (user_id, snapshot_type, snapshot_date desc);

-- ---------------------------------------------------------------------------
-- 4. RLS for new tables only
-- ---------------------------------------------------------------------------

alter table public.ai_report_actions enable row level security;
alter table public.group_weekly_submissions enable row level security;
alter table public.progress_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_report_actions'
      and policyname = 'users_manage_own_ai_report_actions'
  ) then
    create policy users_manage_own_ai_report_actions
      on public.ai_report_actions
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'group_weekly_submissions'
      and policyname = 'group_members_view_group_submissions'
  ) then
    create policy group_members_view_group_submissions
      on public.group_weekly_submissions
      for select
      using (group_id = public.get_my_group_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'group_weekly_submissions'
      and policyname = 'members_submit_for_own_group'
  ) then
    create policy members_submit_for_own_group
      on public.group_weekly_submissions
      for insert
      with check (
        auth.uid() = submitted_by
        and group_id = public.get_my_group_id()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'group_weekly_submissions'
      and policyname = 'submitter_updates_own_group_submission'
  ) then
    create policy submitter_updates_own_group_submission
      on public.group_weekly_submissions
      for update
      using (auth.uid() = submitted_by)
      with check (auth.uid() = submitted_by);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'progress_snapshots'
      and policyname = 'users_manage_own_progress_snapshots'
  ) then
    create policy users_manage_own_progress_snapshots
      on public.progress_snapshots
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Notes
-- ---------------------------------------------------------------------------
-- Intentionally NOT changing:
-- - existing handle_new_user() logic
-- - existing profiles/group/group_members model
-- - existing RLS on live tables
-- - existing defaults on notes/planner_blocks/etc.
--
-- Those are left untouched to avoid distorting the current live system.
