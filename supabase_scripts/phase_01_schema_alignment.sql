create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (
    id,
    username,
    display_name,
    level,
    xp_total,
    streak_current,
    streak_max,
    deep_work_baseline,
    created_at,
    updated_at
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'preferred_username',
      split_part(new.email, '@', 1),
      'user_' || substr(new.id::text, 1, 8)
    ),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    1,
    0,
    0,
    0,
    0,
    now(),
    now()
  )
  on conflict (id) do update
  set
    username = excluded.username,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure private.handle_new_user();

alter table if exists public.profiles
  add column if not exists streak_current integer not null default 0,
  add column if not exists deep_work_baseline numeric not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.deep_work_sessions
  add column if not exists deep_work_pct integer not null default 100;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deep_work_sessions_deep_work_pct_check'
  ) then
    alter table public.deep_work_sessions
      add constraint deep_work_sessions_deep_work_pct_check
      check (deep_work_pct between 0 and 100);
  end if;
end $$;

alter table if exists public.projects
  add column if not exists description text,
  add column if not exists target_date date,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.tasks
  add column if not exists description text,
  add column if not exists priority integer not null default 0,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null default '',
  note_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notes_note_type_check'
  ) then
    alter table public.notes
      add constraint notes_note_type_check
      check (note_type in ('scratchpad', 'blueprint'));
  end if;
end $$;

create table if not exists public.planner_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  block_date date not null,
  start_slot integer not null,
  end_slot integer not null,
  title text not null,
  task_id uuid references public.tasks(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  block_type text not null default 'deep_work',
  color text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_blocks_block_type_check'
  ) then
    alter table public.planner_blocks
      add constraint planner_blocks_block_type_check
      check (block_type in ('deep_work', 'wig', 'break', 'personal', 'meeting'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_blocks_start_slot_check'
  ) then
    alter table public.planner_blocks
      add constraint planner_blocks_start_slot_check
      check (start_slot >= 0 and start_slot < 48);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_blocks_end_slot_check'
  ) then
    alter table public.planner_blocks
      add constraint planner_blocks_end_slot_check
      check (end_slot > start_slot and end_slot <= 48);
  end if;
end $$;

create index if not exists idx_dws_user_started_at
  on public.deep_work_sessions(user_id, started_at desc);

create index if not exists idx_projects_user_status
  on public.projects(user_id, status);

create index if not exists idx_tasks_user_status_priority
  on public.tasks(user_id, status, priority desc);

create index if not exists idx_tasks_project_id
  on public.tasks(project_id);

create index if not exists idx_notes_user_updated_at
  on public.notes(user_id, updated_at desc);

create index if not exists idx_planner_blocks_user_date_slot
  on public.planner_blocks(user_id, block_date, start_slot);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_goals_updated_at on public.goals;
create trigger set_goals_updated_at
before update on public.goals
for each row execute procedure public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute procedure public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute procedure public.set_updated_at();

drop trigger if exists set_notes_updated_at on public.notes;
create trigger set_notes_updated_at
before update on public.notes
for each row execute procedure public.set_updated_at();

alter table if exists public.profiles enable row level security;
alter table if exists public.deep_work_sessions enable row level security;
alter table if exists public.habits enable row level security;
alter table if exists public.habit_logs enable row level security;
alter table if exists public.goals enable row level security;
alter table if exists public.projects enable row level security;
alter table if exists public.tasks enable row level security;
alter table if exists public.journal_entries enable row level security;
alter table if exists public.time_blocks enable row level security;
alter table if exists public.notes enable row level security;
alter table if exists public.planner_blocks enable row level security;
alter table if exists public.xp_events enable row level security;
alter table if exists public.achievements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_self_all'
  ) then
    create policy profiles_self_all on public.profiles
      for all using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'deep_work_sessions' and policyname = 'deep_work_sessions_self_all'
  ) then
    create policy deep_work_sessions_self_all on public.deep_work_sessions
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'habits' and policyname = 'habits_self_all'
  ) then
    create policy habits_self_all on public.habits
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'habit_logs' and policyname = 'habit_logs_self_all'
  ) then
    create policy habit_logs_self_all on public.habit_logs
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'goals' and policyname = 'goals_self_all'
  ) then
    create policy goals_self_all on public.goals
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_self_all'
  ) then
    create policy projects_self_all on public.projects
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_self_all'
  ) then
    create policy tasks_self_all on public.tasks
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'journal_entries' and policyname = 'journal_entries_self_all'
  ) then
    create policy journal_entries_self_all on public.journal_entries
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'time_blocks' and policyname = 'time_blocks_self_all'
  ) then
    create policy time_blocks_self_all on public.time_blocks
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notes' and policyname = 'notes_self_all'
  ) then
    create policy notes_self_all on public.notes
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'planner_blocks' and policyname = 'planner_blocks_self_all'
  ) then
    create policy planner_blocks_self_all on public.planner_blocks
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'xp_events' and policyname = 'xp_events_self_all'
  ) then
    create policy xp_events_self_all on public.xp_events
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'achievements' and policyname = 'achievements_self_all'
  ) then
    create policy achievements_self_all on public.achievements
      for all using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
