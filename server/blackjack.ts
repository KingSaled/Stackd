/**
 * Blackjack table service. Same guarantees as the poker service: one
 * authoritative engine transition per request, committed atomically with an
 * optimistic version check (reload and retry on conflict). Bets and payouts
 * move chips straight between the player's wallet and the table.
 */
import {
  bjAct,
  bjClearBet,
  bjCloseTable,
  bjPlaceBet,
  bjSeatOf,
  bjSitDown,
  bjStandUp,
  bjTick,
  chipsOnTable,
  createBjState,
  mergeBjState,
  newBjEffects,
  sanitizeBjConfig,
  toBjPublic,
  toBjSecret,
  type BjAction,
  type BjEffects,
  type BjPublicState,
  type BjSecretState,
  type BjState,
} from '../shared/blackjack';
import { GameError } from '../shared/poker/engine';
import { VersionConflict } from './errors';
import type { CommitPayload, ProfileInfo, Repo, StoredTable } from './repo';
import { cryptoRng, generateRoomId, isBlackjackTable, normalizeRoomId, type ServiceOptions } from './common';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function requireTerms(profile: ProfileInfo) {
  if ('terms_version' in profile && !profile.terms_version)
    throw new GameError('terms_required', 'Please accept the Terms of Service to play');
}

function identityOf(userId: string, p: ProfileInfo) {
  return { userId, name: p.display_name, avatar: p.avatar, color: p.color, frame: p.frame ?? null, backdrop: p.backdrop ?? null };
}

export function buildBjCommit(s: BjState, fx: BjEffects): CommitPayload {
  const seats: CommitPayload['seats'] = [];
  s.seats.forEach((seat, i) => {
    // The seat's "stack" is whatever the player has on the table right now (pending bet or stakes in play).
    if (seat) seats.push({ user_id: seat.userId, seat: i, stack: chipsOnTable(seat) });
  });
  return {
    state: toBjPublic(s),
    secret: toBjSecret(s),
    seats,
    cards: null,
    wallet: Object.entries(fx.wallet)
      .filter(([, d]) => d !== 0)
      .map(([user_id, delta]) => ({ user_id, delta })),
    stats: [],
    status: s.phase === 'waiting' ? 'waiting' : 'playing',
    playerCount: seats.length,
  };
}

type BjMutator = (s: BjState, fx: BjEffects, now: number, rec: StoredTable) => boolean | void | Promise<boolean | void>;

export async function mutateBlackjack(repo: Repo, roomId: string, mutator: BjMutator, opts: ServiceOptions = {}) {
  const now = opts.now ?? Date.now;
  for (let attempt = 0; attempt < 8; attempt++) {
    const rec = await repo.loadTable(roomId);
    if (!rec) throw new GameError('not_found', 'Table not found');
    if (!isBlackjackTable(rec)) throw new GameError('wrong_game', "That isn't a blackjack table");
    const s = mergeBjState(rec.state as unknown as BjPublicState, rec.secret as unknown as BjSecretState);
    const fx = newBjEffects();
    const result = await mutator(s, fx, now(), rec);
    if (result === false) return { changed: false, version: rec.version, state: s };
    try {
      const version = await repo.commitTable(roomId, rec.version, buildBjCommit(s, fx));
      return { changed: true, version, state: s };
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

export interface CreateBjInput {
  name?: unknown;
  config?: Record<string, unknown>;
  password?: unknown;
  listed?: unknown;
}

export async function createBlackjackRoom(repo: Repo, userId: string, input: CreateBjInput, opts: ServiceOptions = {}) {
  const profile = await repo.getProfile(userId);
  if (!profile) throw new GameError('forbidden', 'Profile not found');
  requireTerms(profile);
  const config = sanitizeBjConfig({ turnSeconds: Number(input.config?.turnSeconds) });
  let name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) name = `${profile.display_name}'s blackjack`;
  name = name.slice(0, 40);
  const password = typeof input.password === 'string' && input.password.length > 0 ? input.password : null;
  if (password && password.length > 64) throw new GameError('bad_config', 'Password is too long');
  const listed = input.listed === true && !password;

  const now = (opts.now ?? Date.now)();
  const state = createBjState(config, now);
  state.logSeq = 1;
  state.log.push({ id: 1, kind: 'info', text: `${profile.display_name} opened the table`, at: now });

  for (let attempt = 0; attempt < 6; attempt++) {
    const id = generateRoomId(opts.rng ?? cryptoRng);
    const created = await repo.createTable({
      id,
      name,
      hostId: userId,
      config,
      state: toBjPublic(state),
      secret: toBjSecret(state),
      password,
      listed,
    });
    if (created) return { roomId: id };
  }
  throw new GameError('busy', 'Could not allocate a table id, please retry');
}

export type BjOp =
  | { type: 'sit'; seat: number }
  | { type: 'stand' }
  | { type: 'bet'; amount: number }
  | { type: 'clear' }
  | { type: 'act'; action: BjAction; round?: number }
  | { type: 'tick' };

function parseBjOp(raw: unknown): BjOp {
  if (!raw || typeof raw !== 'object') throw new GameError('bad_request', 'Missing action');
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case 'sit':
      return { type: 'sit', seat: Number(o.seat) };
    case 'stand':
    case 'clear':
    case 'tick':
      return { type: o.type };
    case 'bet':
      return { type: 'bet', amount: Number(o.amount) };
    case 'act': {
      const a = o.action;
      if (a !== 'hit' && a !== 'stand' && a !== 'double' && a !== 'split') throw new GameError('bad_action', 'Unknown action');
      return { type: 'act', action: a, round: o.round == null ? undefined : Number(o.round) };
    }
    default:
      throw new GameError('bad_request', 'Unknown table operation');
  }
}

export interface BjOpResult {
  changed: boolean;
  version: number;
  state?: BjPublicState;
}

export async function blackjackOp(repo: Repo, userId: string, roomIdRaw: unknown, rawOp: unknown, opts: ServiceOptions = {}): Promise<BjOpResult> {
  const roomId = normalizeRoomId(roomIdRaw);
  const op = parseBjOp(rawOp);
  const rng = opts.rng ?? cryptoRng;
  const profile = op.type === 'sit' ? await repo.getProfile(userId) : null;
  if (op.type === 'sit') {
    if (!profile) throw new GameError('forbidden', 'Profile not found');
    requireTerms(profile);
  }
  let memberChecked = false;

  const res = await mutateBlackjack(
    repo,
    roomId,
    async (s, fx, now, rec) => {
      if (op.type === 'tick') return bjTick(s, fx, rng, now);
      // Overdue timers first, except for a player's own move (accepted even if their clock just ran out).
      let changed = op.type === 'act' ? false : bjTick(s, fx, rng, now);
      switch (op.type) {
        case 'sit':
          if (rec.hasPassword && !memberChecked) {
            if (!(await repo.isMember(roomId, userId))) throw new GameError('forbidden', 'Join the room with its password first');
            memberChecked = true;
          }
          bjSitDown(s, identityOf(userId, profile!), op.seat, now);
          return true;
        case 'stand':
          bjStandUp(s, fx, userId, rng, now);
          return true;
        case 'bet':
          bjPlaceBet(s, fx, userId, op.amount, rng, now);
          return true;
        case 'clear':
          bjClearBet(s, fx, userId, now);
          return true;
        case 'act':
          if (op.round != null && op.round !== s.roundNo) throw new GameError('stale', 'That round is already over');
          bjAct(s, fx, userId, op.action, rng, now);
          changed = true;
          return changed;
      }
      return changed;
    },
    opts,
  );
  if (op.type === 'tick') return { changed: res.changed, version: res.version };
  return { changed: res.changed, version: res.version, state: toBjPublic(res.state) };
}

/** Janitor: return every chip on an abandoned blackjack table and clear its seats. */
export async function closeBlackjackTable(repo: Repo, roomId: string, opts: ServiceOptions = {}) {
  return mutateBlackjack(
    repo,
    roomId,
    (s, fx, now) => {
      if (!s.seats.some(Boolean)) return false;
      bjCloseTable(s, fx, now);
      return true;
    },
    opts,
  );
}

/** Leave a blackjack table (account deletion). */
export async function leaveBlackjack(repo: Repo, userId: string, roomId: string, opts: ServiceOptions = {}) {
  return mutateBlackjack(
    repo,
    roomId,
    (s, fx, now) => {
      if (bjSeatOf(s, userId) < 0) return false;
      bjStandUp(s, fx, userId, opts.rng ?? cryptoRng, now);
      return true;
    },
    opts,
  );
}
