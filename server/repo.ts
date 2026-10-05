import type { PublicState, SecretState } from '../shared/poker/types';

export interface StoredTable {
  id: string;
  name: string;
  hostId: string | null;
  version: number;
  hasPassword: boolean;
  state: PublicState;
  secret: SecretState;
}

export interface CommitPayload {
  state: PublicState;
  secret: SecretState;
  seats: { user_id: string; seat: number; stack: number }[];
  cards: { user_id: string; hand_no: number; seat: number; cards: string[] }[] | null;
  wallet: { user_id: string; delta: number }[];
  stats: { user_id: string; played: number; won: number; biggest_pot: number; best_hand: number }[];
  status: 'waiting' | 'playing';
  playerCount: number;
}

export interface ProfileInfo {
  id: string;
  display_name: string;
  avatar: string;
  color: string;
  chips: number;
}

export interface CreateTableInput {
  id: string;
  name: string;
  hostId: string;
  config: unknown;
  state: PublicState;
  secret: SecretState;
  password: string | null;
  listed: boolean;
}

/** Persistence boundary used by the table service (Supabase in production, in-memory in tests). */
export interface Repo {
  loadTable(id: string): Promise<StoredTable | null>;
  /** Throws VersionConflict when `version` is stale and GameError('insufficient_chips') on overdrawn wallets. */
  commitTable(id: string, version: number, payload: CommitPayload): Promise<number>;
  /** Returns false when the id is already taken. */
  createTable(input: CreateTableInput): Promise<boolean>;
  getProfile(userId: string): Promise<ProfileInfo | null>;
  isMember(tableId: string, userId: string): Promise<boolean>;
  listTablesIdleSince(isoTime: string): Promise<string[]>;
  cleanup(): Promise<unknown>;
}
