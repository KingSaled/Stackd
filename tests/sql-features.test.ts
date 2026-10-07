/**
 * Legal acceptance, anti-abuse (device limits, chip-transfer flags), stats
 * counters + achievements, the Cosmetic Shop and the portrait migration,
 * exercised against the real schema in an in-process Postgres.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createDb, schemaSql } from './pglite';
import { ACHIEVEMENTS } from '../shared/achievements';
import { COSMETICS } from '../shared/cosmetics';
import { LEGACY_EMOJI, PORTRAITS, portraitOf } from '../shared/portraits';

const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b1';
const G1 = '00000000-0000-0000-0000-0000000000c1';
const G2 = '00000000-0000-0000-0000-0000000000c2';
const G3 = '00000000-0000-0000-0000-0000000000c3';
const DEV = 'device-aaaaaaaaaaaaaaaa';

let db: PGlite;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = [], ip?: string) {
  const headers = ip ? JSON.stringify({ 'x-forwarded-for': `${ip}, 10.0.0.1` }) : '';
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); select set_config('request.headers', '${headers}', false);`,
  );
  await db.exec(user ? 'set role authenticated' : 'set role service_role');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

const chipsOf = async (id: string) =>
  Number((await db.query<{ chips: string }>('select chips from public.profiles where id = $1', [id])).rows[0].chips);
const counters = async (id: string) =>
  (await db.query<{ counters: Record<string, number> }>('select counters from public.player_stats where user_id = $1', [id])).rows[0]
    ?.counters ?? {};
const unlocked = async (id: string) =>
  (await db.query<{ achievement_id: string }>('select achievement_id from public.player_achievements where user_id = $1 order by 1', [id])).rows.map(
    (r) => r.achievement_id,
  );

function hand(players: object[], extra: object = {}) {
  return JSON.stringify([{ hand_no: 1, big_blind: 50, uncontested: false, bots: 0, humans: players.length, players, transfers: [], ...extra }]);
}

beforeAll(async () => {
  db = await createDb();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@example.com', '{"display_name":"Ann"}')`, [A]);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'b@example.com', '{"display_name":"Ben"}')`, [B]);
  for (const g of [G1, G2, G3]) await db.query(`insert into auth.users (id, is_anonymous) values ($1, true)`, [g]);
  // Accounts that existed for a while (only brand-new accounts count as "young" for dump checks).
  await db.query(`update public.profiles set created_at = now() - interval '60 days' where id in ($1, $2)`, [A, B]);
}, 120_000);

describe('catalogues stay in sync with the app', () => {
  it('achievements match shared/achievements.ts', async () => {
    const rows = (await db.query<{ id: string; counter: string; target: string; reward: string }>('select * from public.achievements order by id')).rows;
    expect(rows.map((r) => ({ id: r.id, counter: r.counter, target: Number(r.target), reward: Number(r.reward) }))).toEqual(
      ACHIEVEMENTS.map((a) => ({ id: a.id, counter: a.counter, target: a.target, reward: a.reward })).sort((x, y) =>
        x.id < y.id ? -1 : 1,
      ),
    );
  });

  it('shop prices match shared/cosmetics.ts', async () => {
    const rows = (await db.query<{ id: string; kind: string; price: string; tier: number }>('select * from public.cosmetics order by id')).rows;
    expect(rows.map((r) => ({ id: r.id, kind: r.kind, price: Number(r.price), tier: r.tier }))).toEqual(
      COSMETICS.map((c) => ({ id: c.id, kind: c.kind, price: c.price, tier: c.tier })).sort((x, y) => (x.id < y.id ? -1 : 1)),
    );
  });

  it('portraits match shared/portraits.ts', async () => {
    const [{ ids }] = (await db.query<{ ids: string[] }>('select public.portrait_ids() as ids')).rows;
    expect(ids).toEqual([...PORTRAITS]);
  });
});

describe('portraits', () => {
  it('new players get a portrait', async () => {
    const [{ avatar }] = (await db.query<{ avatar: string }>('select avatar from public.profiles where id = $1', [A])).rows;
    expect(PORTRAITS).toContain(avatar);
  });

  it('migrates old emoji avatars to the same portrait the app shows for them', async () => {
    for (const [i, emoji] of LEGACY_EMOJI.entries()) {
      await db.query('update public.profiles set avatar = $2 where id = $1', [B, emoji]);
      await db.exec(schemaSql);
      const [{ avatar }] = (await db.query<{ avatar: string }>('select avatar from public.profiles where id = $1', [B])).rows;
      expect(avatar, `emoji #${i}`).toBe(portraitOf(emoji));
      if (i > 3) break; // a few full re-runs are enough; the mapping itself is checked below
    }
    const mapped = await db.query<{ p: string; e: string }>(
      `select e, (public.portrait_ids())[((array_position($1::text[], e) - 1) % 50) + 1] as p from unnest($1::text[]) e`,
      [LEGACY_EMOJI],
    );
    for (const r of mapped.rows) expect(r.p).toBe(portraitOf(r.e));
  });
});

describe('terms acceptance', () => {
  it('requires the 18+ confirmation and records the version', async () => {
    await expect(as(A, `select public.accept_terms('2026-10-07', false)`)).rejects.toThrow(/18/);
    await as(A, `select public.accept_terms('2026-10-07', true)`);
    const [p] = (await db.query<{ terms_version: string; age_confirmed_at: string | null }>('select terms_version, age_confirmed_at from public.profiles where id = $1', [A])).rows;
    expect(p.terms_version).toBe('2026-10-07');
    expect(p.age_confirmed_at).not.toBeNull();
  });
});

describe('bonus protection', () => {
  it('one account cannot collect the daily bonus twice from different devices', async () => {
    const [first] = await as<{ r: { ok: boolean } }>(A, `select public.claim_daily_bonus('device-phone-000000001') as r`, [], '1.2.3.4');
    expect(first.r.ok).toBe(true);
    const [second] = await as<{ r: { ok: boolean; reason: string } }>(A, `select public.claim_daily_bonus('device-laptop-00000002') as r`, [], '5.6.7.8');
    expect(second.r).toMatchObject({ ok: false, reason: 'cooldown' });
    const [third] = await as<{ r: { ok: boolean; reason: string } }>(A, 'select public.claim_daily_bonus() as r');
    expect(third.r).toMatchObject({ ok: false, reason: 'cooldown' });
  });

  it('limits how many accounts can collect bonuses from one device', async () => {
    const a = await as<{ r: { ok: boolean } }>(G1, `select public.claim_daily_bonus($1) as r`, [DEV], '9.9.9.9');
    const b = await as<{ r: { ok: boolean } }>(G2, `select public.claim_daily_bonus($1) as r`, [DEV], '9.9.9.9');
    const c = await as<{ r: { ok: boolean; reason: string } }>(G3, `select public.claim_daily_bonus($1) as r`, [DEV], '9.9.9.9');
    expect([a[0].r.ok, b[0].r.ok, c[0].r.ok]).toEqual([true, true, false]);
    expect(c[0].r.reason).toBe('device_limit');
    const flags = await db.query<{ kind: string }>(`select kind from public.abuse_flags where user_id = $1`, [G3]);
    expect(flags.rows.map((r) => r.kind)).toContain('device_bonus_limit');

    // Emergency reloads are limited per device the same way.
    await db.query('update public.profiles set chips = 0 where id = any($1)', [[G1, G2, G3]]);
    const r1 = await as<{ r: { ok: boolean } }>(G1, `select public.emergency_reload($1) as r`, [DEV]);
    const r2 = await as<{ r: { ok: boolean } }>(G2, `select public.emergency_reload($1) as r`, [DEV]);
    const r3 = await as<{ r: { ok: boolean; reason: string } }>(G3, `select public.emergency_reload($1) as r`, [DEV]);
    expect([r1[0].r.ok, r2[0].r.ok, r3[0].r.ok]).toEqual([true, true, false]);
    expect(r3[0].r.reason).toBe('device_limit');
    // A different device still works for that account.
    const r4 = await as<{ r: { ok: boolean } }>(G3, `select public.emergency_reload('device-other-0000000003') as r`);
    expect(r4[0].r.ok).toBe(true);
  });

  it('stores devices and IPs only as hashes and links accounts that share them', async () => {
    await as(B, `select public.touch_device($1)`, [DEV], '9.9.9.9');
    const rows = await db.query<{ kind: string; hash: string }>('select kind, hash from public.device_links where user_id = $1', [B]);
    expect(rows.rows.map((r) => r.kind).sort()).toEqual(['device', 'ip']);
    for (const r of rows.rows) {
      expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.hash).not.toContain('9.9.9.9');
    }
    const [{ linked }] = (await db.query<{ linked: boolean }>('select public.accounts_linked($1, $2) as linked', [B, G1])).rows;
    expect(linked).toBe(true);
    const [{ linked: no }] = (await db.query<{ linked: boolean }>('select public.accounts_linked($1, $2) as linked', [A, G1])).rows;
    expect(no).toBe(false);
  });

  it('keeps anti-abuse data away from players', async () => {
    for (const t of ['device_links', 'bonus_claims', 'chip_transfers', 'abuse_flags', 'private_settings', 'abuse_report']) {
      await expect(as(A, `select * from public.${t}`), t).rejects.toThrow(/permission/);
    }
    await expect(as(A, `select public.record_hands('[]')`)).rejects.toThrow(/permission/);
    await expect(as(A, `select public.bump_counters($1, '{"hands": 1000}')`, [A])).rejects.toThrow(/permission/);
    await expect(as(A, `select public.hash_id('x')`)).rejects.toThrow(/permission/);
  });
});

describe('stats and achievements', () => {
  it('starts counting from launch and pays each reward once', async () => {
    // Lifetime hands from before launch do not count towards achievements.
    await db.query('update public.profiles set hands_played = 5000, hands_won = 900 where id = $1', [B]);
    const before = await chipsOf(B);
    await as(null, `select public.record_hands($1)`, [
      hand([{ user_id: B, won: 600, net: 300, committed: 300, start: 1000, category: 5, allin: false, vpip: true, pfr: true }]),
    ]);
    expect(await unlocked(B)).toEqual(['first_hand', 'first_win', 'win_flush']);
    expect(await chipsOf(B)).toBe(before + 500 + 500 + 1000);
    const c = await counters(B);
    expect(c).toMatchObject({ hands: 1, wins: 1, showdowns: 1, showdown_wins: 1, vpip_hands: 1, pfr_hands: 1, net_won: 300, biggest_win: 300, win_flush: 1 });

    // Same achievements again: no second payout.
    const mid = await chipsOf(B);
    await as(null, `select public.record_hands($1)`, [
      hand([{ user_id: B, won: 0, net: -200, committed: 200, start: 1000, category: -1, allin: false, vpip: false, pfr: false }]),
    ]);
    expect(await chipsOf(B)).toBe(mid);
    expect(await counters(B)).toMatchObject({ hands: 2, wins: 1, net_won: 100, biggest_win: 300 });
  });

  it('tracks all-ins, double-ups, big wins and premium hands', async () => {
    await as(null, `select public.record_hands($1)`, [
      hand([{ user_id: A, won: 24000, net: 12000, committed: 12000, start: 12000, category: 9, allin: true, vpip: true, pfr: false }], {
        uncontested: false,
      }),
    ]);
    expect(await unlocked(A)).toEqual(
      expect.arrayContaining(['allin_win', 'big_win_10k', 'double_up', 'first_hand', 'first_win', 'win_royal']),
    );
    expect(await counters(A)).toMatchObject({ allins: 1, allin_wins: 1, double_ups: 1, biggest_win: 12000, win_royal: 1 });
  });

  it('counts the daily streak record', async () => {
    await db.query(`update public.profiles set last_daily_claim = now() - interval '30 hours', daily_streak = 6 where id = $1`, [A]);
    await as(A, `select public.claim_daily_bonus('device-phone-000000001') as r`);
    expect((await counters(A)).best_streak).toBe(7);
    expect(await unlocked(A)).toContain('streak_7');
  });
});

describe('chip transfer checks', () => {
  it('flags chips flowing from a linked or brand-new account', async () => {
    // G1 (a guest that shares a device with B) loses big pots to B.
    const t = { from: G1, to: B, amount: 13000 };
    for (let i = 0; i < 2; i++) await as(null, `select public.record_hands($1)`, [hand([], { transfers: [t] })]);
    const flags = await db.query<{ kind: string; severity: string; user_id: string; other_user: string }>(
      `select kind, severity, user_id, other_user from public.abuse_flags where kind = 'chip_dumping'`,
    );
    expect(flags.rows).toEqual([{ kind: 'chip_dumping', severity: 'high', user_id: B, other_user: G1 }]);
    const [{ amount, hands }] = (await db.query<{ amount: string; hands: number }>(
      'select amount, hands from public.chip_transfers where from_user = $1 and to_user = $2',
      [G1, B],
    )).rows;
    expect([Number(amount), hands]).toEqual([26000, 2]);
  });

  it('does not flag ordinary play between established players', async () => {
    await as(null, `select public.record_hands($1)`, [hand([], { transfers: [{ from: A, to: B, amount: 30000 }] })]);
    const flags = await db.query(`select 1 from public.abuse_flags where user_id = $1 and other_user = $2`, [B, A]);
    expect(flags.rows).toHaveLength(0);
  });
});

describe('cosmetic shop', () => {
  it('buys with wallet chips, auto-equips and refuses repeats', async () => {
    await db.query('update public.profiles set chips = 4000 where id = $1', [B]);
    const [poor] = await as<{ r: { ok: boolean; reason: string } }>(B, `select public.buy_cosmetic('frame-steel') as r`);
    expect(poor.r).toMatchObject({ ok: false, reason: 'insufficient_chips' });
    await db.query('update public.profiles set chips = 20000 where id = $1', [B]);
    const [ok] = await as<{ r: { ok: boolean; chips: number; frame: string; unlocked: string[] } }>(B, `select public.buy_cosmetic('frame-steel') as r`);
    // 20,000 - 5,000 price + 1,000 for the "Style Points" achievement.
    expect(ok.r).toMatchObject({ ok: true, chips: 16000, frame: 'frame-steel', unlocked: ['style_1'] });
    const [again] = await as<{ r: { ok: boolean; reason: string } }>(B, `select public.buy_cosmetic('frame-steel') as r`);
    expect(again.r).toMatchObject({ ok: false, reason: 'owned' });
    const [missing] = await as<{ r: { ok: boolean; reason: string } }>(B, `select public.buy_cosmetic('frame-nope') as r`);
    expect(missing.r).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('only equips items you own, in the right slot', async () => {
    await expect(as(B, `select public.equip_cosmetic('frame', 'frame-mythic')`)).rejects.toThrow(/own/);
    await expect(as(B, `select public.equip_cosmetic('backdrop', 'frame-steel')`)).rejects.toThrow(/own/);
    const [off] = await as<{ r: { frame: string | null } }>(B, `select public.equip_cosmetic('frame', null) as r`);
    expect(off.r.frame).toBeNull();
    const [on] = await as<{ r: { frame: string } }>(B, `select public.equip_cosmetic('frame', 'frame-steel') as r`);
    expect(on.r.frame).toBe('frame-steel');
    // Players only see their own purchases.
    expect(await as(A, 'select * from public.player_cosmetics')).toHaveLength(0);
    expect(await as(B, 'select * from public.player_cosmetics')).toHaveLength(1);
    await expect(as(B, `insert into public.player_cosmetics (user_id, cosmetic_id) values ($1, 'frame-mythic')`, [B])).rejects.toThrow(/permission/);
  });
});

describe('leaderboard', () => {
  it('returns equipped cosmetics and skips hidden accounts', async () => {
    const board = await as<{ id: string; frame: string | null }>(A, 'select id, frame from public.leaderboard()');
    expect(board.find((r) => r.id === B)?.frame).toBe('frame-steel');
    await db.query('update public.profiles set leaderboard_hidden = true where id = $1', [B]);
    const hidden = await as<{ id: string }>(A, 'select id from public.leaderboard()');
    expect(hidden.map((r) => r.id)).not.toContain(B);
  });
});
