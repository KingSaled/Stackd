/**
 * End-to-end test of the table service against the real SQL functions
 * (create_table / load_table / commit_table) running in PGlite.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb } from './pglite';
import { GameError, VersionConflict } from '../server/errors';
import type { CatalogRows, CommitPayload, CreateTableInput, ProfileInfo, Repo, StoredTable } from '../server/repo';
import { syncCatalog } from '../server/catalog';
import { createRoom, deleteAccount, runJanitor, tableOp, JANITOR } from '../server/service';
import { blackjackOp, createBlackjackRoom } from '../server/blackjack';
import type { BjPublicState } from '../shared/blackjack';
import { seededRng, TIMING, type PublicState } from '../shared/poker';
import type { BjRoundPayload, HandPayload } from '../server/hands';

class PgliteRepo implements Repo {
  constructor(private db: PGlite) {}
  async loadTable(id: string): Promise<StoredTable | null> {
    const r = await this.db.query<{ t: Record<string, never> | null }>('select public.load_table($1) as t', [id]);
    const t = r.rows[0]?.t as unknown as Record<string, unknown> | null;
    if (!t) return null;
    const secret = (t.secret ?? {}) as StoredTable['secret'];
    return {
      id: t.id as string,
      name: t.name as string,
      hostId: (t.host_id as string) ?? null,
      version: t.version as number,
      hasPassword: !!t.has_password,
      state: t.state as unknown as PublicState,
      secret:
        (t.state as { game?: string }).game === 'blackjack'
          ? (t.secret as StoredTable['secret'])
          : { deck: secret.deck ?? [], hole: secret.hole ?? {}, bots: secret.bots ?? {} },
    };
  }
  async commitTable(id: string, version: number, p: CommitPayload): Promise<number> {
    try {
      const r = await this.db.query<{ v: number }>(
        'select public.commit_table($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as v',
        [
          id,
          version,
          JSON.stringify(p.state),
          JSON.stringify(p.secret),
          JSON.stringify(p.seats),
          p.cards ? JSON.stringify(p.cards) : null,
          JSON.stringify(p.wallet),
          JSON.stringify(p.stats),
          p.status,
          p.playerCount,
        ],
      );
      return r.rows[0].v;
    } catch (e) {
      const msg = String((e as Error).message);
      if (msg.includes('version_conflict')) throw new VersionConflict();
      if (msg.includes('insufficient_chips')) throw new GameError('insufficient_chips', 'Not enough chips');
      throw e;
    }
  }
  async createTable(i: CreateTableInput): Promise<boolean> {
    try {
      await this.db.query('select public.create_table($1,$2,$3,$4,$5,$6,$7,$8)', [
        i.id,
        i.name,
        i.hostId,
        JSON.stringify(i.config),
        JSON.stringify(i.state),
        JSON.stringify(i.secret),
        i.password,
        i.listed,
      ]);
      return true;
    } catch (e) {
      if (String((e as Error).message).includes('duplicate key')) return false;
      throw e;
    }
  }
  async getProfile(userId: string): Promise<ProfileInfo | null> {
    const r = await this.db.query<ProfileInfo>(
      'select id, display_name, avatar, color, chips, frame, backdrop, terms_version from public.profiles where id = $1',
      [userId],
    );
    return r.rows[0] ? { ...r.rows[0], chips: Number(r.rows[0].chips) } : null;
  }
  async tablesOf(userId: string): Promise<string[]> {
    const r = await this.db.query<{ table_id: string }>('select table_id from public.table_seats where user_id = $1', [userId]);
    return r.rows.map((x) => x.table_id);
  }
  async deleteUser(userId: string): Promise<void> {
    await this.db.query('delete from auth.users where id = $1', [userId]);
  }
  async recordHands(hands: HandPayload[]): Promise<void> {
    await this.db.query('select public.record_hands($1)', [JSON.stringify(hands)]);
  }
  async recordBlackjackRounds(rounds: BjRoundPayload[]): Promise<void> {
    await this.db.query('select public.record_bj_rounds($1)', [JSON.stringify(rounds)]);
  }
  async isMember(tableId: string, userId: string): Promise<boolean> {
    const r = await this.db.query('select 1 from public.table_members where table_id = $1 and user_id = $2', [tableId, userId]);
    return r.rows.length > 0;
  }
  async listTablesIdleSince(iso: string): Promise<string[]> {
    const r = await this.db.query<{ id: string }>('select id from public.tables where player_count > 0 and updated_at < $1', [iso]);
    return r.rows.map((x) => x.id);
  }
  async cleanup() {
    return (await this.db.query('select public.cleanup_stale_data() as r')).rows[0];
  }
  async upsertCatalog(rows: CatalogRows): Promise<void> {
    for (const c of rows.cosmetics)
      await this.db.query(
        'insert into public.cosmetics (id, kind, price, tier) values ($1, $2, $3, $4) on conflict (id) do update set kind = excluded.kind, price = excluded.price, tier = excluded.tier',
        [c.id, c.kind, c.price, c.tier],
      );
    for (const a of rows.achievements)
      await this.db.query(
        'insert into public.achievements (id, counter, target, reward) values ($1, $2, $3, $4) on conflict (id) do update set counter = excluded.counter, target = excluded.target, reward = excluded.reward',
        [a.id, a.counter, a.target, a.reward],
      );
    for (const c of rows.challenges)
      await this.db.query(
        'insert into public.challenges (id, period, slot, counter, target, reward) values ($1, $2, $3, $4, $5, $6) on conflict (id) do update set period = excluded.period, slot = excluded.slot, counter = excluded.counter, target = excluded.target, reward = excluded.reward',
        [c.id, c.period, c.slot, c.counter, c.target, c.reward],
      );
  }
}

const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b1';
const C = '00000000-0000-0000-0000-0000000000c1';

let db: PGlite;
let repo: PgliteRepo;
let clock = Date.now();
const opts = { rng: seededRng(99), now: () => clock };

async function chips(id: string) {
  const r = await db.query<{ chips: string }>('select chips from public.profiles where id = $1', [id]);
  return Number(r.rows[0].chips);
}

beforeAll(async () => {
  db = await createDb();
  repo = new PgliteRepo(db);
  for (const [id, name] of [
    [A, 'Alice'],
    [B, 'Bob'],
    [C, 'Cara'],
  ])
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      id,
      `${name.toLowerCase()}@example.com`,
      JSON.stringify({ display_name: name }),
    ]);
  // Everyone here has accepted the Terms (the gate itself is tested separately).
  await db.query(`update public.profiles set terms_version = '2026-10-07'`);
}, 120_000);

describe('table service (with real SQL)', () => {
  let room = '';

  it('creates a room', async () => {
    const res = await createRoom(repo, A, { name: '  Friday   Night ', config: { smallBlind: 10, bigBlind: 20, maxSeats: 6, turnSeconds: 20 } }, opts);
    room = res.roomId;
    expect(room).toMatch(/^[A-Z2-9]{6}$/);
    const t = await repo.loadTable(room);
    expect(t!.name).toBe('Friday Night');
    expect(t!.state.config).toMatchObject({ bigBlind: 20, minBuyIn: 400, maxBuyIn: 2000 });
    await expect(createRoom(repo, A, { config: { bigBlind: 20, maxSeats: 12 } }, opts)).rejects.toThrow(/2 to 9/);
  });

  it('seats players, debits wallets and deals after the countdown', async () => {
    const r1 = await tableOp(repo, A, room, { type: 'sit', seat: 0, buyIn: 2000 }, opts);
    expect(r1.state!.seats[0]!.name).toBe('Alice');
    expect(await chips(A)).toBe(8000);
    await expect(tableOp(repo, B, room, { type: 'sit', seat: 0, buyIn: 1000 }, opts)).rejects.toThrow(/taken/);
    await expect(tableOp(repo, B, room, { type: 'sit', seat: 1, buyIn: 50_000 }, opts)).rejects.toThrow();
    await tableOp(repo, B, room, { type: 'sit', seat: 2, buyIn: 1000 }, opts);
    expect(await chips(B)).toBe(9000);

    const notYet = await tableOp(repo, C, room, { type: 'tick' }, opts);
    expect(notYet.changed).toBe(false);
    clock += TIMING.startDelayMs + 10;
    const dealt = await tableOp(repo, C, room, { type: 'tick' }, opts);
    expect(dealt.changed).toBe(true);
    const t = await repo.loadTable(room);
    expect(t!.state.phase).toBe('preflop');
    expect((t!.state as unknown as Record<string, unknown>).deck).toBeUndefined();
    const cards = await db.query<{ user_id: string; cards: string[]; hand_no: number }>(
      'select user_id, cards, hand_no from public.player_cards where table_id = $1 order by user_id',
      [room],
    );
    expect(cards.rows).toHaveLength(2);
    expect(cards.rows.every((r) => r.cards.length === 2 && r.hand_no === 1)).toBe(true);
  });

  it('plays a hand through actions, with private cards returned to the actor', async () => {
    let t = (await repo.loadTable(room))!;
    const first = t.state.toAct;
    const actor = t.state.seats[first]!.userId;
    const other = actor === A ? B : A;
    await expect(tableOp(repo, other, room, { type: 'act', action: { type: 'call' } }, opts)).rejects.toThrow(/not your turn/i);
    const r = await tableOp(repo, actor, room, { type: 'act', action: { type: 'call' }, handNo: 1, phase: 'preflop' }, opts);
    expect(r.myCards!.cards).toHaveLength(2);
    expect(r.state!.toAct).not.toBe(first);
    await expect(
      tableOp(repo, other, room, { type: 'act', action: { type: 'check' }, handNo: 1, phase: 'flop' }, opts),
    ).rejects.toThrow(/moved on/);
    await tableOp(repo, other, room, { type: 'act', action: { type: 'check' }, handNo: 1, phase: 'preflop' }, opts);
    t = (await repo.loadTable(room))!;
    expect(t.state.phase).toBe('flop');
    expect(t.state.board).toHaveLength(3);
  });

  it('resolves simultaneous writers with optimistic concurrency', async () => {
    const before = (await repo.loadTable(room))!.version;
    // Cara sits while the current actor acts: both must land.
    const t = (await repo.loadTable(room))!;
    const actor = t.state.seats[t.state.toAct]!.userId;
    const [x, y] = await Promise.all([
      tableOp(repo, C, room, { type: 'sit', seat: 4, buyIn: 1500 }, opts),
      tableOp(repo, actor, room, { type: 'act', action: { type: 'bet', amount: 100 } }, opts),
    ]);
    expect(x.changed && y.changed).toBe(true);
    const after = (await repo.loadTable(room))!;
    expect(after.version).toBe(before + 2);
    expect(after.state.seats[4]!.name).toBe('Cara');
    expect(after.state.currentBet).toBe(100);
    expect(await chips(C)).toBe(8500);
  });

  it('applies timeouts via tick and finishes the hand', async () => {
    let t = (await repo.loadTable(room))!;
    clock = t.state.actionDeadline! + 1;
    await tableOp(repo, C, room, { type: 'tick' }, opts); // facing a bet → auto-fold → uncontested
    t = (await repo.loadTable(room))!;
    expect(t.state.phase).toBe('showdown');
    expect(t.state.result!.uncontested).toBe(true);
    const prof = await db.query<{ hands_played: number }>('select hands_played from public.profiles where id = $1', [A]);
    expect(prof.rows[0].hands_played).toBe(1);
    // The finished hand fed the stats counters and the first achievements.
    const stats = await db.query<{ user_id: string; counters: Record<string, number> }>('select user_id, counters from public.player_stats');
    const byUser = Object.fromEntries(stats.rows.map((r) => [r.user_id, r.counters]));
    expect(byUser[A]).toMatchObject({ hands: 1 });
    expect(byUser[B]).toMatchObject({ hands: 1 });
    const winner = t.state.result!.payouts[0].userId;
    expect(byUser[winner]).toMatchObject({ wins: 1, uncontested_wins: 1 });
    const unlocked = await db.query<{ achievement_id: string }>('select achievement_id from public.player_achievements where user_id = $1', [winner]);
    expect(unlocked.rows.map((r) => r.achievement_id).sort()).toEqual(['first_hand', 'first_win']);
  });

  it('stands up and cashes out to the wallet', async () => {
    const t = (await repo.loadTable(room))!;
    const stackB = t.state.seats[2]!.stack;
    const walletB = await chips(B);
    await tableOp(repo, B, room, { type: 'stand' }, opts);
    expect(await chips(B)).toBe(walletB + stackB);
    const seats = await db.query('select user_id from public.table_seats where table_id = $1', [room]);
    expect(seats.rows).toHaveLength(2);
  });

  it('janitor closes idle tables and returns every chip', async () => {
    const t = (await repo.loadTable(room))!;
    const onTable = t.state.seats.reduce((a, s) => a + (s ? s.stack : 0), 0);
    const walletsBefore = (await chips(A)) + (await chips(C));
    await db.query(`update public.tables set updated_at = now() - interval '2 hours' where id = $1`, [room]);
    clock = Date.now();
    const res = await runJanitor(repo, { ...opts, now: () => Date.now() });
    expect(res.closed).toBe(1);
    expect((await chips(A)) + (await chips(C))).toBe(walletsBefore + onTable);
    // With everyone cashed out, the table is closed entirely.
    expect(await repo.loadTable(room)).toBeNull();
    expect(JANITOR.idleCloseMs).toBeGreaterThan(0);
  });

  it('closes a table as soon as the last player stands up', async () => {
    const { roomId } = await createRoom(repo, A, { config: { bigBlind: 10 } }, opts);
    await tableOp(repo, A, roomId, { type: 'sit', seat: 0, buyIn: 500 }, opts);
    await tableOp(repo, B, roomId, { type: 'sit', seat: 1, buyIn: 500 }, opts);
    const walletA = await chips(A);
    await tableOp(repo, A, roomId, { type: 'stand' }, opts);
    expect(await repo.loadTable(roomId)).not.toBeNull();
    await tableOp(repo, B, roomId, { type: 'stand' }, opts);
    expect(await repo.loadTable(roomId)).toBeNull();
    expect(await chips(A)).toBe(walletA + 500);
  });

  it('bot tables: bots fill seats, stay out of the database, and a player can claim a bot seat', async () => {
    const { roomId } = await createRoom(repo, A, { config: { bigBlind: 10, maxSeats: 4, bots: true } }, opts);
    const r = await tableOp(repo, A, roomId, { type: 'sit', seat: 0, buyIn: 500 }, opts);
    expect(r.state!.seats.filter((x) => x?.isBot)).toHaveLength(3);
    expect(JSON.stringify(r.state)).not.toContain('"iters"');
    // Each bot's hidden skill level survives being saved and loaded again.
    const brains = (await repo.loadTable(roomId))!.secret.bots ?? {};
    const botIds = r.state!.seats.filter((x) => x?.isBot).map((x) => x!.userId);
    expect(Object.keys(brains).sort()).toEqual(botIds.sort());
    for (const b of Object.values(brains)) expect(['easy', 'medium', 'hard']).toContain(b.level);
    const row = await db.query<{ player_count: number }>('select player_count from public.tables where id = $1', [roomId]);
    expect(row.rows[0].player_count).toBe(1);
    const seats = await db.query('select user_id from public.table_seats where table_id = $1', [roomId]);
    expect(seats.rows).toHaveLength(1);
    // Deal and let the bots play a few moves through ticks.
    for (let i = 0; i < 6; i++) {
      const t = (await repo.loadTable(roomId))!;
      clock = Math.max(clock + 100, (t.state.actionDeadline ?? t.state.nextHandAt ?? clock) + 1);
      await tableOp(repo, C, roomId, { type: 'tick' }, opts);
    }
    const t = (await repo.loadTable(roomId))!;
    const botSeat = t.state.seats.findIndex((x) => x?.isBot);
    const walletB = await chips(B);
    await tableOp(repo, B, roomId, { type: 'sit', seat: botSeat, buyIn: 400 }, opts);
    expect(await chips(B)).toBe(walletB - 400);
    const after = await db.query<{ player_count: number }>('select player_count from public.tables where id = $1', [roomId]);
    expect(after.rows[0].player_count).toBe(2);
    // Both players leave: the table closes and every chip goes back.
    await tableOp(repo, B, roomId, { type: 'stand' }, opts);
    await tableOp(repo, A, roomId, { type: 'stand' }, opts);
    expect(await repo.loadTable(roomId)).toBeNull();
  });

  it('requires accepting the Terms before sitting or opening a table', async () => {
    const { roomId } = await createRoom(repo, A, { config: { bigBlind: 10 } }, opts);
    await db.query('update public.profiles set terms_version = null where id = $1', [B]);
    await expect(tableOp(repo, B, roomId, { type: 'sit', seat: 1, buyIn: 500 }, opts)).rejects.toThrow(/Terms/);
    await expect(createRoom(repo, B, {}, opts)).rejects.toThrow(/Terms/);
    await db.query(`update public.profiles set terms_version = '2026-10-07' where id = $1`, [B]);
    await tableOp(repo, B, roomId, { type: 'sit', seat: 1, buyIn: 500 }, opts);
  });

  it('carries equipped cosmetics onto the seat', async () => {
    await db.query(`update public.profiles set frame = 'frame-gold', backdrop = 'bg-galaxy' where id = $1`, [C]);
    const { roomId } = await createRoom(repo, C, { config: { bigBlind: 10 } }, opts);
    const r = await tableOp(repo, C, roomId, { type: 'sit', seat: 0, buyIn: 500 }, opts);
    expect(r.state!.seats[0]).toMatchObject({ frame: 'frame-gold', backdrop: 'bg-galaxy' });
  });

  it('deletes an account: leaves the tables, then removes the profile and its data', async () => {
    const D = '00000000-0000-0000-0000-0000000000d1';
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'dee@example.com', '{"display_name":"Dee"}')`, [D]);
    await db.query(`update public.profiles set terms_version = '2026-10-07' where id = $1`, [D]);
    const { roomId } = await createRoom(repo, A, { config: { bigBlind: 10 } }, opts);
    await tableOp(repo, A, roomId, { type: 'sit', seat: 0, buyIn: 500 }, opts);
    await tableOp(repo, D, roomId, { type: 'sit', seat: 1, buyIn: 500 }, opts);
    await deleteAccount(repo, D, opts);
    expect((await db.query('select 1 from public.profiles where id = $1', [D])).rows).toHaveLength(0);
    expect((await db.query('select 1 from public.table_seats where user_id = $1', [D])).rows).toHaveLength(0);
    const t = (await repo.loadTable(roomId))!;
    expect(t.state.seats.some((x) => x?.userId === D)).toBe(false);
  });

  it('password rooms require membership to sit', async () => {
    const { roomId } = await createRoom(repo, A, { config: { bigBlind: 10 }, password: 'secret' }, opts);
    await expect(tableOp(repo, B, roomId, { type: 'sit', seat: 1, buyIn: 500 }, opts)).rejects.toThrow(/password/);
    await tableOp(repo, A, roomId, { type: 'sit', seat: 1, buyIn: 500 }, opts);
    await expect(tableOp(repo, A, 'nope!', { type: 'tick' }, opts)).rejects.toThrow(/not found/i);
  });
});

describe('blackjack service (with real SQL)', () => {
  let room = '';
  const bj = (user: string, action: Record<string, unknown>) => blackjackOp(repo, user, room, action, opts);
  const load = async () => (await repo.loadTable(room))!.state as unknown as BjPublicState;

  it('creates a public blackjack table that the lobby can tell apart', async () => {
    await db.query('update public.profiles set chips = 10000 where id in ($1, $2)', [A, B]);
    room = (await createBlackjackRoom(repo, A, { name: 'Twenty-one', config: { turnSeconds: 20 } }, opts)).roomId;
    const r = await db.query<{ game: string; config: { turnSeconds: number; maxSeats: number } }>('select game, config from public.tables where id = $1', [room]);
    expect(r.rows[0].game).toBe('blackjack');
    expect(r.rows[0].config.turnSeconds).toBe(20);
    expect(r.rows[0].config.maxSeats).toBe(6);
  });

  it('refuses poker moves on a blackjack table and blackjack moves on a poker table', async () => {
    await expect(tableOp(repo, A, room, { type: 'sit', seat: 0, buyIn: 1000 }, opts)).rejects.toThrow(/blackjack table/);
    const poker = (await createRoom(repo, B, { config: { smallBlind: 5, bigBlind: 10, maxSeats: 6, minBuyIn: 200, maxBuyIn: 1000, turnSeconds: 30 } }, opts)).roomId;
    await expect(blackjackOp(repo, B, poker, { type: 'sit', seat: 0 }, opts)).rejects.toThrow(/blackjack/);
  });

  it('bets come from the wallet and winnings go straight back', async () => {
    await bj(A, { type: 'sit', seat: 0 });
    await bj(B, { type: 'sit', seat: 2 });
    await bj(A, { type: 'bet', amount: 100 });
    expect(await chips(A)).toBe(9900);
    const seats = await db.query<{ stack: string }>('select stack from public.table_seats where table_id = $1 and user_id = $2', [room, A]);
    expect(Number(seats.rows[0].stack)).toBe(100);
    const open = await db.query<{ game: string }>(`select game from public.list_open_tables() where id = $1`, [room]);
    expect(open.rows[0]?.game).toBe('blackjack');

    await bj(B, { type: 'bet', amount: 200 });
    let st = await load();
    expect(st.roundNo).toBe(1);
    expect(JSON.stringify(st)).not.toMatch(/"shoe"/);
    for (let g = 0; g < 20 && st.phase === 'playing'; g++) {
      const who = st.seats[st.toAct]!.userId;
      clock += 1000;
      st = (await bj(who, { type: 'act', action: 'stand', round: st.roundNo })).state!;
    }
    expect(st.phase).toBe('settled');
    // The settled round fed the stats counters (and so the challenges) for both players.
    const counters = await db.query<{ user_id: string; counters: Record<string, number> }>(
      'select user_id, counters from public.player_stats where user_id in ($1, $2)',
      [A, B],
    );
    for (const row of counters.rows) expect(row.counters.bj_hands, row.user_id).toBe(1);
    const paid = (i: number) => st.seats[i]!.hands.reduce((a, h) => a + h.payout, 0);
    expect(await chips(A)).toBe(9900 + paid(0));
    expect(await chips(B)).toBe(9800 + paid(2));
    const onTable = await db.query<{ s: string }>('select coalesce(sum(stack), 0) as s from public.table_seats where table_id = $1', [room]);
    expect(Number(onTable.rows[0].s)).toBe(0);
  });

  it("can't bet more than the wallet holds", async () => {
    let st = await load();
    clock = st.nextRoundAt! + 1;
    await bj(A, { type: 'tick' });
    await db.query('update public.profiles set chips = 50 where id = $1', [A]);
    await expect(bj(A, { type: 'bet', amount: 100 })).rejects.toThrow(/chips/);
    st = await load();
    expect(st.seats[0]!.bet).toBe(0);
    expect(await chips(A)).toBe(50);
    await db.query('update public.profiles set chips = 10000 where id = $1', [A]);
  });

  it('the inactivity janitor hands back chips left on an abandoned table', async () => {
    await bj(A, { type: 'bet', amount: 300 });
    expect(await chips(A)).toBe(9700);
    // Every chip A has on any table (this one and any poker seat from earlier tests) comes back.
    const seated = await db.query<{ s: string }>('select coalesce(sum(stack), 0) as s from public.table_seats where user_id = $1', [A]);
    const expected = 9700 + Number(seated.rows[0].s);
    await db.query(`update public.tables set updated_at = now() - interval '2 hours' where id = $1`, [room]);
    clock += JANITOR.idleCloseMs + 1000;
    const r = await runJanitor(repo, opts);
    expect(r.closed).toBeGreaterThanOrEqual(1);
    expect(await chips(A)).toBe(expected);
    expect((await db.query('select 1 from public.tables where id = $1', [room])).rows).toHaveLength(0);
  });

  it('the table closes when the last player leaves', async () => {
    room = (await createBlackjackRoom(repo, A, {}, opts)).roomId;
    await bj(A, { type: 'sit', seat: 3 });
    await bj(A, { type: 'stand' });
    expect((await db.query('select 1 from public.tables where id = $1', [room])).rows).toHaveLength(0);
  });

  it('deleting an account leaves blackjack tables first', async () => {
    room = (await createBlackjackRoom(repo, B, {}, opts)).roomId;
    await bj(B, { type: 'sit', seat: 1 });
    await bj(A, { type: 'sit', seat: 4 });
    await deleteAccount(repo, A, opts);
    const st = await load();
    expect(st.seats.filter(Boolean).map((x) => x!.userId)).toEqual([B]);
  });
});

describe('shop catalog sync', () => {
  const buyAs = async (user: string, id: string) => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false)`);
    try {
      return (await db.query<{ r: { ok: boolean; reason?: string } }>('select public.buy_cosmetic($1) as r', [id])).rows[0].r;
    } finally {
      await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };

  it('adds shop items the database is missing, so buying them works without re-running the schema', async () => {
    // A database set up before Storm Front existed.
    await db.query(`delete from public.cosmetics where id = 'bg-storm'`);
    await db.query(`delete from public.achievements where id = 'wins_500'`);
    await db.query(`delete from public.challenges where id = 'w_sweep'`);
    await db.query(`update public.profiles set chips = 100000 where id = $1`, [C]);
    expect((await buyAs(C, 'bg-storm')).reason).toBe('not_found');

    const r = await syncCatalog(repo);
    expect(r.cosmetics).toBe(20);
    const rows = await db.query<{ id: string; price: string; tier: number }>(`select id, price, tier from public.cosmetics where id = 'bg-storm'`);
    expect(rows.rows[0]).toMatchObject({ id: 'bg-storm', tier: 3 });
    expect(Number(rows.rows[0].price)).toBe(25000);
    expect((await db.query(`select 1 from public.achievements where id = 'wins_500'`)).rows.length).toBe(1);
    expect(r.challenges).toBeGreaterThan(20);
    expect((await db.query(`select 1 from public.challenges where id = 'w_sweep'`)).rows.length).toBe(1);

    const bought = await buyAs(C, 'bg-storm');
    expect(bought.ok).toBe(true);
    // 25,000 for the item, plus the 1,000 reward for a first purchase.
    expect(await chips(C)).toBe(76000);
    // Running it again changes nothing.
    await syncCatalog(repo);
    expect(Number((await db.query<{ n: number }>('select count(*)::int n from public.cosmetics')).rows[0].n)).toBe(20);
  });
});
