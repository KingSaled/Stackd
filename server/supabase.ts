import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GameError } from '../shared/poker/engine';
import type { SecretState } from '../shared/poker/types';
import { HttpError, VersionConflict } from './errors';
import type { CatalogRows, CommitPayload, CreateTableInput, ProfileInfo, Repo, StoredTable } from './repo';
import type { BjRoundPayload, HandPayload } from './hands';

function env(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function supabaseUrl() {
  return env('SUPABASE_URL', 'SUPABASE_DATABASE_URL', 'VITE_SUPABASE_URL');
}

let admin: SupabaseClient | null = null;

/** Service-role client (bypasses RLS). Only ever used inside Netlify Functions. */
export function getAdminClient(): SupabaseClient {
  if (admin) return admin;
  const url = supabaseUrl();
  const key = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
  if (!url || !key) {
    throw new HttpError(
      503,
      'not_configured',
      'Server is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables.',
    );
  }
  admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'stackd-functions' } },
  });
  return admin;
}

/* ------------------------------------------------------------------------ */
/* Authentication                                                            */
/* ------------------------------------------------------------------------ */

const tokenCache = new Map<string, { userId: string; until: number }>();

function tokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Resolve the calling user from the Supabase access token in the Authorization header. */
export async function authenticate(req: Request, client: SupabaseClient): Promise<string> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'unauthorized', 'Please sign in');
  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && cached.until > now) return cached.userId;

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'unauthorized', 'Your session expired — please sign in again');
  const exp = tokenExpiry(token) ?? now + 5 * 60_000;
  tokenCache.set(token, { userId: data.user.id, until: Math.min(exp, now + 10 * 60_000) });
  if (tokenCache.size > 500) {
    for (const [k, v] of tokenCache) if (v.until <= now) tokenCache.delete(k);
    if (tokenCache.size > 500) tokenCache.clear();
  }
  return data.user.id;
}

/* ------------------------------------------------------------------------ */
/* Repository                                                                */
/* ------------------------------------------------------------------------ */

function messageOf(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'object' && error && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
}

export class SupabaseRepo implements Repo {
  constructor(private db: SupabaseClient) {}

  async loadTable(id: string): Promise<StoredTable | null> {
    const { data, error } = await this.db.rpc('load_table', { p_id: id });
    if (error) throw new Error(`load_table failed: ${messageOf(error)}`);
    if (!data) return null;
    const secret = (data.secret ?? {}) as Partial<SecretState>;
    return {
      id: data.id,
      name: data.name,
      hostId: data.host_id ?? null,
      version: data.version,
      hasPassword: !!data.has_password,
      state: data.state,
      // Blackjack keeps its shoe and hole card as-is. For poker, keep the bots' hidden skill
      // levels: dropping them made every bot play the default brain.
      secret:
        data.state?.game === 'blackjack'
          ? (data.secret ?? {})
          : { deck: secret.deck ?? [], hole: secret.hole ?? {}, bots: secret.bots ?? {} },
    };
  }

  async commitTable(id: string, version: number, p: CommitPayload): Promise<number> {
    const { data, error } = await this.db.rpc('commit_table', {
      p_id: id,
      p_version: version,
      p_state: p.state,
      p_secret: p.secret,
      p_seats: p.seats,
      p_cards: p.cards,
      p_wallet: p.wallet,
      p_stats: p.stats,
      p_status: p.status,
      p_player_count: p.playerCount,
    });
    if (error) {
      const msg = messageOf(error);
      if (msg.includes('version_conflict')) throw new VersionConflict();
      if (msg.includes('insufficient_chips'))
        throw new GameError('insufficient_chips', "You don't have enough chips in your wallet");
      throw new Error(`commit_table failed: ${msg}`);
    }
    return Number(data);
  }

  async createTable(input: CreateTableInput): Promise<boolean> {
    const { error } = await this.db.rpc('create_table', {
      p_id: input.id,
      p_name: input.name,
      p_host: input.hostId,
      p_config: input.config,
      p_state: input.state,
      p_secret: input.secret,
      p_password: input.password,
      p_listed: input.listed,
    });
    if (!error) return true;
    const msg = messageOf(error);
    if ((error as { code?: string }).code === '23505' || msg.includes('duplicate key')) return false;
    throw new Error(`create_table failed: ${msg}`);
  }

  async getProfile(userId: string): Promise<ProfileInfo | null> {
    // `*` so the lookup keeps working whether or not the newest schema columns exist yet.
    const { data, error } = await this.db.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw new Error(`profile lookup failed: ${messageOf(error)}`);
    if (!data) return null;
    return {
      id: data.id,
      display_name: data.display_name,
      avatar: data.avatar,
      color: data.color,
      chips: Number(data.chips),
      frame: data.frame ?? null,
      backdrop: data.backdrop ?? null,
      ...('terms_version' in data ? { terms_version: data.terms_version ?? null } : {}),
    };
  }

  async isMember(tableId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('table_members')
      .select('user_id')
      .eq('table_id', tableId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`membership lookup failed: ${messageOf(error)}`);
    return !!data;
  }

  async listTablesIdleSince(isoTime: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('tables')
      .select('id')
      .gt('player_count', 0)
      .lt('updated_at', isoTime)
      .limit(200);
    if (error) throw new Error(`idle table lookup failed: ${messageOf(error)}`);
    return (data ?? []).map((r) => r.id as string);
  }

  async recordHands(hands: HandPayload[]): Promise<void> {
    if (hands.length === 0) return;
    const { error } = await this.db.rpc('record_hands', { p_hands: hands });
    if (error) throw new Error(`record_hands failed: ${messageOf(error)}`);
  }

  async recordBlackjackRounds(rounds: BjRoundPayload[]): Promise<void> {
    if (rounds.length === 0) return;
    const { error } = await this.db.rpc('record_bj_rounds', { p_rounds: rounds });
    if (error) throw new Error(`record_bj_rounds failed: ${messageOf(error)}`);
  }

  async tablesOf(userId: string): Promise<string[]> {
    const { data, error } = await this.db.from('table_seats').select('table_id').eq('user_id', userId);
    if (error) throw new Error(`seat lookup failed: ${messageOf(error)}`);
    return (data ?? []).map((r) => r.table_id as string);
  }

  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.db.auth.admin.deleteUser(userId);
    if (error) throw new Error(`account deletion failed: ${messageOf(error)}`);
  }

  async upsertCatalog(rows: CatalogRows): Promise<void> {
    const a = await this.db.from('cosmetics').upsert(rows.cosmetics, { onConflict: 'id' });
    if (a.error) throw new Error(`cosmetics sync failed: ${messageOf(a.error)}`);
    const b = await this.db.from('achievements').upsert(rows.achievements, { onConflict: 'id' });
    if (b.error) throw new Error(`achievements sync failed: ${messageOf(b.error)}`);
    // Challenges arrived with a later schema.sql: a database that hasn't run it yet just skips them.
    const c = await this.db.from('challenges').upsert(rows.challenges, { onConflict: 'id' });
    if (c.error && !/relation|schema cache|does not exist/i.test(messageOf(c.error))) {
      throw new Error(`challenges sync failed: ${messageOf(c.error)}`);
    }
  }

  async cleanup(): Promise<unknown> {
    const { data, error } = await this.db.rpc('cleanup_stale_data');
    if (error) throw new Error(`cleanup failed: ${messageOf(error)}`);
    return data;
  }
}
