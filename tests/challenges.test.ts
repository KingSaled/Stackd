/**
 * Daily and weekly challenges against the real schema in an in-process Postgres:
 * the catalog, the 08:00 UTC rollover, progress from poker hands and blackjack rounds,
 * claiming (once, with the sweep bonus) and the abuse limits.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createDb } from './pglite';
import { CHALLENGES, SLOT_ORDER } from '../shared/challenges';

const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b1';
const C = '00000000-0000-0000-0000-0000000000c1';
const D = '00000000-0000-0000-0000-0000000000d1';
const DEV = 'device-aaaaaaaaaaaaaaaa';

let db: PGlite;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); select set_config('request.headers', '', false);`);
  await db.exec(user ? 'set role authenticated' : 'set role service_role');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

const chipsOf = async (id: string) => Number((await db.query<{ chips: string }>('select chips from public.profiles where id = $1', [id])).rows[0].chips);

interface Row {
  id: string;
  period: string;
  slot: string;
  target: string;
  reward: string;
  progress: string;
  claimed: boolean;
}
const mine = (user: string) => as<Row>(user, 'select * from public.my_challenges()');
const progressOf = async (user: string, id: string) => Number((await mine(user)).find((r) => r.id === id)?.progress ?? -1);

const poker = (user: string, won: number, extra: object = {}) =>
  JSON.stringify([
    { hand_no: 1, big_blind: 50, uncontested: false, bots: 0, humans: 1, transfers: [], players: [{ user_id: user, won, net: won, committed: 0, start: 1000, category: -1, allin: false, vpip: true, pfr: false, ...extra }] },
  ]);

const bjRounds = (user: string, hands: number, wins: number, extra: object = {}) =>
  JSON.stringify([{ table_id: 'T', round_no: 1, players: [{ user_id: user, hands, wins, blackjacks: 0, pushes: 0, double_wins: 0, splits: 0, wagered: hands * 10, net: 0, ...extra }] }]);

const claim = (user: string, id: string, device: string | null = null) =>
  as<{ r: { ok: boolean; reason?: string; amount?: number; chips?: number } }>(user, 'select public.claim_challenge($1, $2) as r', [id, device]).then((x) => x[0].r);

beforeAll(async () => {
  db = await createDb();
  for (const [id, name] of [[A, 'Ann'], [B, 'Ben'], [C, 'Cy'], [D, 'Di']])
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name}@example.com`, JSON.stringify({ display_name: name })]);
}, 120_000);

describe('challenge catalog', () => {
  it('matches shared/challenges.ts', async () => {
    const rows = (await db.query<Record<string, string>>('select * from public.challenges order by id')).rows;
    expect(rows.map((r) => ({ id: r.id, period: r.period, slot: r.slot, counter: r.counter, target: Number(r.target), reward: Number(r.reward) }))).toEqual(
      CHALLENGES.map((c) => ({ id: c.id, period: c.period, slot: c.slot, counter: c.counter, target: c.target, reward: c.reward })).sort((x, y) => (x.id < y.id ? -1 : 1)),
    );
  });

  it('has several choices for every slot, and one bonus per period', () => {
    for (const period of ['daily', 'weekly'] as const)
      for (const slot of SLOT_ORDER) {
        const n = CHALLENGES.filter((c) => c.period === period && c.slot === slot).length;
        expect(n, `${period} ${slot}`).toBeGreaterThanOrEqual(slot === 'bonus' ? 1 : 3);
        if (slot === 'bonus') expect(n).toBe(1);
      }
  });

  it('keeps rewards sensible: harder challenges pay more, and weekly ones pay more than daily ones', () => {
    const max = (period: string) => Math.max(...CHALLENGES.filter((c) => c.period === period && c.slot !== 'bonus').map((c) => c.reward));
    const min = (period: string) => Math.min(...CHALLENGES.filter((c) => c.period === period && c.slot !== 'bonus').map((c) => c.reward));
    expect(min('weekly')).toBeGreaterThan(max('daily'));
  });
});

describe('periods', () => {
  const key = async (period: string, at: string) =>
    (await db.query<{ k: string }>(`select public.challenge_period_key($1, $2::timestamptz) as k`, [period, at])).rows[0].k;

  it('rolls days over at 08:00 UTC', async () => {
    expect(await key('daily', '2026-10-08T07:59:59Z')).toBe('d:2026-10-07');
    expect(await key('daily', '2026-10-08T08:00:00Z')).toBe('d:2026-10-08');
    expect(await key('daily', '2026-10-08T23:30:00Z')).toBe('d:2026-10-08');
    expect(await key('daily', '2026-10-09T07:59:00Z')).toBe('d:2026-10-08');
  });

  it('starts weeks on Monday at 08:00 UTC', async () => {
    expect(await key('weekly', '2026-10-05T08:00:00Z')).toBe('w:2026-10-05');
    expect(await key('weekly', '2026-10-11T23:59:00Z')).toBe('w:2026-10-05');
    expect(await key('weekly', '2026-10-12T07:59:59Z')).toBe('w:2026-10-05');
    expect(await key('weekly', '2026-10-12T08:00:00Z')).toBe('w:2026-10-12');
    expect(await key('weekly', '2026-10-04T12:00:00Z')).toBe('w:2026-09-28');
    const [{ e }] = (await db.query<{ e: string }>(`select to_char(public.challenge_period_end('daily', '2026-10-08T12:00:00Z') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI') as e`)).rows;
    expect(e).toBe('2026-10-09T08:00');
  });

  it('gives everyone the same three challenges plus a bonus, in each period', async () => {
    const rows = (await db.query<{ id: string; period: string; slot: string }>(`select id, period, slot from public.active_challenges('2026-10-08T12:00:00Z')`)).rows;
    expect(rows).toHaveLength(8);
    for (const period of ['daily', 'weekly']) expect(rows.filter((r) => r.period === period).map((r) => r.slot).sort()).toEqual(['any', 'blackjack', 'bonus', 'poker']);
    const again = (await db.query<{ id: string }>(`select id from public.active_challenges('2026-10-08T20:00:00Z')`)).rows;
    expect(again.map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it('rotates through the pool over time', async () => {
    const seen = new Set<string>();
    for (let d = 0; d < 60; d++) {
      const at = new Date(Date.UTC(2026, 9, 1 + d, 12)).toISOString();
      for (const r of (await db.query<{ id: string }>(`select id from public.active_challenges($1::timestamptz) where period = 'daily'`, [at])).rows) seen.add(r.id);
    }
    expect(seen.size).toBe(CHALLENGES.filter((c) => c.period === 'daily').length);
  });
});

describe('progress and claiming', () => {
  beforeAll(async () => {
    // Pin the pool so the picks are the same every day this test runs.
    const keep = ['d_poker_hands', 'd_bj_wins', 'd_any_play', 'd_sweep', 'w_poker_wins', 'w_bj_hands', 'w_any_dedicated', 'w_sweep'];
    await db.query('delete from public.challenges where id <> all ($1)', [keep]);
    await db.query(`update public.challenges set target = 3 where id = 'd_poker_hands'`);
  });

  it('shows every challenge at zero to start', async () => {
    const rows = await mine(A);
    expect(rows.map((r) => r.id)).toEqual(['d_poker_hands', 'd_bj_wins', 'd_any_play', 'd_sweep', 'w_poker_wins', 'w_bj_hands', 'w_any_dedicated', 'w_sweep']);
    expect(rows.every((r) => Number(r.progress) === 0 && !r.claimed)).toBe(true);
  });

  it('counts poker hands towards poker and either-game challenges', async () => {
    await as(null, 'select public.record_hands($1)', [poker(A, 400)]);
    expect(await progressOf(A, 'd_poker_hands')).toBe(1);
    expect(await progressOf(A, 'd_any_play')).toBe(1);
    expect(await progressOf(A, 'w_poker_wins')).toBe(1);
    expect(await progressOf(A, 'd_bj_wins')).toBe(0);
    // A lost hand adds to hands played but not to wins.
    await as(null, 'select public.record_hands($1)', [poker(A, 0)]);
    expect(await progressOf(A, 'd_poker_hands')).toBe(2);
    expect(await progressOf(A, 'w_poker_wins')).toBe(1);
  });

  it('does not let a player collect before finishing, then pays exactly once', async () => {
    expect((await claim(A, 'd_poker_hands')).reason).toBe('incomplete');
    await as(null, 'select public.record_hands($1)', [poker(A, 0)]);
    await as(null, 'select public.record_hands($1)', [poker(A, 0)]);
    expect(await progressOf(A, 'd_poker_hands')).toBe(3); // capped at the target
    const before = await chipsOf(A);
    const r = await claim(A, 'd_poker_hands');
    expect(r).toMatchObject({ ok: true, amount: 1000 });
    expect(await chipsOf(A)).toBe(before + 1000);
    expect((await claim(A, 'd_poker_hands')).reason).toBe('claimed');
    expect(await chipsOf(A)).toBe(before + 1000);
    expect((await mine(A)).find((x) => x.id === 'd_poker_hands')?.claimed).toBe(true);
  });

  it('refuses challenges that are not in play', async () => {
    expect((await claim(A, 'd_poker_showdown')).reason).toBe('expired');
    expect((await claim(A, 'no-such-challenge')).reason).toBe('expired');
  });

  it('counts blackjack rounds, and pays the daily sweep after all three are claimed', async () => {
    await as(null, 'select public.record_bj_rounds($1)', [bjRounds(B, 3, 2)]);
    await as(null, 'select public.record_bj_rounds($1)', [bjRounds(B, 4, 4)]);
    expect(await progressOf(B, 'd_bj_wins')).toBe(5);
    expect(await progressOf(B, 'w_bj_hands')).toBe(7);
    expect(await progressOf(B, 'd_any_play')).toBe(7);
    // 7 plays so far; poker hands bring it to the target of 20 and the poker target of 3.
    for (let i = 0; i < 13; i++) await as(null, 'select public.record_hands($1)', [poker(B, 0)]);
    expect(await progressOf(B, 'd_any_play')).toBe(20);
    expect(await progressOf(B, 'd_poker_hands')).toBe(3);

    expect((await claim(B, 'd_sweep')).reason).toBe('incomplete');
    const before = await chipsOf(B);
    for (const id of ['d_poker_hands', 'd_bj_wins', 'd_any_play']) expect((await claim(B, id)).ok, id).toBe(true);
    expect(await progressOf(B, 'd_sweep')).toBe(3);
    expect((await claim(B, 'd_sweep')).amount).toBe(1000);
    // 1,000 + 1,500 + 1,000 for the three, plus 1,000 for the sweep (the pinned pool keeps the original rewards).
    expect(await chipsOf(B)).toBe(before + 1000 + 1500 + 1000 + 1000);
    // Claimed dailies count towards the weekly "claim daily challenges" goal; the sweep itself does not.
    expect(await progressOf(B, 'w_any_dedicated')).toBe(3);
  });

  it('starts every period from zero', async () => {
    // Progress recorded under an old day or week is not shown today.
    await db.query(
      `insert into public.challenge_progress (user_id, challenge_id, period_key, progress) values ($1, 'd_poker_hands', 'd:2020-01-01', 3), ($1, 'w_poker_wins', 'w:2020-01-06', 25)`,
      [C],
    );
    expect(await progressOf(C, 'd_poker_hands')).toBe(0);
    expect(await progressOf(C, 'w_poker_wins')).toBe(0);
  });

  it('feeds the weekly daily-bonus challenge from the daily bonus', async () => {
    await db.query(`insert into public.challenges (id, period, slot, counter, target, reward) values ('w_any_daily', 'weekly', 'any', 'daily_claims', 5, 5000)`);
    await db.query(`delete from public.challenges where id = 'w_any_dedicated'`);
    await as(D, `select public.claim_daily_bonus('device-d-00000000000001')`);
    expect(await progressOf(D, 'w_any_daily')).toBe(1);
    await db.query(`delete from public.challenges where id = 'w_any_daily'`);
    await db.query(`insert into public.challenges (id, period, slot, counter, target, reward) values ('w_any_dedicated', 'weekly', 'any', 'daily_challenges', 6, 6000)`);
  });

  it('limits rewards per device like the other bonuses', async () => {
    // A, B and C all finish and claim the same daily from one device: the third account is turned away.
    await db.query(`update public.challenges set target = 1 where id = 'd_poker_hands'`);
    const lines = [A, B, C];
    // A and B already claimed it today; use a fresh challenge for the device test.
    await db.query(`insert into public.challenges (id, period, slot, counter, target, reward) values ('d_poker_wins', 'daily', 'poker', 'wins', 1, 1500)`);
    await db.query(`delete from public.challenges where id = 'd_poker_hands'`);
    for (const u of lines) await as(null, 'select public.record_hands($1)', [poker(u, 100)]);
    expect((await claim(A, 'd_poker_wins', DEV)).ok).toBe(true);
    expect((await claim(B, 'd_poker_wins', DEV)).ok).toBe(true);
    const third = await claim(C, 'd_poker_wins', DEV);
    expect(third).toMatchObject({ ok: false, reason: 'device_limit' });
    const flags = await db.query(`select 1 from public.abuse_flags where kind = 'device_bonus_limit' and user_id = $1`, [C]);
    expect(flags.rows).toHaveLength(1);
    // From another device the same account can still collect.
    expect((await claim(C, 'd_poker_wins', 'device-other-0000000001')).ok).toBe(true);
  });

  it('is invisible to other players and cannot be edited from the browser', async () => {
    expect((await as(A, 'select * from public.challenge_progress')).every((r) => (r as { user_id: string }).user_id === A)).toBe(true);
    await expect(as(A, `update public.challenge_progress set progress = 99999 where user_id = $1`, [A])).rejects.toThrow(/permission/);
    await expect(as(A, `insert into public.challenge_progress (user_id, challenge_id, period_key, progress) values ($1, 'd_sweep', 'x', 1)`, [A])).rejects.toThrow(/permission/);
    await expect(as(A, `select public.advance_challenges($1, '{"hands": 100}')`, [A])).rejects.toThrow(/permission/);
    await expect(as(A, `select public.record_bj_rounds('[]')`)).rejects.toThrow(/permission/);
    await expect(as(A, `update public.challenges set reward = 99999999`)).rejects.toThrow(/permission/);
  });

  it('clears old progress in the hourly cleanup', async () => {
    await db.query(`insert into public.challenge_progress (user_id, challenge_id, period_key, progress, updated_at) values ($1, 'd_sweep', 'd:2025-01-01', 1, now() - interval '60 days')`, [D]);
    const [{ r }] = (await as(null, 'select public.cleanup_stale_data() as r')) as { r: { challenge_rows_deleted: number } }[];
    expect(r.challenge_rows_deleted).toBeGreaterThanOrEqual(1);
  });
});
