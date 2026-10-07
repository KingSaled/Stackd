/**
 * Stackd game API (Netlify Function).
 *
 * POST /.netlify/functions/api  { op: 'create' | 'table' | 'syncCatalog' | 'deleteAccount', game?: 'blackjack', ... }
 * Authorization: Bearer <Supabase access token>
 *
 * Every table mutation runs the authoritative poker engine server-side and is
 * committed atomically to Postgres; connected clients receive the new state via
 * Supabase Realtime.
 */
import { HttpError, toErrorResponse } from '../../server/errors';
import { createRoom, deleteAccount, tableOp } from '../../server/service';
import { blackjackOp, createBlackjackRoom } from '../../server/blackjack';
import { syncCatalog } from '../../server/catalog';
import { SupabaseRepo, authenticate, getAdminClient } from '../../server/supabase';

const MAX_BODY = 16 * 1024;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export default async (req: Request) => {
  if (req.method === 'GET') return json(200, { ok: true, service: 'stackd', serverNow: Date.now() });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed', message: 'Use POST' });

  try {
    const text = await req.text();
    if (text.length > MAX_BODY) throw new HttpError(413, 'too_large', 'Request too large');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text || '{}');
    } catch {
      throw new HttpError(400, 'bad_request', 'Invalid JSON');
    }

    const client = getAdminClient();
    const userId = await authenticate(req, client);
    const repo = new SupabaseRepo(client);

    switch (body.op) {
      case 'create': {
        if (body.game === 'blackjack') {
          const result = await createBlackjackRoom(repo, userId, {
            name: body.name,
            config: (body.config ?? {}) as Record<string, unknown>,
            password: body.password,
          });
          return json(200, { ok: true, ...result, serverNow: Date.now() });
        }
        const result = await createRoom(repo, userId, {
          name: body.name,
          config: (body.config ?? {}) as Record<string, number>,
          password: body.password,
        });
        return json(200, { ok: true, ...result, serverNow: Date.now() });
      }
      case 'table': {
        // The client says which game the table plays; each service also checks the stored table.
        const result =
          body.game === 'blackjack'
            ? await blackjackOp(repo, userId, body.roomId, body.action)
            : await tableOp(repo, userId, body.roomId, body.action);
        return json(200, { ok: true, ...result, serverNow: Date.now() });
      }
      case 'syncCatalog': {
        // Copies shop items and achievements from the code into the database (idempotent).
        const result = await syncCatalog(repo);
        return json(200, { ok: true, ...result, serverNow: Date.now() });
      }
      case 'deleteAccount': {
        if (body.confirm !== 'DELETE') throw new HttpError(400, 'bad_request', 'Deletion was not confirmed');
        await deleteAccount(repo, userId);
        return json(200, { ok: true, serverNow: Date.now() });
      }
      default:
        throw new HttpError(400, 'bad_request', 'Unknown operation');
    }
  } catch (e) {
    const { status, body } = toErrorResponse(e);
    return json(status, { ...body, serverNow: Date.now() });
  }
};
