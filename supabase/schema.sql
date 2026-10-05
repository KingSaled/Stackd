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
  v_avatars text[] := array['🦊','🐺','🦁','🐯','🐼','🐸','🐙','🦄','🐲','🦈','🦉','🐻'];
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
  if p_avatar is null or char_length(p_avatar) < 1 or char_length(p_avatar) > 8 then
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

create or replace function public.claim_daily_bonus()
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
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_p from public.profiles where id = v_uid for update;
  if not found then raise exception 'profile_missing'; end if;
  if v_p.last_daily_claim is not null and v_p.last_daily_claim > now() - interval '24 hours' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'cooldown',
      'next_claim_at', v_p.last_daily_claim + interval '24 hours',
      'chips', v_p.chips,
      'streak', v_p.daily_streak);
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
  return jsonb_build_object(
    'ok', true,
    'amount', v_amount,
    'streak', v_streak,
    'chips', v_p.chips,
    'next_claim_at', v_p.last_daily_claim + interval '24 hours');
end;
$$;

create or replace function public.emergency_reload()
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
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_p from public.profiles where id = v_uid for update;
  if not found then raise exception 'profile_missing'; end if;
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
  v_amount := 2500 - v_total;
  update public.profiles
     set chips = chips + v_amount, last_reload_at = now(), reload_count = reload_count + 1, updated_at = now()
   where id = v_uid
  returning * into v_p;
  return jsonb_build_object(
    'ok', true,
    'amount', v_amount,
    'chips', v_p.chips,
    'next_reload_at', v_p.last_reload_at + interval '60 minutes');
end;
$$;

-- Chips currently sitting on tables for the caller (for broke checks in the UI).
create or replace function public.my_tables()
returns table (table_id text, name text, seat smallint, stack bigint, big_blind bigint, small_blind bigint, player_count integer, max_seats integer, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, s.seat, s.stack,
         (t.config ->> 'bigBlind')::bigint, (t.config ->> 'smallBlind')::bigint,
         t.player_count, (t.config ->> 'maxSeats')::int, t.updated_at
    from public.table_seats s
    join public.tables t on t.id = s.table_id
   where s.user_id = auth.uid()
   order by t.updated_at desc;
$$;

create or replace function public.list_open_tables()
returns table (id text, name text, small_blind bigint, big_blind bigint, max_seats integer, min_buy_in bigint, max_buy_in bigint, player_count integer, status text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name,
         (t.config ->> 'smallBlind')::bigint, (t.config ->> 'bigBlind')::bigint, (t.config ->> 'maxSeats')::int,
         (t.config ->> 'minBuyIn')::bigint, (t.config ->> 'maxBuyIn')::bigint,
         t.player_count, t.status, t.updated_at
    from public.tables t
   where t.listed and not t.has_password and t.updated_at > now() - interval '2 days'
   order by t.player_count desc, t.updated_at desc
   limit 40;
$$;

create or replace function public.leaderboard()
returns table (id uuid, display_name text, avatar text, color text, total_chips bigint, hands_played integer, hands_won integer, biggest_pot bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar, p.color,
         p.chips + coalesce((select sum(s.stack) from public.table_seats s where s.user_id = p.id), 0) as total_chips,
         p.hands_played, p.hands_won, p.biggest_pot
    from public.profiles p
   where p.hands_played > 0 or p.chips <> 10000
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
  p_password text, p_listed boolean)
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
  values (p_id, p_name, p_host, p_config, v_hash is not null, coalesce(p_listed, false) and v_hash is null, p_state, 1);
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
  r record;
begin
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
begin
  delete from public.tables
   where player_count = 0 and updated_at < now() - interval '24 hours';
  get diagnostics v_tables = row_count;
  delete from public.chat_messages where created_at < now() - interval '3 days';
  get diagnostics v_chat = row_count;
  delete from public.room_join_failures where last_failed_at < now() - interval '1 day';
  return jsonb_build_object('tables_deleted', v_tables, 'chat_deleted', v_chat);
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

revoke execute on function public.update_profile(text, text, text) from public, anon;
revoke execute on function public.claim_daily_bonus() from public, anon;
revoke execute on function public.emergency_reload() from public, anon;
revoke execute on function public.my_tables() from public, anon;
revoke execute on function public.list_open_tables() from public, anon;
revoke execute on function public.leaderboard() from public, anon;
revoke execute on function public.room_preview(text) from public, anon;
revoke execute on function public.join_room(text, text) from public, anon;
revoke execute on function public.is_table_member(text) from public, anon;

grant execute on function public.update_profile(text, text, text) to authenticated;
grant execute on function public.claim_daily_bonus() to authenticated;
grant execute on function public.emergency_reload() to authenticated;
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
  foreach t in array array['tables', 'player_cards', 'chat_messages', 'profiles'] loop
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
