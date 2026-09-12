-- ============================================================
-- KLU AttendIQ — Migration 002: Timetable + Component Attendance
-- Run this AFTER schema.sql, in the Supabase SQL editor.
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- 1. TIMETABLE ENTRIES — one row per (day, period) class slot
create table if not exists timetable_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  subject_id uuid references subjects(id) on delete set null,

  day_of_week text not null check (day_of_week in
    ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  start_time text not null,   -- '09:00' (24h, stored as text to avoid timezone issues)
  end_time text not null,     -- '09:50'
  course_code text not null,
  component text,             -- Lecture / Practical / Skill / Tutorial / Other
  section text,
  room text,

  academic_year text not null,
  semester text not null,
  created_at timestamptz default now(),

  unique (user_id, day_of_week, start_time, course_code, academic_year, semester)
);

create index if not exists idx_timetable_user_day on timetable_entries (user_id, day_of_week);

alter table timetable_entries enable row level security;

drop policy if exists "Users can view own timetable" on timetable_entries;
create policy "Users can view own timetable" on timetable_entries
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own timetable" on timetable_entries;
create policy "Users can insert own timetable" on timetable_entries
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own timetable" on timetable_entries;
create policy "Users can update own timetable" on timetable_entries
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own timetable" on timetable_entries;
create policy "Users can delete own timetable" on timetable_entries
  for delete using (auth.uid() = user_id);


-- 2. ATTENDANCE COMPONENTS — Lecture/Practical/Skill breakdown per subject
-- (attendance_snapshots stays as the combined/total row; this table adds
-- the per-component breakdown that feeds into it.)
create table if not exists attendance_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  subject_id uuid references subjects(id) on delete cascade not null,
  sync_session_id uuid references sync_sessions(id) on delete cascade not null,

  component text not null, -- Lecture / Practical / Skill / Tutorial / Other
  conducted int not null check (conducted >= 0),
  attended int not null check (attended >= 0 and attended <= conducted),

  created_at timestamptz default now()
);

create index if not exists idx_components_user_subject on attendance_components (user_id, subject_id, created_at desc);

alter table attendance_components enable row level security;

drop policy if exists "Users can view own components" on attendance_components;
create policy "Users can view own components" on attendance_components
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own components" on attendance_components;
create policy "Users can insert own components" on attendance_components
  for insert with check (auth.uid() = user_id);


-- 3. Harden attendance_snapshots with the constraints called out in review
-- (safe re-run: drop-then-add each constraint by name)
alter table attendance_snapshots drop constraint if exists chk_attended_le_conducted;
alter table attendance_snapshots add constraint chk_attended_le_conducted
  check (total_attended <= total_conducted);

alter table attendance_snapshots drop constraint if exists chk_absent_le_conducted;
alter table attendance_snapshots add constraint chk_absent_le_conducted
  check (total_absent <= total_conducted);

alter table attendance_snapshots drop constraint if exists chk_percentage_range;
alter table attendance_snapshots add constraint chk_percentage_range
  check (percentage >= 0 and percentage <= 100);

-- Optional: track which version of the extension's parser produced a sync,
-- so you can tell old vs new data apart after a KLU ERP HTML change.
alter table sync_sessions add column if not exists parser_version text default 'v1';
