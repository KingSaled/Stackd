/**
 * The minigames and the bigger reload, against the real schema in an in-process Postgres:
 * every chip that moves, the odds, and the rules players can't get around.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createDb } from './pglite';
import { CASE_RTP, CASE_TIERS, tierMean } from '../shared/cases';
import { crashMultiplier, crashTimeFor } from '../shared/crash';

const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b1';
const C = '00000000-0000-0000-0000-0000000000c1';
const D = '00000000-0000-0000-0000-0000000000d1';

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
const rpc = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => (await as<{ r: T }>(user, `select ${sql} as r`, params))[0].r;
const chipsOf = async (id: string) => Number((await db.query<{ chips: string }>('select chips from public.profiles where id = $1', [id])).rows[0].chips);
const setChips = (id: string, n: number) => db.query('update public.profiles set chips = $2 where id = $1', [id, n]);

beforeAll(async () => {
  db = await createDb();
  for (const [id, name] of [[A, 'Ann'], [B, 'Ben'], [C, 'Cy'], [D, 'Di']])
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name}@example.com`, JSON.stringify({ display_name: name })]);
}, 120_000);

describe('emergency reload', () => {
  it('tops a broke player up to 100,000, then waits 30 minutes', async () => {
    await setChips(A, 300);
    const r = await rpc<{ ok: boolean; amount: number; chips: number }>(A, 'public.emergency_reload()');
    expect(r).toMatchObject({ ok: true, amount: 99700, chips: 100000 });
    await setChips(A, 0);
    await db.query(`update public.profiles set last_reload_at = now() - interval '25 minutes' where id = $1`, [A]);
    expect((await rpc<{ reason: string }>(A, 'public.emergency_reload()')).reason).toBe('cooldown');
    await db.query(`update public.profiles set last_reload_at = now() - interval '31 minutes' where id = $1`, [A]);
    expect((await rpc<{ ok: boolean }>(A, 'public.emergency_reload()')).ok).toBe(true);
  });

  it('lets anyone whose last reload was an old 2,500 one claim the new one straight away', async () => {
    // B took an old-style reload 20 minutes ago; A's last reload was a new one.
    await db.query(`insert into public.bonus_claims (user_id, kind, amount) values ($1, 'reload', 2380)`, [B]);
    await db.query(`update public.profiles set last_reload_at = now() - interval '20 minutes', chips = 50 where id = $1`, [B]);
    await db.query(`update public.profiles set last_reload_at = now() - interval '20 minutes' where id = $1`, [A]);
    // Re-running the schema (what the owner does when upgrading) clears only B's old cooldown.
    const { schemaSql } = await import('./pglite');
    await db.exec(schemaSql);
    const rows = (await db.query<{ id: string; last: string | null }>('select id, last_reload_at as last from public.profiles where id in ($1, $2)', [A, B])).rows;
    expect(rows.find((r) => r.id === B)!.last).toBeNull();
    expect(rows.find((r) => r.id === A)!.last).not.toBeNull();
    expect(await rpc<{ ok: boolean; amount: number }>(B, 'public.emergency_reload()')).toMatchObject({ ok: true, amount: 99950 });
  });
});

describe('case opening', () => {
  it('pays back a little under 100% on average, with the tiers as advertised', () => {
    expect(CASE_TIERS.reduce((a, t) => a + t.odds, 0)).toBeCloseTo(1, 10);
    expect(CASE_RTP).toBeGreaterThan(0.93);
    expect(CASE_RTP).toBeLessThan(0.98);
    expect(tierMean(CASE_TIERS.find((t) => t.id === 'covert')!)).toBeGreaterThan(10);
  });

  it('takes the price, pays the prize and records the drop', async () => {
    await setChips(C, 100_000);
    const r = await rpc<{ ok: boolean; tier: string; multiplier: string; prize: number; chips: number }>(C, 'public.open_case(10000)');
    expect(r.ok).toBe(true);
    // The multiplier has 3 decimals; multiply in whole thousandths so float error can't round the prize down.
    expect(Number(r.prize)).toBe(Math.floor((10000 * Math.round(Number(r.multiplier) * 1000)) / 1000));
    expect(await chipsOf(C)).toBe(100_000 - 10_000 + Number(r.prize));
    const mine = await as(C, 'select * from public.case_openings');
    expect(mine).toHaveLength(1);
    // Other players can't see someone's history directly.
    expect(await as(D, 'select * from public.case_openings')).toHaveLength(0);
  });

  it('refuses bad prices and empty wallets', async () => {
    expect((await rpc<{ reason: string }>(C, 'public.open_case(50)')).reason).toBe('bad_cost');
    expect((await rpc<{ reason: string }>(C, 'public.open_case(600000)')).reason).toBe('bad_cost');
    await setChips(D, 500);
    expect((await rpc<{ reason: string }>(D, 'public.open_case(1000)')).reason).toBe('insufficient_chips');
    expect(await chipsOf(D)).toBe(500);
  });

  it('rolls each tier about as often as advertised, inside its range', async () => {
    await setChips(C, 100_000_000);
    await db.exec(`select set_config('request.jwt.claim.sub', '${C}', false)`);
    for (let i = 0; i < 3000; i++) await db.query('select public.open_case(100)');
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
    const rows = (await db.query<{ tier: string; n: number; lo: string; hi: string }>(
      `select tier, count(*)::int n, min(multiplier) lo, max(multiplier) hi from public.case_openings where user_id = $1 and cost = 100 group by tier`,
      [C],
    )).rows;
    const byTier = new Map(rows.map((r) => [r.tier, r]));
    for (const t of CASE_TIERS) {
      const row = byTier.get(t.id);
      const share = (row?.n ?? 0) / 3000;
      // Generous bounds: this is a sanity check on the wiring, not a statistics test.
      expect(Math.abs(share - t.odds), t.id).toBeLessThan(Math.max(0.03, t.odds * 0.6));
      if (row) {
        expect(Number(row.lo)).toBeGreaterThanOrEqual(t.min);
        expect(Number(row.hi)).toBeLessThanOrEqual(t.max);
      }
    }
  }, 60_000);
});

describe('coin flip', () => {
  it('holds the stake in an open lobby and gives it back when closed', async () => {
    await setChips(A, 100_000);
    const made = await rpc<{ ok: boolean; id: number }>(A, 'public.create_coinflip(20000)');
    expect(made.ok).toBe(true);
    expect(await chipsOf(A)).toBe(80_000);
    expect((await rpc<{ reason: string }>(B, 'public.cancel_coinflip($1)', [made.id])).reason).toBe('not_found');
    expect((await rpc<{ ok: boolean }>(A, 'public.cancel_coinflip($1)', [made.id])).ok).toBe(true);
    expect(await chipsOf(A)).toBe(100_000);
  });

  it('pays the whole pot to the winner, once, and never to someone flipping alone', async () => {
    await setChips(A, 100_000);
    await setChips(B, 100_000);
    const { id } = await rpc<{ id: number }>(A, 'public.create_coinflip(30000)');
    expect((await rpc<{ reason: string }>(A, 'public.join_coinflip($1, $2)', [id, 'heads'])).reason).toBe('own_lobby');
    const r = await rpc<{ ok: boolean; result: string; winner: string; flip_at: string }>(B, 'public.join_coinflip($1, $2)', [id, 'heads']);
    expect(r.ok).toBe(true);
    expect(r.winner).toBe(r.result === 'heads' ? B : A);
    const [a, b] = [await chipsOf(A), await chipsOf(B)];
    expect(a + b).toBe(200_000);
    expect(r.winner === A ? a : b).toBe(130_000);
    // Taken already.
    await setChips(C, 100_000);
    expect((await rpc<{ reason: string }>(C, 'public.join_coinflip($1, $2)', [id, 'tails'])).reason).toBe('taken');
    expect(await chipsOf(C)).toBe(100_000);
    const row = (await as<{ status: string; challenger_side: string }>(D, 'select status, challenger_side from public.coinflips where id = $1', [id]))[0];
    expect(row).toMatchObject({ status: 'flipped', challenger_side: 'heads' });
  });

  it('is a fair coin', async () => {
    const heads = (await db.query<{ h: number }>(`select avg((public.rand_unit() < 0.5)::int)::float h from generate_series(1, 20000)`)).rows[0].h;
    expect(heads).toBeGreaterThan(0.48);
    expect(heads).toBeLessThan(0.52);
  });

  it('limits open lobbies and refunds stale ones in the hourly cleanup', async () => {
    await setChips(D, 10_000);
    for (let i = 0; i < 3; i++) expect((await rpc<{ ok: boolean }>(D, 'public.create_coinflip(1000)')).ok).toBe(true);
    expect((await rpc<{ reason: string }>(D, 'public.create_coinflip(1000)')).reason).toBe('too_many');
    expect(await chipsOf(D)).toBe(7_000);
    await db.query(`update public.coinflips set created_at = now() - interval '3 hours' where creator = $1 and status = 'open'`, [D]);
    await as(null, 'select public.cleanup_stale_data()');
    expect(await chipsOf(D)).toBe(10_000);
  });

  it('cannot be edited from the browser', async () => {
    await expect(as(A, `update public.coinflips set winner = $1`, [A])).rejects.toThrow(/permission/);
  });
});

describe('roulette', () => {
  const secret = async () => Number((await db.query<{ slot: number }>('select slot from public.roulette_secrets order by round_id desc limit 1')).rows[0].slot);
  const colorOf = (s: number) => (s === 0 ? 'green' : s % 2 ? 'red' : 'black');

  it('opens a 25 second round and keeps the result secret until the spin', async () => {
    const s = await rpc<{ round: { id: number; result_slot: number | null; settled: boolean; opens_at: string; spin_at: string } }>(A, 'public.roulette_state()');
    expect(s.round.settled).toBe(false);
    expect(s.round.result_slot).toBeNull();
    expect(Date.parse(s.round.spin_at) - Date.parse(s.round.opens_at)).toBe(25_000);
    await expect(as(A, 'select * from public.roulette_secrets')).rejects.toThrow(/permission/);
  });

  it('pays 2x on the right colour and 14x on green, and nothing otherwise', async () => {
    await setChips(A, 100_000);
    await setChips(B, 100_000);
    const slot = await secret();
    const win = colorOf(slot);
    const lose = win === 'red' ? 'black' : 'red';
    expect((await rpc<{ ok: boolean }>(A, 'public.place_roulette_bet($1, 1000)', [win])).ok).toBe(true);
    expect((await rpc<{ ok: boolean }>(A, 'public.place_roulette_bet($1, 500)', [win])).ok).toBe(true); // adds to the same bet
    expect((await rpc<{ ok: boolean }>(B, 'public.place_roulette_bet($1, 2000)', [lose])).ok).toBe(true);
    expect(await chipsOf(A)).toBe(98_500);
    // Time passes: the wheel spins.
    await db.query(`update public.roulette_rounds set opens_at = opens_at - interval '26 seconds', spin_at = spin_at - interval '26 seconds' where settled_at is null`);
    expect((await rpc<{ reason: string }>(B, 'public.place_roulette_bet($1, 100)', ['red'])).reason).toBe('closed');
    const s = await rpc<{ round: { result_slot: number; settled: boolean } }>(C, 'public.roulette_state()');
    expect(s.round).toMatchObject({ settled: true, result_slot: slot });
    expect(await chipsOf(A)).toBe(98_500 + 1_500 * (win === 'green' ? 14 : 2));
    expect(await chipsOf(B)).toBe(98_000);
  });

  it('opens the next round after the result has been on show', async () => {
    await db.query(`update public.roulette_rounds set spin_at = spin_at - interval '10 seconds'`);
    const s = await rpc<{ round: { settled: boolean }; history: number[] }>(A, 'public.roulette_state()');
    expect(s.round.settled).toBe(false);
    expect(s.history.length).toBeGreaterThan(0);
  });

  it('gives bets back if asked before the spin', async () => {
    await setChips(C, 10_000);
    await rpc(C, `public.place_roulette_bet('green', 3000)`);
    expect(await chipsOf(C)).toBe(7_000);
    expect(await rpc<{ ok: boolean; refunded: number }>(C, 'public.clear_roulette_bets()')).toMatchObject({ ok: true, refunded: 3000 });
    expect(await chipsOf(C)).toBe(10_000);
  });

  it('lands on every slot about equally often', async () => {
    const rows = (await db.query<{ n: number }>(
      `select count(*)::int n from (select least(14, floor(public.rand_unit() * 15)::int) s from generate_series(1, 15000)) x group by s`,
    )).rows;
    expect(rows).toHaveLength(15);
    for (const r of rows) expect(Math.abs(r.n - 1000)).toBeLessThan(150);
  });
});

describe('crash', () => {
  const cp = (v: number) => db.query('update public.crash_secrets set crash_point = $1 where round_id = (select max(id) from public.crash_rounds)', [v]);
  const launch = (secondsAgo: number) =>
    db.query(`update public.crash_rounds set run_at = now() - make_interval(secs => $1), opens_at = now() - make_interval(secs => $1 + 8) where id = (select max(id) from public.crash_rounds)`, [secondsAgo]);

  it('matches the screen’s maths', () => {
    expect(crashMultiplier(0)).toBe(1);
    expect(crashMultiplier(crashTimeFor(2))).toBeCloseTo(2, 1);
    expect(crashTimeFor(10)).toBeCloseTo((Math.log(10) / 0.08) * 1000, 5);
  });

  it('crashes at 2x or more about 48.5% of the time (97% payback)', async () => {
    const [{ p2, p10 }] = (await db.query<{ p2: number; p10: number }>(
      `select avg((cp >= 2)::int)::float p2, avg((cp >= 10)::int)::float p10
         from (select least(1000, greatest(1, floor(97 / (1 - public.rand_unit())) / 100.0)) cp from generate_series(1, 20000)) x`,
    )).rows;
    expect(p2).toBeGreaterThan(0.465);
    expect(p2).toBeLessThan(0.505);
    expect(p10).toBeGreaterThan(0.085);
    expect(p10).toBeLessThan(0.11);
  });

  it('takes bets before launch only, one per player', async () => {
    await setChips(A, 100_000);
    await rpc(A, 'public.crash_state()');
    await cp(50);
    expect((await rpc<{ ok: boolean }>(A, 'public.place_crash_bet(10000)')).ok).toBe(true);
    expect((await rpc<{ reason: string }>(A, 'public.place_crash_bet(10000)')).reason).toBe('already_in');
    expect((await rpc<{ reason: string }>(A, 'public.crash_cashout()')).reason).toBe('not_started');
    expect(await chipsOf(A)).toBe(90_000);
    await expect(as(A, 'select * from public.crash_secrets')).rejects.toThrow(/permission/);
    const s = await rpc<{ round: { crash_point: number | null } }>(B, 'public.crash_state()');
    expect(s.round.crash_point).toBeNull();
  });

  it('cashes out at the multiplier on the server’s clock', async () => {
    await setChips(B, 100_000);
    await rpc(B, 'public.place_crash_bet(20000, 1.5)');
    await setChips(C, 100_000);
    await rpc(C, 'public.place_crash_bet(5000)');
    await launch(10); // e^(0.8) = 2.22x
    const r = await rpc<{ ok: boolean; mult: string; payout: number }>(A, 'public.crash_cashout()');
    expect(r.ok).toBe(true);
    expect(Number(r.mult)).toBeGreaterThanOrEqual(2.22);
    expect(Number(r.mult)).toBeLessThan(2.3);
    expect(await chipsOf(A)).toBe(90_000 + Math.floor(10_000 * Number(r.mult)));
    expect((await rpc<{ reason: string }>(A, 'public.crash_cashout()')).reason).toBe('already_out');
    // B's auto cash-out at 1.5x was already passed: cashing out late pays 1.5x, not 2.2x.
    expect(Number((await rpc<{ mult: string }>(B, 'public.crash_cashout()')).mult)).toBe(1.5);
    expect(await chipsOf(B)).toBe(80_000 + 30_000);
  });

  it('pays automatic cash-outs and busts everyone else when it crashes', async () => {
    // Next round: crash at 3.00x.
    await db.query(`update public.crash_rounds set crash_point = 50, crashed_at = now() - interval '10 seconds' where crashed_at is null`);
    await rpc(A, 'public.crash_state()');
    await cp(3);
    await setChips(A, 100_000);
    await setChips(B, 100_000);
    await setChips(D, 100_000);
    await rpc(A, 'public.place_crash_bet(10000, 2)'); // auto 2x: wins
    await rpc(B, 'public.place_crash_bet(10000, 5)'); // auto 5x: crashes first
    await rpc(D, 'public.place_crash_bet(10000)'); // never cashes out
    await launch(15); // 3.32x by now: just past the crash at 3x (which happened at 13.7s)
    const s = await rpc<{ round: { crash_point: string; crashed_at: string } }>(C, 'public.crash_state()');
    expect(Number(s.round.crash_point)).toBe(3);
    expect(await chipsOf(A)).toBe(110_000);
    expect(await chipsOf(B)).toBe(90_000);
    expect(await chipsOf(D)).toBe(90_000);
    expect((await rpc<{ reason: string }>(D, 'public.crash_cashout()')).reason).toBe('crashed');
    expect(await chipsOf(D)).toBe(90_000);
  });

  it('refuses a cash-out after the crash point even before anyone has noticed the crash', async () => {
    await db.query(`update public.crash_rounds set crashed_at = now() - interval '10 seconds' where crashed_at is not null`);
    await rpc(A, 'public.crash_state()');
    await cp(1.2);
    await setChips(C, 50_000);
    await rpc(C, 'public.place_crash_bet(10000)');
    await launch(5); // 1.49x by now, crash was at 1.2x
    expect((await rpc<{ reason: string }>(C, 'public.crash_cashout()')).reason).toBe('crashed');
    expect(await chipsOf(C)).toBe(40_000);
  });
});
