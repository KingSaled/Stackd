-- =============================================================================
-- Stackd database schema (Supabase / Postgres 15+)
--
-- Paste this whole file into the Supabase SQL editor and run it. It is
-- idempotent: re-running it upgrades functions and policies in place.
--
-- Security model
--   * Clients (anon / authenticated roles) can only READ what RLS allows and can
--     only WRITE through the SECURITY DEFINER functions granted to them below
--     (profile edits, daily bonus, emergency reload, joining rooms, chat).
--   * All game mutations go through Netlify Functions using the service role,
--     which run the authoritative TypeScript poker engine and commit each new
--     state atomically through commit_table() with optimistic concurrency.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text not null default 'Player',
  avatar            text not null default '🦊',
  color             text not null default '#f5c451',
  chips             bigint not null default 10000 check (chips >= 0),
  hands_played      integer not null default 0,
  hands_won         integer not null default 0,
  biggest_pot       bigint not null default 0,
  best_hand         smallint not null default -1,
  daily_streak      integer not null default 0,
  last_daily_claim  timestamptz,
  last_reload_at    timestamptz,
  reload_count      integer not null default 0,
  is_guest          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.profiles add column if not exists last_seen_changelog text;
-- Terms of Service / Privacy Policy acceptance and age confirmation (18+).
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists age_confirmed_at timestamptz;
-- Equipped Cosmetic Shop items.
alter table public.profiles add column if not exists frame text;
alter table public.profiles add column if not exists backdrop text;
-- Set to true (in the Supabase table editor) to keep an account off the leaderboard.
alter table public.profiles add column if not exists leaderboard_hidden boolean not null default false;
alter table public.profiles alter column avatar set default 'p01';

create table if not exists public.tables (
  id            text primary key,
  name          text not null,
  host_id       uuid references public.profiles (id) on delete set null,
  config        jsonb not null,
  has_password  boolean not null default false,
  listed        boolean not null default false,
  state         jsonb not null,
  version       integer not null default 1,
  status        text not null default 'waiting',
  player_count  integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Which game a table plays ('holdem' or 'blackjack'), taken from its config.
alter table public.tables add column if not exists game text generated always as (coalesce(config ->> 'game', 'holdem')) stored;
create index if not exists tables_listed_idx on public.tables (listed, updated_at desc);
create index if not exists tables_updated_idx on public.tables (updated_at);

-- Server-only: deck, hole cards and the room password hash. No client policies.
create table if not exists public.table_secrets (
  table_id       text primary key references public.tables (id) on delete cascade,
  secret         jsonb not null default '{}'::jsonb,
  password_hash  text
);

-- Who may view a room (password rooms require a successful join).
create table if not exists public.table_members (
  table_id   text not null references public.tables (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (table_id, user_id)
);
create index if not exists table_members_user_idx on public.table_members (user_id);

-- Projection of who sits where with how many chips (lobby + broke checks).
create table if not exists public.table_seats (
  table_id  text not null references public.tables (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  seat      smallint not null,
  stack     bigint not null default 0,
  primary key (table_id, user_id)
);
create index if not exists table_seats_user_idx on public.table_seats (user_id);

-- Each player's private hole cards for the current hand (RLS: owner only).
create table if not exists public.player_cards (
  table_id    text not null references public.tables (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  hand_no     integer not null,
  seat        smallint not null,
  cards       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (table_id, user_id)
);

create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  table_id    text not null references public.tables (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null default '',
  avatar      text not null default '',
  color       text not null default '',
  kind        text not null default 'chat' check (kind in ('chat', 'reaction')),
  body        text not null check (char_length(body) between 1 and 280),
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_table_idx on public.chat_messages (table_id, id desc);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id, created_at desc);

create table if not exists public.room_join_failures (
  table_id        text not null references public.tables (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  failures        integer not null default 0,
  last_failed_at  timestamptz not null default now(),
  primary key (table_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.tables             enable row level security;
alter table public.table_secrets      enable row level security;
alter table public.table_members      enable row level security;
alter table public.table_seats        enable row level security;
alter table public.player_cards       enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.room_join_failures enable row level security;

-- Clients never write tables directly except chat inserts (validated by trigger + RLS).
revoke insert, update, delete on public.profiles, public.tables, public.table_secrets, public.table_members,
  public.table_seats, public.player_cards, public.room_join_failures from anon, authenticated;
revoke update, delete on public.chat_messages from anon, authenticated;
revoke all on public.table_secrets, public.room_join_failures from anon, authenticated;
revoke truncate, references, trigger on public.profiles, public.tables, public.table_members, public.table_seats,
  public.player_cards, public.chat_messages from anon, authenticated;
grant select on public.profiles, public.tables, public.table_members, public.table_seats, public.player_cards,
  public.chat_messages to authenticated;
revoke insert on public.chat_messages from anon, authenticated;
grant insert (table_id, kind, body) on public.chat_messages to authenticated;

create or replace function public.is_table_member(p_table_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.table_members m
    where m.table_id = p_table_id and m.user_id = auth.uid()
  );
$$;

drop policy if exists "profiles are readable by signed-in users" on public.profiles;
create policy "profiles are readable by signed-in users" on public.profiles
  for select to authenticated using (true);

drop policy if exists "tables readable when open or joined" on public.tables;
create policy "tables readable when open or joined" on public.tables
  for select to authenticated using (not has_password or public.is_table_member(id));

drop policy if exists "members read their memberships" on public.table_members;
create policy "members read their memberships" on public.table_members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "seats readable" on public.table_seats;
create policy "seats readable" on public.table_seats
  for select to authenticated using (true);

drop policy if exists "players read their own cards" on public.player_cards;
create policy "players read their own cards" on public.player_cards
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "members read chat" on public.chat_messages;
create policy "members read chat" on public.chat_messages
  for select to authenticated using (public.is_table_member(table_id));

drop policy if exists "members write chat" on public.chat_messages;
create policy "members write chat" on public.chat_messages
  for insert to authenticated with check (user_id = auth.uid() and public.is_table_member(table_id));

-- -----------------------------------------------------------------------------
-- Pixel-art portraits (public/portraits/<id>.png, see shared/portraits.ts)
-- -----------------------------------------------------------------------------

create or replace function public.portrait_ids()
returns text[]
language sql
immutable
as $$
  select array[
    'p01','p03','p04','p06','p07','p11','p13','p15','p16','p18',
    'p20','p21','p22','p23','p24','p26','p29','p31','p33','p34',
    'p35','p38','p39','p42','p43','p44','p46','p47','p48','p50',
    'p51','p53','p56','p57','p59','p62','p67','p68','p69','p75',
    'p76','p83','p90','p91','p97','p98','p99','p102','p105','p110']
$$;

-- -----------------------------------------------------------------------------
-- New users get a profile with starting chips
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_guest boolean := coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false);
  v_avatars text[] := public.portrait_ids();
  v_colors text[] := array['#f5c451','#ff6b6b','#ff8e3c','#6bcb77','#3ef0a8','#4dd4ff','#4d8bff','#8f6bff','#d46bff','#ff6bcb'];
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_name is null then
    if v_guest or new.email is null then
      v_name := 'Guest ' || upper(substr(replace(new.id::text, '-', ''), 1, 4));
    else
      v_name := split_part(new.email, '@', 1);
    end if;
  end if;
  v_name := left(v_name, 20);
  insert into public.profiles (id, display_name, avatar, color, is_guest)
  values (
    new.id,
    v_name,
    v_avatars[1 + floor(random() * array_length(v_avatars, 1))::int],
    v_colors[1 + floor(random() * array_length(v_colors, 1))::int],
    v_guest
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep is_guest in sync when an anonymous account is upgraded to email/password.
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set is_guest = coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false),
         updated_at = now()
   where id = new.id
     and is_guest is distinct from coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- -----------------------------------------------------------------------------
-- Anti-abuse plumbing: hashed device / network fingerprints and bonus claim log
--
-- Device ids are random values the browser keeps in local storage; IP addresses
-- come from the request headers Supabase passes through. Both are stored only as
-- salted one-way hashes, never in readable form, and clients cannot read these
-- tables at all.
-- -----------------------------------------------------------------------------

create table if not exists public.private_settings (
  key    text primary key,
  value  text not null
);
insert into public.private_settings (key, value)
values ('hash_salt', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

create table if not exists public.device_links (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('device', 'ip')),
  hash        text not null,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (user_id, kind, hash)
);
create index if not exists device_links_hash_idx on public.device_links (kind, hash);

create table if not exists public.bonus_claims (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('daily', 'reload')),
  amount       bigint not null,
  device_hash  text,
  ip_hash      text,
  created_at   timestamptz not null default now()
);
create index if not exists bonus_claims_device_idx on public.bonus_claims (kind, device_hash, created_at desc);
create index if not exists bonus_claims_ip_idx on public.bonus_claims (kind, ip_hash, created_at desc);
create index if not exists bonus_claims_user_idx on public.bonus_claims (user_id, created_at desc);

-- Chips that moved between two real players through pots, per day.
create table if not exists public.chip_transfers (
  day        date not null default current_date,
  from_user  uuid not null references public.profiles (id) on delete cascade,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  amount     bigint not null default 0,
  hands      integer not null default 0,
  primary key (day, from_user, to_user)
);
create index if not exists chip_transfers_to_idx on public.chip_transfers (to_user, day);

-- Suspicious activity for the site owner to review (Supabase → Table editor → abuse_flags).
create table if not exists public.abuse_flags (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null,
  severity    text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  user_id     uuid references public.profiles (id) on delete cascade,
  other_user  uuid references public.profiles (id) on delete cascade,
  details     jsonb not null default '{}'::jsonb,
  resolved    boolean not null default false,
  note        text
);
create index if not exists abuse_flags_open_idx on public.abuse_flags (resolved, created_at desc);

alter table public.private_settings enable row level security;
alter table public.device_links     enable row level security;
alter table public.bonus_claims     enable row level security;
alter table public.chip_transfers   enable row level security;
alter table public.abuse_flags      enable row level security;
revoke all on public.private_settings, public.device_links, public.bonus_claims, public.chip_transfers,
  public.abuse_flags from anon, authenticated;

create or replace function public.hash_id(p_value text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case
    when p_value is null or btrim(p_value) = '' then null
    else encode(digest(btrim(p_value) || (select value from public.private_settings where key = 'hash_salt'), 'sha256'), 'hex')
  end
$$;

-- Client IP as seen by Supabase (first hop of the forwarded chain).
create or replace function public.request_ip()
returns text
language plpgsql
stable
as $$
declare
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if v_headers is null then return null; end if;
  return nullif(btrim(split_part(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
end;
$$;

-- Only well-formed device ids from our own client are kept.
create or replace function public.device_hash(p_device text)
returns text
language sql
stable
as $$
  select case when p_device ~ '^[A-Za-z0-9-]{16,64}$' then public.hash_id('device:' || p_device) end
$$;

create or replace function public.link_device(p_user uuid, p_device_hash text, p_ip_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then return; end if;
  if p_device_hash is not null then
    insert into public.device_links (user_id, kind, hash) values (p_user, 'device', p_device_hash)
    on conflict (user_id, kind, hash) do update set last_seen = now();
  end if;
  if p_ip_hash is not null then
    insert into public.device_links (user_id, kind, hash) values (p_user, 'ip', p_ip_hash)
    on conflict (user_id, kind, hash) do update set last_seen = now();
  end if;
end;
$$;

-- Called by the app on start so accounts that share a device or network can be linked.
create or replace function public.touch_device(p_device text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  perform public.link_device(auth.uid(), public.device_hash(p_device), public.hash_id('ip:' || public.request_ip()));
end;
$$;

-- Accounts linked to the same device or network in the last 30 days.
create or replace function public.accounts_linked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.device_links a
      join public.device_links b on b.kind = a.kind and b.hash = a.hash
     where a.user_id = p_a and b.user_id = p_b
       and a.last_seen > now() - interval '30 days' and b.last_seen > now() - interval '30 days'
  )
$$;

create or replace function public.raise_flag(p_kind text, p_severity text, p_user uuid, p_other uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- One open flag per kind and pair per day is enough.
  if exists (
    select 1 from public.abuse_flags
     where kind = p_kind and not resolved
       and user_id is not distinct from p_user and other_user is not distinct from p_other
       and created_at > now() - interval '24 hours'
  ) then
    return;
  end if;
  insert into public.abuse_flags (kind, severity, user_id, other_user, details)
  values (p_kind, p_severity, p_user, p_other, coalesce(p_details, '{}'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- Player stats counters and achievements (counted from launch, never retroactive)
-- -----------------------------------------------------------------------------

create table if not exists public.player_stats (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  counters    jsonb not null default '{}'::jsonb,
  since       timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.achievements (
  id       text primary key,
  counter  text not null,
  target   bigint not null,
  reward   bigint not null default 0
);

create table if not exists public.player_achievements (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  achievement_id  text not null references public.achievements (id) on delete cascade,
  unlocked_at     timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.player_stats        enable row level security;
alter table public.achievements        enable row level security;
alter table public.player_achievements enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.player_stats, public.achievements,
  public.player_achievements from anon, authenticated;
grant select on public.player_stats, public.achievements, public.player_achievements to authenticated;

drop policy if exists "stats readable" on public.player_stats;
create policy "stats readable" on public.player_stats for select to authenticated using (true);
drop policy if exists "achievements readable" on public.achievements;
create policy "achievements readable" on public.achievements for select to authenticated using (true);
drop policy if exists "unlocks readable" on public.player_achievements;
create policy "unlocks readable" on public.player_achievements for select to authenticated using (true);

-- Keep in sync with shared/achievements.ts (a test checks this).
insert into public.achievements (id, counter, target, reward) values
  ('first_hand', 'hands', 1, 500),
  ('hands_100', 'hands', 100, 2000),
  ('hands_1000', 'hands', 1000, 10000),
  ('first_win', 'wins', 1, 500),
  ('wins_100', 'wins', 100, 5000),
  ('wins_500', 'wins', 500, 20000),
  ('showdown_25', 'showdown_wins', 25, 3000),
  ('steal_25', 'uncontested_wins', 25, 3000),
  ('allin_win', 'allin_wins', 1, 1000),
  ('allin_10', 'allin_wins', 10, 5000),
  ('double_up', 'double_ups', 1, 1500),
  ('big_win_10k', 'biggest_win', 10000, 3000),
  ('big_win_100k', 'biggest_win', 100000, 15000),
  ('win_straight', 'win_straight', 1, 1000),
  ('win_flush', 'win_flush', 1, 1000),
  ('win_full_house', 'win_full_house', 1, 2000),
  ('win_quads', 'win_quads', 1, 5000),
  ('win_straight_flush', 'win_straight_flush', 1, 15000),
  ('win_royal', 'win_royal', 1, 50000),
  ('bot_wins_25', 'bot_table_wins', 25, 2000),
  ('full_ring_50', 'full_ring_hands', 50, 3000),
  ('streak_7', 'best_streak', 7, 3000),
  ('style_1', 'cosmetics_bought', 1, 1000),
  ('style_5', 'cosmetics_bought', 5, 10000)
on conflict (id) do update set counter = excluded.counter, target = excluded.target, reward = excluded.reward;

-- Unlock every achievement whose target has been reached and pay its reward once.
create or replace function public.grant_achievements(p_user uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids text[];
  v_reward bigint;
begin
  with ins as (
    insert into public.player_achievements (user_id, achievement_id)
    select p_user, a.id
      from public.achievements a
      join public.player_stats s on s.user_id = p_user
     where coalesce((s.counters ->> a.counter)::bigint, 0) >= a.target
    on conflict do nothing
    returning achievement_id
  )
  select array_agg(achievement_id) into v_ids from ins;
  if v_ids is null then return '{}'; end if;
  select coalesce(sum(reward), 0) into v_reward from public.achievements where id = any (v_ids);
  if v_reward > 0 then
    update public.profiles set chips = chips + v_reward, updated_at = now() where id = p_user;
  end if;
  return v_ids;
end;
$$;

-- Add to running counters (p_add) and raise high-water marks (p_max), then check achievements.
create or replace function public.bump_counters(p_user uuid, p_add jsonb, p_max jsonb default '{}'::jsonb)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c jsonb;
  k text;
  v jsonb;
begin
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then return '{}'; end if;
  insert into public.player_stats (user_id) values (p_user) on conflict do nothing;
  select counters into v_c from public.player_stats where user_id = p_user for update;
  for k, v in select * from jsonb_each(coalesce(p_add, '{}'::jsonb)) loop
    if (v #>> '{}')::bigint <> 0 then
      v_c := jsonb_set(v_c, array[k], to_jsonb(coalesce((v_c ->> k)::bigint, 0) + (v #>> '{}')::bigint));
    end if;
  end loop;
  for k, v in select * from jsonb_each(coalesce(p_max, '{}'::jsonb)) loop
    if v_c ->> k is null or (v #>> '{}')::bigint > (v_c ->> k)::bigint then
      v_c := jsonb_set(v_c, array[k], to_jsonb((v #>> '{}')::bigint));
    end if;
  end loop;
  update public.player_stats set counters = v_c, updated_at = now() where user_id = p_user;
  return public.grant_achievements(p_user);
end;
$$;

-- -----------------------------------------------------------------------------
-- Profile & economy RPCs (callable by signed-in users)
-- -----------------------------------------------------------------------------

create or replace function public.update_profile(p_display_name text, p_avatar text, p_color text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_row public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 20 then
    raise exception 'Display name must be 2-20 characters';
  end if;
  if p_avatar is null or not (p_avatar = any (public.portrait_ids())) then
    raise exception 'Invalid avatar';
  end if;
  if p_color is null or p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Invalid color';
  end if;
  update public.profiles
     set display_name = v_name, avatar = p_avatar, color = lower(p_color), updated_at = now()
   where id = v_uid
  returning * into v_row;
  return v_row;
end;
$$;

-- Remember which release notes a player has dismissed (shown once per player).
create or replace function public.mark_changelog_seen(p_version text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen_changelog = left(p_version, 32)
   where id = auth.uid();
$$;

-- How many different accounts may collect each bonus from one device per day.
create or replace function public.bonus_device_limit()
returns integer
language sql
immutable
as $$ select 2 $$;

drop function if exists public.claim_daily_bonus();
create or replace function public.claim_daily_bonus(p_device text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_streak integer;
  v_amount bigint;
  v_dev text := public.device_hash(p_device);
  v_ip text := public.hash_id('ip:' || public.request_ip());
  v_others integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- The row lock makes the cooldown hold across every device and tab at once.
  select * into v_p from public.profiles where id = v_uid for update;
  if not found then raise exception 'profile_missing'; end if;
  perform public.link_device(v_uid, v_dev, v_ip);
  if v_p.last_daily_claim is not null and v_p.last_daily_claim > now() - interval '24 hours' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'cooldown',
      'next_claim_at', v_p.last_daily_claim + interval '24 hours',
      'chips', v_p.chips,
      'streak', v_p.daily_streak);
  end if;
  if v_dev is not null then
    select count(distinct user_id) into v_others
      from public.bonus_claims
     where kind = 'daily' and device_hash = v_dev and user_id <> v_uid and created_at > now() - interval '24 hours';
    if v_others >= public.bonus_device_limit() then
      perform public.raise_flag('device_bonus_limit', 'medium', v_uid, null, jsonb_build_object('bonus', 'daily', 'other_accounts', v_others));
      return jsonb_build_object('ok', false, 'reason', 'device_limit', 'chips', v_p.chips);
    end if;
  end if;
  if v_p.last_daily_claim is not null and v_p.last_daily_claim > now() - interval '48 hours' then
    v_streak := least(v_p.daily_streak + 1, 7);
  else
    v_streak := 1;
  end if;
  v_amount := 2000 + (v_streak - 1) * 500;
  update public.profiles
     set chips = chips + v_amount, last_daily_claim = now(), daily_streak = v_streak, updated_at = now()
   where id = v_uid
  returning * into v_p;
  insert into public.bonus_claims (user_id, kind, amount, device_hash, ip_hash) values (v_uid, 'daily', v_amount, v_dev, v_ip);
  -- Many accounts collecting from one network is worth a look (shared Wi-Fi is fine, farms are not).
  if v_ip is not null and (
    select count(distinct user_id) from public.bonus_claims
     where kind = 'daily' and ip_hash = v_ip and created_at > now() - interval '24 hours') >= 6 then
    perform public.raise_flag('shared_network_bonus', 'low', v_uid, null, jsonb_build_object('bonus', 'daily'));
  end if;
  perform public.bump_counters(v_uid, '{}'::jsonb, jsonb_build_object('best_streak', v_streak));
  select * into v_p from public.profiles where id = v_uid;
  return jsonb_build_object(
    'ok', true,
    'amount', v_amount,
    'streak', v_streak,
    'chips', v_p.chips,
    'next_claim_at', v_p.last_daily_claim + interval '24 hours');
end;
$$;

drop function if exists public.emergency_reload();
create or replace function public.emergency_reload(p_device text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_seated bigint;
  v_total bigint;
  v_amount bigint;
  v_dev text := public.device_hash(p_device);
  v_ip text := public.hash_id('ip:' || public.request_ip());
  v_others integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_p from public.profiles where id = v_uid for update;
  if not found then raise exception 'profile_missing'; end if;
  perform public.link_device(v_uid, v_dev, v_ip);
  select coalesce(sum(stack), 0) into v_seated from public.table_seats where user_id = v_uid;
  v_total := v_p.chips + v_seated;
  if v_total >= 1000 then
    return jsonb_build_object('ok', false, 'reason', 'not_broke', 'chips', v_p.chips, 'total', v_total);
  end if;
  if v_p.last_reload_at is not null and v_p.last_reload_at > now() - interval '60 minutes' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'cooldown',
      'next_reload_at', v_p.last_reload_at + interval '60 minutes',
      'chips', v_p.chips);
  end if;
  if v_dev is not null then
    select count(distinct user_id) into v_others
      from public.bonus_claims
     where kind = 'reload' and device_hash = v_dev and user_id <> v_uid and created_at > now() - interval '24 hours';
    if v_others >= public.bonus_device_limit() then
      perform public.raise_flag('device_bonus_limit', 'medium', v_uid, null, jsonb_build_object('bonus', 'reload', 'other_accounts', v_others));
      return jsonb_build_object('ok', false, 'reason', 'device_limit', 'chips', v_p.chips);
    end if;
  end if;
  v_amount := 2500 - v_total;
  update public.profiles
     set chips = chips + v_amount, last_reload_at = now(), reload_count = reload_count + 1, updated_at = now()
   where id = v_uid
  returning * into v_p;
  insert into public.bonus_claims (user_id, kind, amount, device_hash, ip_hash) values (v_uid, 'reload', v_amount, v_dev, v_ip);
  return jsonb_build_object(
    'ok', true,
    'amount', v_amount,
    'chips', v_p.chips,
    'next_reload_at', v_p.last_reload_at + interval '60 minutes');
end;
$$;

-- Record acceptance of the current Terms of Service + Privacy Policy and the 18+ confirmation.
create or replace function public.accept_terms(p_version text, p_age_confirmed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_age_confirmed is not true then raise exception 'You must be 18 or older to play Stackd'; end if;
  update public.profiles
     set terms_version = left(p_version, 32), terms_accepted_at = now(), age_confirmed_at = now(), updated_at = now()
   where id = auth.uid();
end;
$$;

-- Chips currently sitting on tables for the caller (for broke checks in the UI).
drop function if exists public.my_tables();
create or replace function public.my_tables()
returns table (table_id text, name text, seat smallint, stack bigint, big_blind bigint, small_blind bigint, player_count integer, max_seats integer, updated_at timestamptz, game text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, s.seat, s.stack,
         (t.config ->> 'bigBlind')::bigint, (t.config ->> 'smallBlind')::bigint,
         t.player_count, (t.config ->> 'maxSeats')::int, t.updated_at, t.game
    from public.table_seats s
    join public.tables t on t.id = s.table_id
   where s.user_id = auth.uid()
   order by t.updated_at desc;
$$;

drop function if exists public.list_open_tables();
create or replace function public.list_open_tables()
returns table (id text, name text, small_blind bigint, big_blind bigint, max_seats integer, min_buy_in bigint, max_buy_in bigint, player_count integer, status text, updated_at timestamptz, bots boolean, game text, turn_seconds integer)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name,
         (t.config ->> 'smallBlind')::bigint, (t.config ->> 'bigBlind')::bigint, (t.config ->> 'maxSeats')::int,
         (t.config ->> 'minBuyIn')::bigint, (t.config ->> 'maxBuyIn')::bigint,
         t.player_count, t.status, t.updated_at, coalesce((t.config ->> 'bots')::boolean, false),
         t.game, (t.config ->> 'turnSeconds')::int
    from public.tables t
   -- Every table is public unless it has a password (the old per-table listing switch is ignored).
   where not t.has_password and t.player_count > 0 and t.updated_at > now() - interval '2 days'
   order by t.player_count desc, t.updated_at desc
   limit 40;
$$;

drop function if exists public.leaderboard();
create or replace function public.leaderboard()
returns table (id uuid, display_name text, avatar text, color text, total_chips bigint, hands_played integer, hands_won integer, biggest_pot bigint, frame text, backdrop text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar, p.color,
         p.chips + coalesce((select sum(s.stack) from public.table_seats s where s.user_id = p.id), 0) as total_chips,
         p.hands_played, p.hands_won, p.biggest_pot, p.frame, p.backdrop
    from public.profiles p
   where not p.is_guest -- only saved accounts; guests can share names and come and go
     and not p.leaderboard_hidden
     and (p.hands_played > 0 or p.chips <> 10000)
   order by total_chips desc, p.hands_won desc
   limit 25;
$$;

create or replace function public.server_time()
returns double precision
language sql
volatile
as $$ select extract(epoch from clock_timestamp()) * 1000 $$;

-- Public information about a room for the invite landing page.
create or replace function public.room_preview(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'config', t.config,
    'has_password', t.has_password,
    'player_count', t.player_count,
    'is_member', exists (select 1 from public.table_members m where m.table_id = t.id and m.user_id = auth.uid())
  )
  from public.tables t
  where t.id = upper(p_id);
$$;

create or replace function public.join_room(p_id text, p_password text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_id text := upper(btrim(coalesce(p_id, '')));
  v_t public.tables;
  v_hash text;
  v_fail public.room_join_failures;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_t from public.tables where id = v_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if exists (select 1 from public.table_members where table_id = v_id and user_id = v_uid) then
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;
  if v_t.has_password then
    select * into v_fail from public.room_join_failures where table_id = v_id and user_id = v_uid;
    if found and v_fail.failures >= 5 and v_fail.last_failed_at > now() - interval '5 minutes' then
      return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
    end if;
    if p_password is null or p_password = '' then
      return jsonb_build_object('ok', false, 'error', 'password_required');
    end if;
    select password_hash into v_hash from public.table_secrets where table_id = v_id;
    if v_hash is null or crypt(p_password, v_hash) <> v_hash then
      insert into public.room_join_failures as f (table_id, user_id, failures, last_failed_at)
      values (v_id, v_uid, 1, now())
      on conflict (table_id, user_id) do update
        set failures = case when f.last_failed_at < now() - interval '5 minutes' then 1 else f.failures + 1 end,
            last_failed_at = now();
      return jsonb_build_object('ok', false, 'error', 'wrong_password');
    end if;
    delete from public.room_join_failures where table_id = v_id and user_id = v_uid;
  end if;
  insert into public.table_members (table_id, user_id) values (v_id, v_uid) on conflict do nothing;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Chat: identity is stamped server-side, spam is throttled
-- -----------------------------------------------------------------------------

create or replace function public.chat_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.profiles;
  v_recent integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  new.user_id := auth.uid();
  new.created_at := now();
  new.body := btrim(new.body);
  select * into v_p from public.profiles where id = new.user_id;
  if not found then raise exception 'profile_missing'; end if;
  new.name := v_p.display_name;
  new.avatar := v_p.avatar;
  new.color := v_p.color;
  if new.kind = 'reaction' and char_length(new.body) > 8 then
    raise exception 'Invalid reaction';
  end if;
  select count(*) into v_recent
    from public.chat_messages
   where user_id = new.user_id and created_at > now() - interval '10 seconds';
  if v_recent >= 8 then
    raise exception 'Slow down! You are sending messages too quickly.';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_before_insert on public.chat_messages;
create trigger chat_before_insert
  before insert on public.chat_messages
  for each row execute function public.chat_before_insert();

-- -----------------------------------------------------------------------------
-- Service-only functions used by Netlify Functions (service role)
-- -----------------------------------------------------------------------------

create or replace function public.create_table(
  p_id text, p_name text, p_host uuid, p_config jsonb, p_state jsonb, p_secret jsonb,
  p_password text, p_listed boolean) -- p_listed is no longer used: tables without a password are public
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if p_password is not null and p_password <> '' then
    v_hash := crypt(p_password, gen_salt('bf', 8));
  end if;
  insert into public.tables (id, name, host_id, config, has_password, listed, state, version)
  values (p_id, p_name, p_host, p_config, v_hash is not null, v_hash is null, p_state, 1);
  insert into public.table_secrets (table_id, secret, password_hash) values (p_id, p_secret, v_hash);
  insert into public.table_members (table_id, user_id) values (p_id, p_host) on conflict do nothing;
  return p_id;
end;
$$;

create or replace function public.load_table(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'host_id', t.host_id, 'version', t.version,
    'has_password', t.has_password, 'state', t.state, 'secret', s.secret, 'updated_at', t.updated_at)
  from public.tables t
  left join public.table_secrets s on s.table_id = t.id
  where t.id = p_id;
$$;

-- Atomically persist one engine transition. Raises 'version_conflict' if another
-- writer committed first (caller reloads and retries) and 'insufficient_chips'
-- if a buy-in exceeds the player's wallet.
create or replace function public.commit_table(
  p_id text,
  p_version integer,
  p_state jsonb,
  p_secret jsonb,
  p_seats jsonb,
  p_cards jsonb,
  p_wallet jsonb,
  p_stats jsonb,
  p_status text,
  p_player_count integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version integer;
  v_prev_count integer;
  r record;
begin
  select player_count into v_prev_count from public.tables where id = p_id for update;

  update public.tables
     set state = p_state,
         version = version + 1,
         status = p_status,
         player_count = p_player_count,
         updated_at = now()
   where id = p_id and version = p_version
  returning version into v_version;
  if not found then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  update public.table_secrets set secret = p_secret where table_id = p_id;

  -- Wallet movements (buy-ins negative, cash-outs positive). Ordered to avoid deadlocks.
  for r in
    select x.user_id, x.delta
      from jsonb_to_recordset(coalesce(p_wallet, '[]'::jsonb)) as x(user_id uuid, delta bigint)
     order by x.user_id
  loop
    update public.profiles
       set chips = chips + r.delta, updated_at = now()
     where id = r.user_id and chips + r.delta >= 0;
    if not found and r.delta < 0 then
      raise exception 'insufficient_chips' using errcode = 'P0001';
    end if;
  end loop;

  for r in
    select x.user_id, x.played, x.won, x.biggest_pot, x.best_hand
      from jsonb_to_recordset(coalesce(p_stats, '[]'::jsonb))
        as x(user_id uuid, played integer, won integer, biggest_pot bigint, best_hand integer)
     order by x.user_id
  loop
    update public.profiles
       set hands_played = hands_played + coalesce(r.played, 0),
           hands_won = hands_won + coalesce(r.won, 0),
           biggest_pot = greatest(biggest_pot, coalesce(r.biggest_pot, 0)),
           best_hand = greatest(best_hand, coalesce(r.best_hand, -1)::smallint)
     where id = r.user_id;
  end loop;

  delete from public.table_seats where table_id = p_id;
  insert into public.table_seats (table_id, user_id, seat, stack)
  select p_id, x.user_id, x.seat, x.stack
    from jsonb_to_recordset(coalesce(p_seats, '[]'::jsonb)) as x(user_id uuid, seat smallint, stack bigint)
   where exists (select 1 from public.profiles p where p.id = x.user_id);

  -- Seated players are always members (needed for chat in open rooms joined via the API).
  insert into public.table_members (table_id, user_id)
  select p_id, x.user_id
    from jsonb_to_recordset(coalesce(p_seats, '[]'::jsonb)) as x(user_id uuid)
   where exists (select 1 from public.profiles p where p.id = x.user_id)
  on conflict do nothing;

  -- The last player left: close the table (cascades to secrets, seats, cards, chat, members).
  -- Wallets were already credited above, in this same transaction.
  if p_player_count = 0 and coalesce(v_prev_count, 0) > 0 then
    delete from public.tables where id = p_id;
    return v_version;
  end if;

  if p_cards is not null then
    delete from public.player_cards
     where table_id = p_id
       and user_id not in (select (c ->> 'user_id')::uuid from jsonb_array_elements(p_cards) c);
    insert into public.player_cards (table_id, user_id, hand_no, seat, cards, updated_at)
    select p_id, x.user_id, x.hand_no, x.seat, x.cards, now()
      from jsonb_to_recordset(p_cards) as x(user_id uuid, hand_no integer, seat smallint, cards jsonb)
     where exists (select 1 from public.profiles p where p.id = x.user_id)
    on conflict (table_id, user_id) do update
      set hand_no = excluded.hand_no, seat = excluded.seat, cards = excluded.cards, updated_at = now();
  end if;

  return v_version;
end;
$$;

-- Housekeeping used by the scheduled janitor function.
create or replace function public.cleanup_stale_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tables integer;
  v_chat integer;
  v_guests integer;
begin
  -- Tables that were opened but never had anyone sit down.
  delete from public.tables
   where player_count = 0 and updated_at < now() - interval '30 minutes';
  get diagnostics v_tables = row_count;
  delete from public.chat_messages where created_at < now() - interval '3 days';
  get diagnostics v_chat = row_count;
  delete from public.room_join_failures where last_failed_at < now() - interval '1 day';
  -- Guest accounts that were never upgraded to a saved account. Deleting the login removes the
  -- profile and everything attached to it. A guest who is still playing is left alone: one that never
  -- played goes after 2 days, one that did after 30 days without any activity, and anyone seated is kept.
  with gone as (
    select p.id
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.is_guest
       and not exists (select 1 from public.table_seats s where s.user_id = p.id)
       and greatest(p.updated_at, u.last_sign_in_at, u.created_at) <
           now() - case when p.hands_played = 0 and p.chips = 10000 then interval '2 days' else interval '30 days' end
     limit 500
  ),
  removed as (
    delete from auth.users u using gone where u.id = gone.id returning 1
  )
  select count(*) into v_guests from removed;
  return jsonb_build_object('tables_deleted', v_tables, 'chat_deleted', v_chat, 'guests_deleted', v_guests);
end;
$$;

-- -----------------------------------------------------------------------------
-- Hand records: stats counters, achievements and chip-transfer checks.
-- Called by the Netlify Function after a hand is committed (best effort: a
-- failure here never affects the game itself).
-- -----------------------------------------------------------------------------

create or replace function public.record_hands(p_hands jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h jsonb;
  pl jsonb;
  t jsonb;
  v_uid uuid;
  v_won bigint;
  v_net bigint;
  v_cat integer;
  v_unlocked text[];
  v_all text[] := '{}';
  v_from uuid;
  v_to uuid;
  v_amount bigint;
  v_flow bigint;
  v_linked boolean;
  v_young boolean;
begin
  for h in select * from jsonb_array_elements(coalesce(p_hands, '[]'::jsonb)) loop
    for pl in select * from jsonb_array_elements(coalesce(h -> 'players', '[]'::jsonb)) loop
      v_uid := (pl ->> 'user_id')::uuid;
      v_won := coalesce((pl ->> 'won')::bigint, 0);
      v_net := coalesce((pl ->> 'net')::bigint, 0);
      v_cat := coalesce((pl ->> 'category')::integer, -1);
      v_unlocked := public.bump_counters(
        v_uid,
        jsonb_build_object(
          'hands', 1,
          'wins', (v_won > 0)::int,
          'showdowns', (v_cat >= 0)::int,
          'showdown_wins', (v_cat >= 0 and v_won > 0)::int,
          'uncontested_wins', (coalesce((h ->> 'uncontested')::boolean, false) and v_won > 0)::int,
          'allins', coalesce((pl ->> 'allin')::boolean, false)::int,
          'allin_wins', (coalesce((pl ->> 'allin')::boolean, false) and v_won > 0)::int,
          'vpip_hands', coalesce((pl ->> 'vpip')::boolean, false)::int,
          'pfr_hands', coalesce((pl ->> 'pfr')::boolean, false)::int,
          'net_won', v_net,
          'double_ups', (v_won > 0 and coalesce((pl ->> 'start')::bigint, 0) > 0 and v_net >= (pl ->> 'start')::bigint)::int,
          'win_straight', (v_won > 0 and v_cat = 4)::int,
          'win_flush', (v_won > 0 and v_cat = 5)::int,
          'win_full_house', (v_won > 0 and v_cat = 6)::int,
          'win_quads', (v_won > 0 and v_cat = 7)::int,
          'win_straight_flush', (v_won > 0 and v_cat = 8)::int,
          'win_royal', (v_won > 0 and v_cat = 9)::int,
          'bot_table_wins', (v_won > 0 and coalesce((h ->> 'bots')::int, 0) > 0)::int,
          'full_ring_hands', (coalesce((h ->> 'humans')::int, 0) >= 6)::int
        ),
        jsonb_build_object('biggest_win', greatest(v_net, 0)));
      v_all := v_all || coalesce(v_unlocked, '{}');
    end loop;

    for t in select * from jsonb_array_elements(coalesce(h -> 'transfers', '[]'::jsonb)) loop
      v_from := (t ->> 'from')::uuid;
      v_to := (t ->> 'to')::uuid;
      v_amount := coalesce((t ->> 'amount')::bigint, 0);
      if v_from is null or v_to is null or v_from = v_to or v_amount <= 0 then continue; end if;
      if not exists (select 1 from public.profiles where id = v_from)
         or not exists (select 1 from public.profiles where id = v_to) then
        continue;
      end if;
      insert into public.chip_transfers as c (day, from_user, to_user, amount, hands)
      values (current_date, v_from, v_to, v_amount, 1)
      on conflict (day, from_user, to_user) do update set amount = c.amount + excluded.amount, hands = c.hands + 1;

      -- Net flow from v_from to v_to over the last 7 days.
      select coalesce(sum(case when c.from_user = v_from then c.amount else -c.amount end), 0) into v_flow
        from public.chip_transfers c
       where c.day > current_date - 7
         and ((c.from_user = v_from and c.to_user = v_to) or (c.from_user = v_to and c.to_user = v_from));
      if v_flow >= 25000 then
        v_linked := public.accounts_linked(v_from, v_to);
        select (p.is_guest or p.created_at > now() - interval '7 days') into v_young from public.profiles p where p.id = v_from;
        if v_linked then
          perform public.raise_flag('chip_dumping', 'high', v_to, v_from,
            jsonb_build_object('net_7d', v_flow, 'reason', 'accounts share a device or network'));
        elsif v_young then
          perform public.raise_flag('chip_dumping', 'medium', v_to, v_from,
            jsonb_build_object('net_7d', v_flow, 'reason', 'chips flowing from a guest or new account'));
        elsif v_flow >= 100000 then
          perform public.raise_flag('lopsided_transfers', 'low', v_to, v_from,
            jsonb_build_object('net_7d', v_flow, 'reason', 'large one-way chip flow between two players'));
        end if;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('unlocked', to_jsonb(v_all));
end;
$$;

-- Owner's review list: open flags with readable names (run in the SQL editor:
--   select * from public.abuse_report;
-- then set resolved = true in abuse_flags once handled).
create or replace view public.abuse_report as
select f.id, f.created_at, f.kind, f.severity,
       p.display_name as player, f.user_id,
       o.display_name as other_player, f.other_user,
       f.details, f.note
  from public.abuse_flags f
  left join public.profiles p on p.id = f.user_id
  left join public.profiles o on o.id = f.other_user
 where not f.resolved
 order by case f.severity when 'high' then 0 when 'medium' then 1 else 2 end, f.created_at desc;
revoke all on public.abuse_report from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Cosmetic Shop (bought with play chips only; keep in sync with shared/cosmetics.ts)
-- -----------------------------------------------------------------------------

create table if not exists public.cosmetics (
  id     text primary key,
  kind   text not null check (kind in ('frame', 'backdrop')),
  price  bigint not null check (price > 0),
  tier   smallint not null
);

create table if not exists public.player_cosmetics (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  cosmetic_id  text not null references public.cosmetics (id) on delete cascade,
  price_paid   bigint not null default 0,
  bought_at    timestamptz not null default now(),
  primary key (user_id, cosmetic_id)
);

alter table public.cosmetics        enable row level security;
alter table public.player_cosmetics enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.cosmetics, public.player_cosmetics from anon, authenticated;
grant select on public.cosmetics, public.player_cosmetics to authenticated;
drop policy if exists "cosmetics readable" on public.cosmetics;
create policy "cosmetics readable" on public.cosmetics for select to authenticated using (true);
drop policy if exists "owners read their cosmetics" on public.player_cosmetics;
create policy "owners read their cosmetics" on public.player_cosmetics for select to authenticated using (user_id = auth.uid());

insert into public.cosmetics (id, kind, price, tier) values
  ('frame-steel', 'frame', 5000, 1),
  ('frame-chip', 'frame', 7500, 1),
  ('frame-gold', 'frame', 15000, 2),
  ('frame-neon', 'frame', 20000, 2),
  ('frame-ruby', 'frame', 40000, 3),
  ('frame-storm', 'frame', 50000, 3),
  ('frame-diamond', 'frame', 100000, 4),
  ('frame-prism', 'frame', 125000, 4),
  ('frame-mythic', 'frame', 250000, 5),
  ('frame-celestial', 'frame', 300000, 5),
  ('bg-felt', 'backdrop', 3000, 1),
  ('bg-blackjack', 'backdrop', 4000, 1),
  ('bg-sunset', 'backdrop', 8000, 2),
  ('bg-city', 'backdrop', 10000, 2),
  ('bg-ocean', 'backdrop', 20000, 3),
  ('bg-storm', 'backdrop', 25000, 3),
  ('bg-velvet', 'backdrop', 50000, 4),
  ('bg-jackpot', 'backdrop', 60000, 4),
  ('bg-galaxy', 'backdrop', 120000, 5),
  ('bg-aurora', 'backdrop', 150000, 5)
on conflict (id) do update set kind = excluded.kind, price = excluded.price, tier = excluded.tier;

-- Buy an item with wallet chips (chips seated at tables can't be spent) and equip it.
create or replace function public.buy_cosmetic(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.cosmetics;
  v_p public.profiles;
  v_unlocked text[];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_item from public.cosmetics where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_p from public.profiles where id = v_uid for update;
  if not found then raise exception 'profile_missing'; end if;
  if exists (select 1 from public.player_cosmetics where user_id = v_uid and cosmetic_id = p_id) then
    return jsonb_build_object('ok', false, 'reason', 'owned', 'chips', v_p.chips);
  end if;
  if v_p.chips < v_item.price then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_chips', 'chips', v_p.chips);
  end if;
  insert into public.player_cosmetics (user_id, cosmetic_id, price_paid) values (v_uid, p_id, v_item.price);
  update public.profiles
     set chips = chips - v_item.price,
         frame = case when v_item.kind = 'frame' then p_id else frame end,
         backdrop = case when v_item.kind = 'backdrop' then p_id else backdrop end,
         updated_at = now()
   where id = v_uid;
  v_unlocked := public.bump_counters(v_uid, jsonb_build_object('cosmetics_bought', 1), '{}'::jsonb);
  select * into v_p from public.profiles where id = v_uid;
  return jsonb_build_object('ok', true, 'chips', v_p.chips, 'frame', v_p.frame, 'backdrop', v_p.backdrop,
    'unlocked', to_jsonb(coalesce(v_unlocked, '{}')));
end;
$$;

-- Equip an owned item, or pass null to go back to the default look.
create or replace function public.equip_cosmetic(p_kind text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('frame', 'backdrop') then raise exception 'Invalid slot'; end if;
  if p_id is not null and not exists (
    select 1 from public.player_cosmetics pc join public.cosmetics c on c.id = pc.cosmetic_id
     where pc.user_id = v_uid and pc.cosmetic_id = p_id and c.kind = p_kind
  ) then
    raise exception 'You do not own that item';
  end if;
  update public.profiles
     set frame = case when p_kind = 'frame' then p_id else frame end,
         backdrop = case when p_kind = 'backdrop' then p_id else backdrop end,
         updated_at = now()
   where id = v_uid
  returning * into v_p;
  return jsonb_build_object('ok', true, 'frame', v_p.frame, 'backdrop', v_p.backdrop);
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------

revoke execute on function public.create_table(text, text, uuid, jsonb, jsonb, jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function public.load_table(text) from public, anon, authenticated;
revoke execute on function public.commit_table(text, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, integer) from public, anon, authenticated;
revoke execute on function public.cleanup_stale_data() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_updated() from public, anon, authenticated;
revoke execute on function public.chat_before_insert() from public, anon, authenticated;

grant execute on function public.create_table(text, text, uuid, jsonb, jsonb, jsonb, text, boolean) to service_role;
grant execute on function public.load_table(text) to service_role;
grant execute on function public.commit_table(text, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, integer) to service_role;
grant execute on function public.cleanup_stale_data() to service_role;

-- Internal helpers: never callable from the browser.
revoke execute on function public.hash_id(text) from public, anon, authenticated;
revoke execute on function public.device_hash(text) from public, anon, authenticated;
revoke execute on function public.link_device(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.accounts_linked(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.raise_flag(text, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.grant_achievements(uuid) from public, anon, authenticated;
revoke execute on function public.bump_counters(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.record_hands(jsonb) from public, anon, authenticated;
revoke execute on function public.request_ip() from public, anon;
grant execute on function public.record_hands(jsonb) to service_role;

-- Player-facing RPCs added with legal, anti-abuse, achievements and the shop.
revoke execute on function public.touch_device(text) from public, anon;
revoke execute on function public.accept_terms(text, boolean) from public, anon;
revoke execute on function public.buy_cosmetic(text) from public, anon;
revoke execute on function public.equip_cosmetic(text, text) from public, anon;
grant execute on function public.touch_device(text) to authenticated;
grant execute on function public.accept_terms(text, boolean) to authenticated;
grant execute on function public.buy_cosmetic(text) to authenticated;
grant execute on function public.equip_cosmetic(text, text) to authenticated;

revoke execute on function public.update_profile(text, text, text) from public, anon;
revoke execute on function public.mark_changelog_seen(text) from public, anon;
grant execute on function public.mark_changelog_seen(text) to authenticated;
revoke execute on function public.claim_daily_bonus(text) from public, anon;
revoke execute on function public.emergency_reload(text) from public, anon;
revoke execute on function public.my_tables() from public, anon;
revoke execute on function public.list_open_tables() from public, anon;
revoke execute on function public.leaderboard() from public, anon;
revoke execute on function public.room_preview(text) from public, anon;
revoke execute on function public.join_room(text, text) from public, anon;
revoke execute on function public.is_table_member(text) from public, anon;

grant execute on function public.update_profile(text, text, text) to authenticated;
grant execute on function public.claim_daily_bonus(text) to authenticated;
grant execute on function public.emergency_reload(text) to authenticated;
grant execute on function public.my_tables() to authenticated;
grant execute on function public.list_open_tables() to authenticated;
grant execute on function public.leaderboard() to authenticated;
grant execute on function public.room_preview(text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.is_table_member(text) to authenticated;
grant execute on function public.server_time() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: stream table state, private cards, chat and profile balances
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['tables', 'player_cards', 'chat_messages', 'profiles', 'player_achievements'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Backfill profiles for any users created before this schema was installed.
insert into public.profiles (id, display_name)
select u.id, left(coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(u.email, 'Player'), '@', 1)), 20)
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id);

-- Re-sync the guest flag from Supabase Auth for every existing account, so all
-- guest (anonymous) accounts are kept off the leaderboard and upgraded guests
-- (who added an email + password) are shown.
update public.profiles p
   set is_guest = coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false)
  from auth.users u
 where u.id = p.id
   and p.is_guest is distinct from coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false);

-- Portraits replace the old emoji avatars: each emoji maps to a fixed portrait
-- (the same mapping the app uses for old chat messages; see shared/portraits.ts).
update public.profiles p
   set avatar = (public.portrait_ids())[((array_position(array[
         '🦊','🐺','🦁','🐯','🐼','🐸','🐙','🦄','🐲','🦈','🦉','🐻','🐵','🐧','🦝','🐨',
         '👽','🤖','👑','🎩','💎','🔥','⚡','🍀','🎲','🃏','🚀','🌙','😎','🤠','🥷','🧙','👻'],
         replace(p.avatar, chr(65039), '')) - 1) % 50) + 1]
 where not (p.avatar = any (public.portrait_ids()))
   and array_position(array[
         '🦊','🐺','🦁','🐯','🐼','🐸','🐙','🦄','🐲','🦈','🦉','🐻','🐵','🐧','🦝','🐨',
         '👽','🤖','👑','🎩','💎','🔥','⚡','🍀','🎲','🃏','🚀','🌙','😎','🤠','🥷','🧙','👻'],
         replace(p.avatar, chr(65039), '')) is not null;
update public.profiles
   set avatar = 'p01'
 where not (avatar = any (public.portrait_ids()));
