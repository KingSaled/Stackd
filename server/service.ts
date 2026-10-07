/**
 * Table service: loads a table, applies exactly one authoritative engine
 * transition and commits it atomically. Concurrent writers are resolved with
 * optimistic concurrency (version check + retry), so two players acting at the
 * same instant can never corrupt a hand.
 */
import {
  GameError,
  isBotId,
  addChips,
  applyAction,
  closeTable,
  createInitialState,
  isBettingPhase,
  mergeState,
  newEffects,
  privateCards,
  sanitizeConfig,
  seatIndexOf,
  setSittingOut,
  sitDown,
  standUp,
  tick,
  toPublicState,
  toSecretState,
  updateIdentity,
  type Effects,
  type EngineState,
  type HandRecord,
  type PlayerAction,
  type PublicState,
  type TableConfig,
} from '../shared/poker';
import { VersionConflict } from './errors';
import type { CommitPayload, ProfileInfo, Repo, StoredTable } from './repo';
import { handPayload, type HandPayload } from './hands';
import { cryptoRng, generateRoomId, isBlackjackTable, normalizeRoomId, type ServiceOptions } from './common';
import { closeBlackjackTable, leaveBlackjack } from './blackjack';

export { cryptoRng, generateRoomId, normalizeRoomId, isBlackjackTable, type ServiceOptions } from './common';

/* ------------------------------------------------------------------------ */
/* Commit helpers                                                            */
/* ------------------------------------------------------------------------ */

export function buildCommit(s: EngineState, fx: Effects): CommitPayload {
  const seats: CommitPayload['seats'] = [];
  s.seats.forEach((seat, i) => {
    if (!seat) return;
    if (seat.isBot) {
      // Bots never touch the database; a player waiting for this seat already paid their buy-in.
      const r = seat.reservedFor;
      if (r) seats.push({ user_id: r.userId, seat: i, stack: r.buyIn });
      return;
    }
    // Chips a live player has in the pot are still "theirs" for broke checks; a folder's are dead money.
    const inPot = isBettingPhase(s.phase) && seat.inHand && !seat.folded ? seat.committed : 0;
    seats.push({ user_id: seat.userId, seat: i, stack: seat.stack + seat.pendingTopUp + inPot });
  });
  return {
    state: toPublicState(s),
    secret: toSecretState(s),
    seats,
    cards: fx.dealt
      ? privateCards(s).map((c) => ({ user_id: c.userId, hand_no: c.handNo, seat: c.seat, cards: c.cards }))
      : null,
    wallet: Object.entries(fx.wallet)
      .filter(([id, d]) => d !== 0 && !isBotId(id))
      .map(([user_id, delta]) => ({ user_id, delta })),
    stats: Object.entries(fx.stats)
      .filter(([id]) => !isBotId(id))
      .map(([user_id, st]) => ({
      user_id,
      played: st.played,
      won: st.won,
      biggest_pot: st.biggestPot,
      best_hand: st.bestHand,
    })),
    status: s.phase === 'waiting' ? 'waiting' : 'playing',
    playerCount: seats.length,
  };
}

export interface MutationResult {
  changed: boolean;
  version: number;
  state: EngineState;
  /** Hands that finished in the committed transition. */
  hands: HandRecord[];
}

type Mutator = (s: EngineState, fx: Effects, now: number, rec: StoredTable) => boolean | void | Promise<boolean | void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


/** Stats, achievements and abuse checks never get in the way of the game itself. */
async function recordHands(repo: Repo, roomId: string, hands: HandRecord[]) {
  const payload = hands.map((h) => handPayload(roomId, h)).filter((h): h is HandPayload => h !== null);
  if (payload.length === 0) return;
  try {
    await repo.recordHands(payload);
  } catch (e) {
    console.error('[stackd] could not record hand stats', roomId, e);
  }
}

/** Players confirm they are 18+ and accept the Terms before they can sit or open a table. */
function requireTerms(profile: ProfileInfo) {
  if ('terms_version' in profile && !profile.terms_version)
    throw new GameError('terms_required', 'Please accept the Terms of Service to play');
}

function identityOf(userId: string, p: ProfileInfo) {
  return { userId, name: p.display_name, avatar: p.avatar, color: p.color, frame: p.frame ?? null, backdrop: p.backdrop ?? null };
}

export async function mutateTable(
  repo: Repo,
  roomId: string,
  mutator: Mutator,
  opts: ServiceOptions = {},
): Promise<MutationResult> {
  const now = opts.now ?? Date.now;
  for (let attempt = 0; attempt < 8; attempt++) {
    const rec = await repo.loadTable(roomId);
    if (!rec) throw new GameError('not_found', 'Table not found');
    if (isBlackjackTable(rec)) throw new GameError('wrong_game', 'That is a blackjack table');
    const s = mergeState(rec.state, rec.secret);
    const fx = newEffects();
    const result = await mutator(s, fx, now(), rec);
    if (result === false) return { changed: false, version: rec.version, state: s, hands: [] };
    try {
      const version = await repo.commitTable(roomId, rec.version, buildCommit(s, fx));
      await recordHands(repo, roomId, fx.hands);
      return { changed: true, version, state: s, hands: fx.hands };
    } catch (e) {
      if (e instanceof VersionConflict) {
        await sleep(15 + Math.random() * 40 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw new GameError('busy', 'The table is busy right now — please try again');
}

/* ------------------------------------------------------------------------ */
/* Operations                                                                */
/* ------------------------------------------------------------------------ */

export interface CreateRoomInput {
  name?: unknown;
  config?: Partial<TableConfig>;
  password?: unknown;
}

export async function createRoom(repo: Repo, userId: string, input: CreateRoomInput, opts: ServiceOptions = {}) {
  const profile = await repo.getProfile(userId);
  if (!profile) throw new GameError('forbidden', 'Profile not found');
  requireTerms(profile);
  const config = sanitizeConfig(input.config ?? {});
  let name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) name = `${profile.display_name}'s table`;
  name = name.slice(0, 40);
  const password = typeof input.password === 'string' && input.password.length > 0 ? input.password : null;
  if (password && password.length > 64) throw new GameError('bad_config', 'Password is too long');
  // Every table is public (listed in the lobby) unless it has a password.
  const listed = !password;

  const now = (opts.now ?? Date.now)();
  const state = createInitialState(config, now);
  state.logSeq = 1;
  state.log.push({ id: 1, kind: 'info', text: `${profile.display_name} opened the table`, at: now });

  for (let attempt = 0; attempt < 6; attempt++) {
    const id = generateRoomId(opts.rng ?? cryptoRng);
    const created = await repo.createTable({
      id,
      name,
      hostId: userId,
      config,
      state: toPublicState(state),
      secret: toSecretState(state),
      password,
      listed,
    });
    if (created) return { roomId: id };
  }
  throw new GameError('busy', 'Could not allocate a table id, please retry');
}

export type TableOp =
  | { type: 'sit'; seat: number; buyIn: number }
  | { type: 'stand' }
  | { type: 'act'; action: PlayerAction; handNo?: number; phase?: string }
  | { type: 'sitout' }
  | { type: 'sitin' }
  | { type: 'addchips'; amount: number }
  | { type: 'tick' };

export interface TableOpResult {
  changed: boolean;
  version: number;
  state?: PublicState;
  myCards?: { handNo: number; seat: number; cards: string[] } | null;
}

function parseOp(raw: unknown): TableOp {
  if (!raw || typeof raw !== 'object') throw new GameError('bad_request', 'Missing action');
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case 'sit':
      return { type: 'sit', seat: Number(o.seat), buyIn: Number(o.buyIn) };
    case 'stand':
    case 'sitout':
    case 'sitin':
    case 'tick':
      return { type: o.type };
    case 'addchips':
      return { type: 'addchips', amount: Number(o.amount) };
    case 'act': {
      const a = (o.action ?? {}) as Record<string, unknown>;
      const t = a.type;
      if (t !== 'fold' && t !== 'check' && t !== 'call' && t !== 'bet' && t !== 'raise' && t !== 'allin')
        throw new GameError('bad_action', 'Unknown action');
      return {
        type: 'act',
        action: { type: t, amount: a.amount == null ? undefined : Number(a.amount) },
        handNo: o.handNo == null ? undefined : Number(o.handNo),
        phase: typeof o.phase === 'string' ? o.phase : undefined,
      };
    }
    default:
      throw new GameError('bad_request', 'Unknown table operation');
  }
}

export async function tableOp(
  repo: Repo,
  userId: string,
  roomIdRaw: unknown,
  rawOp: unknown,
  opts: ServiceOptions = {},
): Promise<TableOpResult> {
  const roomId = normalizeRoomId(roomIdRaw);
  const op = parseOp(rawOp);
  const rng = opts.rng ?? cryptoRng;

  // Identity is resolved outside the retry loop (it does not depend on table state).
  const profile = op.type === 'sit' || op.type === 'sitin' ? await repo.getProfile(userId) : null;
  if ((op.type === 'sit' || op.type === 'sitin') && !profile) throw new GameError('forbidden', 'Profile not found');
  if (op.type === 'sit') requireTerms(profile!);
  let memberChecked = false;

  const res = await mutateTable(
    repo,
    roomId,
    async (s, fx, now, rec) => {
      if (op.type === 'tick') return tick(s, fx, now, rng);

      // Every other operation first applies overdue timers so it acts on the true current state —
      // except a player's own action, which is accepted even if their clock just ran out.
      let changed = op.type === 'act' ? false : tick(s, fx, now, rng);

      switch (op.type) {
        case 'sit': {
          if (rec.hasPassword && !memberChecked) {
            if (!(await repo.isMember(roomId, userId)))
              throw new GameError('forbidden', 'Join the room with its password first');
            memberChecked = true;
          }
          if (profile!.chips < op.buyIn) throw new GameError('insufficient_chips', "You don't have enough chips for that buy-in");
          sitDown(
            s,
            fx,
            identityOf(userId, profile!),
            op.seat,
            op.buyIn,
            now,
            rng,
          );
          return true;
        }
        case 'stand':
          standUp(s, fx, userId, now);
          return true;
        case 'sitout':
          setSittingOut(s, fx, userId, true, now);
          return true;
        case 'sitin':
          if (profile) updateIdentity(s, identityOf(userId, profile));
          setSittingOut(s, fx, userId, false, now);
          return true;
        case 'addchips':
          addChips(s, fx, userId, op.amount, now);
          return true;
        case 'act': {
          if (op.handNo != null && op.handNo !== s.handNo) throw new GameError('stale', 'That hand is already over');
          if (op.phase != null && op.phase !== s.phase) throw new GameError('stale', 'The betting round already moved on');
          applyAction(s, fx, userId, op.action, now);
          changed = true;
          return changed;
        }
      }
      return changed;
    },
    opts,
  );

  if (op.type === 'tick') return { changed: res.changed, version: res.version };

  const seat = seatIndexOf(res.state, userId);
  const cards = seat >= 0 && res.state.seats[seat]?.inHand ? res.state.hole[String(seat)] : undefined;
  return {
    changed: res.changed,
    version: res.version,
    state: toPublicState(res.state),
    myCards: cards ? { handNo: res.state.handNo, seat, cards: cards.slice() } : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Account deletion                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Delete a player's account and data. They leave every table first (a hand in
 * progress finishes without them), then the login and everything linked to it
 * is removed.
 */
export async function deleteAccount(repo: Repo, userId: string, opts: ServiceOptions = {}) {
  for (const tableId of await repo.tablesOf(userId)) {
    try {
      const rec = await repo.loadTable(tableId);
      if (rec && isBlackjackTable(rec)) await leaveBlackjack(repo, userId, tableId, opts);
      else await tableOp(repo, userId, tableId, { type: 'stand' }, opts);
    } catch (e) {
      console.error('[stackd] could not stand up before deletion', tableId, e);
    }
  }
  await repo.deleteUser(userId);
}

/* ------------------------------------------------------------------------ */
/* Housekeeping                                                              */
/* ------------------------------------------------------------------------ */

export const JANITOR = {
  /** Tables with seated players and no activity for this long are closed and everyone cashed out. */
  idleCloseMs: 45 * 60 * 1000,
};

export async function runJanitor(repo: Repo, opts: ServiceOptions = {}) {
  const now = (opts.now ?? Date.now)();
  const idle = await repo.listTablesIdleSince(new Date(now - JANITOR.idleCloseMs).toISOString());
  let closed = 0;
  for (const id of idle) {
    try {
      const rec = await repo.loadTable(id);
      if (rec && isBlackjackTable(rec)) {
        if ((await closeBlackjackTable(repo, id, opts)).changed) closed++;
        continue;
      }
      const r = await mutateTable(
        repo,
        id,
        (s, fx, t) => {
          if (!s.seats.some(Boolean)) return false;
          closeTable(s, fx, t);
          return true;
        },
        opts,
      );
      if (r.changed) closed++;
    } catch (e) {
      console.error('[stackd] janitor failed for table', id, e);
    }
  }
  const cleanup = await repo.cleanup();
  return { closed, cleanup };
}
