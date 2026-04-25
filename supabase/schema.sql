-- =============================================================================
-- Lina German Tutor — Supabase schema
-- =============================================================================
-- Run this once in your Supabase project's SQL editor.
--
-- What it gives you:
--   - profiles      → display name, country, level (per user)
--   - progress      → xp, streaks, vocab, grammar, total minutes
--   - sessions      → full conversation history with summaries
--   - homework      → pending + history
--   - plan          → Zero→Hero plan (goal level, daily minutes, sessions done)
--   - settings      → AI provider/key/model/voice key (so a new device
--                     auto-restores them after sign-in — the user doesn't
--                     have to redo onboarding on every browser)
--
-- Security model: Row-Level Security (RLS). Every user can only read/write
-- their own rows. The anon key is therefore safe to ship in the frontend —
-- nothing is exposed beyond what the user is allowed to see.
--
-- Auto-provisioning: when a new user signs up via auth, we create empty
-- profile/progress/homework rows for them via a trigger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  country       text,         -- ISO-3166 alpha-2 (e.g. "IN", "DE", "US"). Free-text fallback ok.
  level         text,         -- 'A1' | 'A2' | 'B1' | 'B2' | 'C1'
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create table if not exists public.progress (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  xp                  int           not null default 0,
  streak_days         int           not null default 0,
  last_session_date   date,
  total_minutes       int           not null default 0,
  sessions_completed  int           not null default 0,
  vocab_learned       jsonb         not null default '[]'::jsonb,   -- [{de, en, firstSeen, strength, lastReviewed}]
  grammar_covered     jsonb         not null default '[]'::jsonb,   -- [{topic, firstCovered, mastery}]
  updated_at          timestamptz   not null default now()
);

create table if not exists public.sessions (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references auth.users(id) on delete cascade,
  client_id   text,                    -- the original startedAt ISO string used as id locally (for upsert dedupe)
  mode        text,                    -- 'free' | 'zero-hero' | 'grammar' | 'vocab' | 'roleplay'
  topic       text,
  scenario    text,
  started_at  timestamptz,
  ended_at    timestamptz,
  messages    jsonb,                   -- [{id, role, text}]
  summary     jsonb,                   -- { topics, vocab, revisionHints, homework, levelSignal }
  created_at  timestamptz   not null default now(),
  unique (user_id, client_id)
);
create index if not exists sessions_user_started on public.sessions(user_id, started_at desc);

create table if not exists public.homework (
  user_id     uuid          primary key references auth.users(id) on delete cascade,
  pending     text,
  history     jsonb         not null default '[]'::jsonb,           -- [{prompt, completed}]
  updated_at  timestamptz   not null default now()
);

create table if not exists public.plan (
  user_id             uuid          primary key references auth.users(id) on delete cascade,
  goal_level          text,
  daily_minutes       int,
  started_at          timestamptz,
  sessions_completed  int           not null default 0,
  updated_at          timestamptz   not null default now()
);

-- Settings travel with the user so signing in on a new device restores the
-- chosen AI provider + API key automatically — they don't have to repeat
-- onboarding. RLS guarantees only the owner can read these rows; the keys
-- never leak across users.
create table if not exists public.settings (
  user_id     uuid          primary key references auth.users(id) on delete cascade,
  provider    text,
  api_key     text,
  model       text,
  voice_key   text,
  mic_lang    text,
  updated_at  timestamptz   not null default now()
);

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles  enable row level security;
alter table public.progress  enable row level security;
alter table public.sessions  enable row level security;
alter table public.homework  enable row level security;
alter table public.plan      enable row level security;
alter table public.settings  enable row level security;

-- profiles
drop policy if exists "profiles read own"   on public.profiles;
drop policy if exists "profiles upsert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles read own"   on public.profiles for select  using (auth.uid() = id);
create policy "profiles upsert own" on public.profiles for insert  with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update  using (auth.uid() = id) with check (auth.uid() = id);

-- progress
drop policy if exists "progress read own"   on public.progress;
drop policy if exists "progress upsert own" on public.progress;
drop policy if exists "progress update own" on public.progress;
create policy "progress read own"   on public.progress for select  using (auth.uid() = user_id);
create policy "progress upsert own" on public.progress for insert  with check (auth.uid() = user_id);
create policy "progress update own" on public.progress for update  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sessions
drop policy if exists "sessions read own"   on public.sessions;
drop policy if exists "sessions write own"  on public.sessions;
drop policy if exists "sessions update own" on public.sessions;
drop policy if exists "sessions delete own" on public.sessions;
create policy "sessions read own"   on public.sessions for select  using (auth.uid() = user_id);
create policy "sessions write own"  on public.sessions for insert  with check (auth.uid() = user_id);
create policy "sessions update own" on public.sessions for update  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sessions delete own" on public.sessions for delete  using (auth.uid() = user_id);

-- homework
drop policy if exists "homework read own"   on public.homework;
drop policy if exists "homework upsert own" on public.homework;
drop policy if exists "homework update own" on public.homework;
create policy "homework read own"   on public.homework for select  using (auth.uid() = user_id);
create policy "homework upsert own" on public.homework for insert  with check (auth.uid() = user_id);
create policy "homework update own" on public.homework for update  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- plan
drop policy if exists "plan read own"   on public.plan;
drop policy if exists "plan upsert own" on public.plan;
drop policy if exists "plan update own" on public.plan;
create policy "plan read own"   on public.plan for select  using (auth.uid() = user_id);
create policy "plan upsert own" on public.plan for insert  with check (auth.uid() = user_id);
create policy "plan update own" on public.plan for update  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- settings
drop policy if exists "settings read own"   on public.settings;
drop policy if exists "settings upsert own" on public.settings;
drop policy if exists "settings update own" on public.settings;
create policy "settings read own"   on public.settings for select  using (auth.uid() = user_id);
create policy "settings upsert own" on public.settings for insert  with check (auth.uid() = user_id);
create policy "settings update own" on public.settings for update  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Auto-create empty rows when a new user signs up
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.progress (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.homework (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- updated_at touchers
-- -----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_touch on public.profiles;
drop trigger if exists progress_touch on public.progress;
drop trigger if exists homework_touch on public.homework;
drop trigger if exists plan_touch     on public.plan;
drop trigger if exists settings_touch on public.settings;
create trigger profiles_touch before update on public.profiles for each row execute procedure public.touch_updated_at();
create trigger progress_touch before update on public.progress for each row execute procedure public.touch_updated_at();
create trigger homework_touch before update on public.homework for each row execute procedure public.touch_updated_at();
create trigger plan_touch     before update on public.plan     for each row execute procedure public.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute procedure public.touch_updated_at();
