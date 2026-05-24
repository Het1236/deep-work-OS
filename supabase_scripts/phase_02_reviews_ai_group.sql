create extension if not exists pgcrypto;

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  report_type text not null,
  period_start date not null,
  period_end date not null,
  execution_snapshot jsonb,
  drip_audit jsonb,
  pattern_insights text,
  recommendations jsonb,
  input_snapshot jsonb,
  generated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_reports_report_type_check'
  ) then
    alter table public.ai_reports
      add constraint ai_reports_report_type_check
      check (report_type in ('weekly', 'monthly', 'quarterly', 'yearly'));
  end if;
end $$;

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

create index if not exists idx_ai_reports_user_period
  on public.ai_reports(user_id, period_start desc, period_end desc);

create index if not exists idx_ai_report_actions_report
  on public.ai_report_actions(report_id, action_order);

create index if not exists idx_group_weekly_submissions_group_week
  on public.group_weekly_submissions(group_id, week_start desc);

create index if not exists idx_progress_snapshots_user_type
  on public.progress_snapshots(user_id, snapshot_type, snapshot_date desc);

alter table if exists public.ai_reports enable row level security;
alter table if exists public.ai_report_actions enable row level security;
alter table if exists public.group_weekly_submissions enable row level security;
alter table if exists public.progress_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_reports' and policyname = 'ai_reports_self_all'
  ) then
    create policy ai_reports_self_all on public.ai_reports
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_report_actions' and policyname = 'ai_report_actions_self_all'
  ) then
    create policy ai_report_actions_self_all on public.ai_report_actions
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'progress_snapshots' and policyname = 'progress_snapshots_self_all'
  ) then
    create policy progress_snapshots_self_all on public.progress_snapshots
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
