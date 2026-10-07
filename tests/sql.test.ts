/**
 * Runs supabase/schema.sql against an in-process Postgres (PGlite) with minimal
 * stand-ins for the Supabase `auth` schema and roles, then exercises the RPCs,
 * RLS policies and the atomic commit function.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createDb, schemaSql } from './pglite';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');


const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';

let db: PGlite;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  await db.exec(user ? 'set role authenticated' : 'set role service_role');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

function emptyState() {
  return JSON.stringify({ v: 1, seats: [null, null], phase: 'waiting' });
}

beforeAll(async () => {
  db = await createDb();
  // Running the schema twice must be safe (idempotent upgrades).
  await db.exec(schema);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'alice@example.com', '{"display_name":"Alice"}')`, [A]);
  await db.query(`insert into auth.users (id, email) values ($1, 'bob@example.com')`, [B]);
  await db.query(`insert into auth.users (id, is_anonymous) values ($1, true)`, [C]);
}, 120_000);

describe('schema', () => {
  it('creates profiles with starting chips for new users (including guests)', async () => {
    const rows = await db.query<{ id: string; display_name: string; chips: string; is_guest: boolean }>(
      'select id, display_name, chips, is_guest from public.profiles order by id',
    );
    expect(rows.rows.map((r) => r.display_name)).toEqual(['Alice', 'bob', expect.stringMatching(/^Guest [0-9A-F]{4}$/)]);
    expect(rows.rows.every((r) => Number(r.chips) === 10000)).toBe(true);
    expect(rows.rows[2].is_guest).toBe(true);
  });

  it('backfills the guest flag from auth when the schema is re-run', async () => {
    const X = '00000000-0000-0000-0000-0000000000e1';
    await db.query(`insert into auth.users (id, is_anonymous) values ($1, true)`, [X]);
    await db.query('update public.profiles set is_guest = false where id = $1', [X]);
    await db.exec(schemaSql);
    const r = await db.query<{ is_guest: boolean }>('select is_guest from public.profiles where id = $1', [X]);
    expect(r.rows[0].is_guest).toBe(true);
  });

  it('upgrades a guest when the auth user becomes permanent', async () => {
    await db.query('update auth.users set is_anonymous = false, email = $2 where id = $1', [C, 'carol@example.com']);
    const r = await db.query<{ is_guest: boolean }>('select is_guest from public.profiles where id = $1', [C]);
    expect(r.rows[0].is_guest).toBe(false);
  });

  it('daily bonus pays once per 24h and builds a streak', async () => {
    const [first] = await as<{ r: { ok: boolean; amount: number; chips: number } }>(A, 'select public.claim_daily_bonus() as r');
    expect(first.r.ok).toBe(true);
    expect(first.r.amount).toBe(2000);
    expect(first.r.chips).toBe(12000);
    const [second] = await as<{ r: { ok: boolean; reason: string } }>(A, 'select public.claim_daily_bonus() as r');
    expect(second.r).toMatchObject({ ok: false, reason: 'cooldown' });
    // Pretend the last claim was 30 hours ago → streak continues.
    await db.query(`update public.profiles set last_daily_claim = now() - interval '30 hours' where id = $1`, [A]);
    const [third] = await as<{ r: { ok: boolean; amount: number; streak: number } }>(A, 'select public.claim_daily_bonus() as r');
    expect(third.r).toMatchObject({ ok: true, amount: 2500, streak: 2 });
  });

  it('emergency reload only when broke and respects the cooldown', async () => {
    const [notBroke] = await as<{ r: { ok: boolean; reason: string } }>(B, 'select public.emergency_reload() as r');
    expect(notBroke.r).toMatchObject({ ok: false, reason: 'not_broke' });
    await db.query('update public.profiles set chips = 120 where id = $1', [B]);
    const [ok] = await as<{ r: { ok: boolean; amount: number; chips: number } }>(B, 'select public.emergency_reload() as r');
    expect(ok.r).toMatchObject({ ok: true, amount: 2380, chips: 2500 });
    await db.query('update public.profiles set chips = 0 where id = $1', [B]);
    const [cool] = await as<{ r: { ok: boolean; reason: string } }>(B, 'select public.emergency_reload() as r');
    expect(cool.r).toMatchObject({ ok: false, reason: 'cooldown' });
    await db.query('update public.profiles set chips = 10000, last_reload_at = null where id = $1', [B]);
  });

  it('remembers which changelog a player has seen', async () => {
    await as(A, `select public.mark_changelog_seen('2026-10-06')`);
    const r = await db.query<{ v: string }>('select last_seen_changelog as v from public.profiles where id = $1', [A]);
    expect(r.rows[0].v).toBe('2026-10-06');
    await expect(as(null, `select public.mark_changelog_seen('x')`)).resolves.toBeDefined();
  });

  it('validates profile updates and blocks direct writes', async () => {
    const [row] = await as<{ display_name: string; color: string; avatar: string }>(A, `select * from public.update_profile('Alice K', 'p22', '#4DD4FF')`);
    expect(row).toMatchObject({ display_name: 'Alice K', color: '#4dd4ff', avatar: 'p22' });
    await expect(as(A, `select public.update_profile('x', 'p22', '#4dd4ff')`)).rejects.toThrow(/2-20/);
    await expect(as(A, `select public.update_profile('Alice', 'p22', 'red')`)).rejects.toThrow(/color/);
    // Only portraits from the catalogue are accepted now (old emoji avatars were migrated).
    await expect(as(A, `select public.update_profile('Alice', '🐼', '#4dd4ff')`)).rejects.toThrow(/avatar/);
    await expect(as(A, `select public.update_profile('Alice', 'p02', '#4dd4ff')`)).rejects.toThrow(/avatar/);
    await expect(as(A, `update public.profiles set chips = 99999999 where id = '${A}'`)).rejects.toThrow(/permission/);
  });

  it('creates password-protected rooms and gates access to them', async () => {
    await as(
      null,
      `select public.create_table('ROOM01', 'Secret', $1, '{"bigBlind":10,"smallBlind":5,"maxSeats":2,"minBuyIn":200,"maxBuyIn":1000,"turnSeconds":30}', $2, '{"deck":[],"hole":{}}', 'hunter2', true)`,
      [A, emptyState()],
    );
    await as(
      null,
      `select public.create_table('OPEN01', 'Open', $1, '{"bigBlind":10,"smallBlind":5,"maxSeats":2,"minBuyIn":200,"maxBuyIn":1000,"turnSeconds":30}', $2, '{"deck":[],"hole":{}}', null, true)`,
      [A, emptyState()],
    );
    // Password rooms are never listed publicly.
    const listed = await as<{ id: string }>(B, 'select id from public.list_open_tables()');
    // Empty tables are not shown in the lobby.
    expect(listed.map((r) => r.id)).toEqual([]);

    // Host can read, Bob cannot until he joins.
    expect(await as(A, `select id from public.tables where id = 'ROOM01'`)).toHaveLength(1);
    expect(await as(B, `select id from public.tables where id = 'ROOM01'`)).toHaveLength(0);
    await expect(as(B, `select * from public.table_secrets`)).rejects.toThrow(/permission/);

    const [preview] = await as<{ r: { has_password: boolean; is_member: boolean } }>(B, `select public.room_preview('room01') as r`);
    expect(preview.r).toMatchObject({ has_password: true, is_member: false });

    const [noPw] = await as<{ r: { error: string } }>(B, `select public.join_room('ROOM01') as r`);
    expect(noPw.r.error).toBe('password_required');
    const [wrong] = await as<{ r: { error: string } }>(B, `select public.join_room('ROOM01', 'nope') as r`);
    expect(wrong.r.error).toBe('wrong_password');
    const [right] = await as<{ r: { ok: boolean } }>(B, `select public.join_room('room01', 'hunter2') as r`);
    expect(right.r.ok).toBe(true);
    expect(await as(B, `select id from public.tables where id = 'ROOM01'`)).toHaveLength(1);

    // Throttling after repeated failures.
    for (let i = 0; i < 5; i++) await as(C, `select public.join_room('ROOM01', 'bad${i}')`);
    const [locked] = await as<{ r: { error: string } }>(C, `select public.join_room('ROOM01', 'hunter2') as r`);
    expect(locked.r.error).toBe('too_many_attempts');

    // Clients cannot call service functions.
    await expect(as(B, `select public.load_table('ROOM01')`)).rejects.toThrow(/permission/);
  });

  it('commits state atomically with optimistic concurrency and wallet checks', async () => {
    const [{ r: loaded }] = await as<{ r: { version: number } }>(null, `select public.load_table('OPEN01') as r`);
    expect(loaded.version).toBe(1);
    const commit = (version: number, wallet: unknown[], seats: unknown[], cards: unknown[] | null) =>
      as<{ v: number }>(
        null,
        `select public.commit_table('OPEN01', $1, $2, '{"deck":["As"],"hole":{}}', $3, $4, $5, $6, 'playing', $7) as v`,
        [
          version,
          JSON.stringify({ v: 1, seats: [], phase: 'preflop', handNo: version }),
          JSON.stringify(seats),
          cards ? JSON.stringify(cards) : null,
          JSON.stringify(wallet),
          JSON.stringify([{ user_id: A, played: 1, won: 1, biggest_pot: 640, best_hand: 3 }]),
          seats.length,
        ],
      );

    const [ok] = await commit(
      1,
      [
        { user_id: A, delta: -1000 },
        { user_id: B, delta: -500 },
      ],
      [
        { user_id: A, seat: 0, stack: 1000 },
        { user_id: B, seat: 1, stack: 500 },
      ],
      [
        { user_id: A, hand_no: 1, seat: 0, cards: ['Ah', 'Kd'] },
        { user_id: B, hand_no: 1, seat: 1, cards: ['2c', '2d'] },
      ],
    );
    expect(ok.v).toBe(2);

    // Stale version → conflict, nothing applied.
    await expect(commit(1, [{ user_id: A, delta: -1 }], [], null)).rejects.toThrow(/version_conflict/);

    // Buy-in larger than the wallet → rollback of the whole commit.
    const before = await db.query<{ chips: string }>('select chips from public.profiles where id = $1', [B]);
    await expect(commit(2, [{ user_id: B, delta: -1_000_000 }], [], null)).rejects.toThrow(/insufficient_chips/);
    const after = await db.query<{ chips: string }>('select chips from public.profiles where id = $1', [B]);
    expect(after.rows[0].chips).toBe(before.rows[0].chips);
    const [{ r: still }] = await as<{ r: { version: number } }>(null, `select public.load_table('OPEN01') as r`);
    expect(still.version).toBe(2);

    // Players only see their own hole cards.
    const aliceCards = await as<{ user_id: string; cards: string[] }>(A, `select user_id, cards from public.player_cards`);
    expect(aliceCards).toEqual([{ user_id: A, cards: ['Ah', 'Kd'] }]);

    // Stats were applied, seats projected, members added.
    const prof = await db.query<{ hands_played: number; biggest_pot: string; best_hand: number }>(
      'select hands_played, biggest_pot, best_hand from public.profiles where id = $1',
      [A],
    );
    expect(prof.rows[0]).toMatchObject({ hands_played: 1, best_hand: 3 });
    expect(Number(prof.rows[0].biggest_pot)).toBe(640);
    const mine = await as<{ table_id: string; stack: string }>(B, `select table_id, stack from public.my_tables()`);
    expect(mine).toEqual([{ table_id: 'OPEN01', stack: '500' }].map((x) => ({ ...x, stack: expect.anything() })));

    // Chips sitting on a table count toward the broke check (600 wallet + 500 seated).
    await db.query('update public.profiles set chips = 600 where id = $1', [B]);
    const [reload] = await as<{ r: { ok: boolean; reason: string } }>(B, 'select public.emergency_reload() as r');
    expect(reload.r).toMatchObject({ ok: false, reason: 'not_broke' });
    // 100 wallet + 500 seated = 600 → topped up to 2,500 total.
    await db.query('update public.profiles set chips = 100 where id = $1', [B]);
    const [reload2] = await as<{ r: { ok: boolean; amount: number } }>(B, 'select public.emergency_reload() as r');
    expect(reload2.r).toMatchObject({ ok: true, amount: 1900 });
    await db.query('update public.profiles set chips = 10000 where id = $1', [B]);
  });

  it('chat: members only, identity stamped server-side, throttled', async () => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${B}', false); set role authenticated;`);
    try {
      const res = await db.query<{ name: string; user_id: string }>(
        `insert into public.chat_messages (table_id, kind, body) values ('OPEN01', 'chat', '  hello  ') returning name, user_id, body`,
      );
      expect(res.rows[0]).toMatchObject({ user_id: B, name: 'bob', body: 'hello' });
    } finally {
      await db.exec('reset role');
    }
    // Carol is not a member of OPEN01.
    await expect(as(C, `insert into public.chat_messages (table_id, kind, body) values ('OPEN01', 'chat', 'hi')`)).rejects.toThrow(
      /row-level security/,
    );
    // Cannot spoof identity columns.
    await expect(
      as(B, `insert into public.chat_messages (table_id, kind, body, user_id) values ('OPEN01', 'chat', 'hi', '${A}')`),
    ).rejects.toThrow(/permission/);
    // Rate limit.
    let error: unknown = null;
    for (let i = 0; i < 10; i++) {
      try {
        await as(B, `insert into public.chat_messages (table_id, kind, body) values ('OPEN01', 'chat', 'spam ${i}')`);
      } catch (e) {
        error = e;
        break;
      }
    }
    expect(String(error)).toMatch(/too quickly/);
    const visible = await as(A, `select id from public.chat_messages where table_id = 'OPEN01'`);
    expect(visible.length).toBeGreaterThan(0);
    expect(await as(C, `select id from public.chat_messages where table_id = 'OPEN01'`)).toHaveLength(0);
  });

  it('leaderboard and cleanup run', async () => {
    const G = '00000000-0000-0000-0000-0000000000d1';
    await db.query(`insert into auth.users (id, is_anonymous, raw_user_meta_data) values ($1, true, '{"display_name":"Guesty"}')`, [G]);
    await db.query('update public.profiles set chips = 999999, hands_played = 5 where id = $1', [G]);
    const board = await as<{ display_name: string }>(B, 'select display_name from public.leaderboard()');
    expect(board.length).toBeGreaterThan(0);
    // Guests never appear on the leaderboard, however many chips they have.
    expect(board.map((r) => r.display_name)).not.toContain('Guesty');
    const [res] = await as<{ r: { tables_deleted: number } }>(null, 'select public.cleanup_stale_data() as r');
    expect(res.r.tables_deleted).toBe(0);
    const [t] = await as<{ t: number }>(A, 'select public.server_time() as t');
    expect(Math.abs(Number(t.t) - Date.now())).toBeLessThan(60_000);
  });

  it('lists occupied tables and deletes a table when the last player leaves', async () => {
    const listed = await as<{ id: string }>(C, 'select id from public.list_open_tables()');
    expect(listed.map((r) => r.id)).toEqual(['OPEN01']);
    const [{ r }] = await as<{ r: { version: number } }>(null, `select public.load_table('OPEN01') as r`);
    const before = await db.query<{ chips: string }>('select chips from public.profiles where id = $1', [A]);
    await as(null, `select public.commit_table('OPEN01', $1, '{}', '{}', '[]', null, $2, '[]', 'waiting', 0)`, [
      r.version,
      JSON.stringify([{ user_id: A, delta: 1000 }]),
    ]);
    expect(await db.query(`select id from public.tables where id = 'OPEN01'`).then((x) => x.rows)).toHaveLength(0);
    expect(await db.query(`select 1 from public.chat_messages where table_id = 'OPEN01'`).then((x) => x.rows)).toHaveLength(0);
    const after = await db.query<{ chips: string }>('select chips from public.profiles where id = $1', [A]);
    expect(Number(after.rows[0].chips)).toBe(Number(before.rows[0].chips) + 1000);
  });

  it('lists every table without a password, whatever the old listing switch said', async () => {
    // Created with the listing switch off (as older clients did) and an older table stored as unlisted.
    await as(
      null,
      `select public.create_table('NOLIST', 'Friends', $1, '{"bigBlind":10,"smallBlind":5,"maxSeats":6,"minBuyIn":200,"maxBuyIn":1000,"turnSeconds":30}', $2, '{"deck":[],"hole":{}}', null, false)`,
      [A, emptyState()],
    );
    expect((await db.query<{ listed: boolean }>(`select listed from public.tables where id = 'NOLIST'`)).rows[0].listed).toBe(true);
    await db.query(`update public.tables set listed = false, player_count = 1 where id = 'NOLIST'`);
    const ids = (await as<{ id: string }>(C, 'select id from public.list_open_tables()')).map((r) => r.id);
    expect(ids).toContain('NOLIST');
    // Password tables stay private.
    await db.query(`update public.tables set player_count = 1 where id = 'ROOM01'`);
    expect((await as<{ id: string }>(C, 'select id from public.list_open_tables()')).map((r) => r.id)).not.toContain('ROOM01');
    await db.query(`update public.tables set player_count = 0 where id in ('NOLIST', 'ROOM01')`);
  });

  it('cleans up tables nobody ever sat at', async () => {
    await db.query(`update public.tables set updated_at = now() - interval '1 hour' where player_count = 0`);
    const [res] = await as<{ r: { tables_deleted: number } }>(null, 'select public.cleanup_stale_data() as r');
    expect(res.r.tables_deleted).toBeGreaterThan(0);
  });
});
