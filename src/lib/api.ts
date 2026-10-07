import type { PlayerAction, PublicState, TableConfig } from '../../shared/poker/types';
import type { BjAction, BjPublicState } from '../../shared/blackjack/types';
import { API_URL } from './config';
import { sampleClock } from './clock';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('unauthorized', 'Please sign in again', 401);
  const sentAt = Date.now();
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', 'Connection problem — check your internet and try again');
  }
  const receivedAt = Date.now();
  const json = (await res.json().catch(() => null)) as (Record<string, unknown> & { ok?: boolean }) | null;
  if (json && typeof json.serverNow === 'number') sampleClock(json.serverNow, sentAt, receivedAt);
  if (!json) {
    if (res.status === 404)
      throw new ApiError('no_api', 'Game server not found. Run the app with `netlify dev` (see README).', 404);
    throw new ApiError('server_error', `Server error (${res.status})`, res.status);
  }
  if (!res.ok || !json.ok) {
    throw new ApiError(String(json.error ?? 'error'), String(json.message ?? 'Something went wrong'), res.status);
  }
  return json as T;
}

export type TableAction =
  | { type: 'sit'; seat: number; buyIn: number }
  | { type: 'stand' }
  | { type: 'act'; action: PlayerAction; handNo: number; phase: string }
  | { type: 'sitout' }
  | { type: 'sitin' }
  | { type: 'addchips'; amount: number }
  | { type: 'tick' };

export interface TableActionResponse {
  ok: true;
  changed: boolean;
  version: number;
  state?: PublicState;
  myCards?: { handNo: number; seat: number; cards: string[] } | null;
}

export function tableAction(roomId: string, action: TableAction) {
  return call<TableActionResponse>({ op: 'table', roomId, action });
}

export interface CreateRoomRequest {
  name: string;
  config: Partial<TableConfig>;
  password?: string;
  listed: boolean;
}

export function createRoom(req: CreateRoomRequest) {
  return call<{ ok: true; roomId: string }>({ op: 'create', ...req });
}

/** Permanently delete the signed-in account (leaves all tables first). */
export async function deleteAccount(): Promise<void> {
  await call({ op: 'deleteAccount', confirm: 'DELETE' });
}

/* ------------------------------------------------------------------------ */
/* Blackjack                                                                 */
/* ------------------------------------------------------------------------ */

export type BlackjackAction =
  | { type: 'sit'; seat: number }
  | { type: 'stand' }
  | { type: 'bet'; amount: number }
  | { type: 'clear' }
  | { type: 'act'; action: BjAction; round: number }
  | { type: 'tick' };

export interface BlackjackActionResponse {
  ok: true;
  changed: boolean;
  version: number;
  state?: BjPublicState;
}

export function blackjackAction(roomId: string, action: BlackjackAction) {
  return call<BlackjackActionResponse>({ op: 'table', game: 'blackjack', roomId, action });
}

export function createBlackjackRoom(req: { name: string; turnSeconds: number; password?: string; listed: boolean }) {
  return call<{ ok: true; roomId: string }>({
    op: 'create',
    game: 'blackjack',
    name: req.name,
    config: { turnSeconds: req.turnSeconds },
    password: req.password,
    listed: req.listed,
  });
}
