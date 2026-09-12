-- ============================================================
-- KLU AttendIQ — Database Schema
-- Run this in the Supabase SQL editor
-- ============================================================

-- 1. PROFILES (extends Supabase auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique not null,
  created_at timestamptz default now()
);

-- 2. SUBJECTS (one row per subject a student is enrolled in)
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  course_code text not null,
  course_name text not null,
  ltps text,               -- L / T / P / S
  section text,
  academic_year text not null,
  semester text not null,
  created_at timestamptz default now(),
  unique (user_id, course_code, academic_year, semester)
);

-- 3. SYNC SESSIONS (one row per time the extension pushes data)
create table if not exists sync_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  academic_year text not null,
  semester text not null,
  subjects_count int not null default 0,
  status text not null default 'success', -- success | partial | failed
  synced_at timestamptz default now()
);

-- 4. ATTENDANCE SNAPSHOTS (one row per subject per sync)
create table if not exists attendance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  subject_id uuid references subjects(id) on delete cascade not null,
  sync_session_id uuid references sync_sessions(id) on delete cascade not null,

  total_conducted int not null check (total_conducted >= 0),
  total_attended int not null check (total_attended >= 0),
  total_absent int not null check (total_absent >= 0),
  tcbr int default 0,
  percentage numeric(5,2) not null,

  created_at timestamptz default now()
);

-- Helpful indexes for dashboard/history queries
create index if not exists idx_snapshots_user_subject on attendance_snapshots (user_id, subject_id, created_at desc);
create index if not exists idx_subjects_user on subjects (user_id);
create index if not exists idx_sync_sessions_user on sync_sessions (user_id, synced_at desc);

-- ============================================================
-- ROW LEVEL SECURITY — each user can only see their own data
-- ============================================================
alter table profiles enable row level security;
alter table subjects enable row level security;
alter table sync_sessions enable row level security;
alter table attendance_snapshots enable row level security;

create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

create policy "Users can view own subjects" on subjects
  for select using (auth.uid() = user_id);
create policy "Users can insert own subjects" on subjects
  for insert with check (auth.uid() = user_id);
create policy "Users can update own subjects" on subjects
  for update using (auth.uid() = user_id);

create policy "Users can view own sync sessions" on sync_sessions
  for select using (auth.uid() = user_id);
create policy "Users can insert own sync sessions" on sync_sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can view own snapshots" on attendance_snapshots
  for select using (auth.uid() = user_id);
create policy "Users can insert own snapshots" on attendance_snapshots
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- Auto-create a profile row whenever a new auth user signs up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
