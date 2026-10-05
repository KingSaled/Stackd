import { GameError } from '../shared/poker/engine';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class VersionConflict extends Error {
  constructor() {
    super('version_conflict');
    this.name = 'VersionConflict';
  }
}

export { GameError };

export function toErrorResponse(e: unknown): { status: number; body: { ok: false; error: string; message: string } } {
  if (e instanceof HttpError) return { status: e.status, body: { ok: false, error: e.code, message: e.message } };
  if (e instanceof GameError) {
    const status = e.code === 'not_found' ? 404 : e.code === 'forbidden' ? 403 : e.code === 'busy' ? 409 : 400;
    return { status, body: { ok: false, error: e.code, message: e.message } };
  }
  console.error('[stackd] unexpected error', e);
  return { status: 500, body: { ok: false, error: 'server_error', message: 'Something went wrong. Please try again.' } };
}
