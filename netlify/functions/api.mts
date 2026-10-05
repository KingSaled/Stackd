/**
 * Stackd game API (Netlify Function).
 *
 * POST /.netlify/functions/api  { op: 'create' | 'table', ... }
 * Authorization: Bearer <Supabase access token>
 *
 * Every table mutation runs the authoritative poker engine server-side and is
 * committed atomically to Postgres; connected clients receive the new state via
 * Supabase Realtime.
 */
import { HttpError, toErrorResponse } from '../../server/errors';
import { createRoom, tableOp } from '../../server/service';
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
        const result = await createRoom(repo, userId, {
          name: body.name,
          config: (body.config ?? {}) as Record<string, number>,
          password: body.password,
          listed: body.listed,
        });
        return json(200, { ok: true, ...result, serverNow: Date.now() });
      }
      case 'table': {
        const result = await tableOp(repo, userId, body.roomId, body.action);
        return json(200, { ok: true, ...result, serverNow: Date.now() });
      }
      default:
        throw new HttpError(400, 'bad_request', 'Unknown operation');
    }
  } catch (e) {
    const { status, body } = toErrorResponse(e);
    return json(status, { ...body, serverNow: Date.now() });
  }
};
