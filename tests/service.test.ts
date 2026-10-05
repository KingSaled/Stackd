/**
 * End-to-end test of the table service against the real SQL functions
 * (create_table / load_table / commit_table) running in PGlite.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDb } from './pglite';
import { GameError, VersionConflict } from '../server/errors';
import type { CommitPayload, CreateTableInput, ProfileInfo, Repo, StoredTable } from '../server/repo';
import { createRoom, runJanitor, tableOp, JANITOR } from '../server/service';
import { seededRng, TIMING, type PublicState } from '../shared/poker';

class PgliteRepo implements Repo {
  constructor(private db: PGlite) {}
  async loadTable(id: string): Promise<StoredTable | null> {
    const r = await this.db.query<{ t: Record<string, never> | null }>('select public.load_table($1) as t', [id]);
    const t = r.rows[0]?.t as unknown as Record<string, unknown> | null;
    if (!t) return null;
    const secret = (t.secret ?? {}) as { deck?: string[]; hole?: Record<string, string[]> };
    return {
      id: t.id as string,
      name: t.name as string,
      hostId: (t.host_id as string) ?? null,
      version: t.version as number,
      hasPassword: !!t.has_password,
      state: t.state as unknown as PublicState,
      secret: { deck: secret.deck ?? [], hole: secret.hole ?? {} },
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
    const r = await this.db.query<ProfileInfo>('select id, display_name, avatar, color, chips from public.profiles where id = $1', [userId]);
    return r.rows[0] ? { ...r.rows[0], chips: Number(r.rows[0].chips) } : null;
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
    const after = (await repo.loadTable(room))!;
    expect(after.state.seats.every((s) => s === null)).toBe(true);
    expect(JANITOR.idleCloseMs).toBeGreaterThan(0);
  });

  it('password rooms require membership to sit', async () => {
    const { roomId } = await createRoom(repo, A, { config: { bigBlind: 10 }, password: 'secret' }, opts);
    await expect(tableOp(repo, B, roomId, { type: 'sit', seat: 1, buyIn: 500 }, opts)).rejects.toThrow(/password/);
    await tableOp(repo, A, roomId, { type: 'sit', seat: 1, buyIn: 500 }, opts);
    await expect(tableOp(repo, A, 'nope!', { type: 'tick' }, opts)).rejects.toThrow(/not found/i);
  });
});
