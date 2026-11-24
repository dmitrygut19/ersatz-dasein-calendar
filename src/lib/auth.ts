import { timingSafeEqual } from 'node:crypto';

// Test adapter only. Default deny also applies to the production build.
// The local launcher explicitly enables it and binds the server to loopback.
export function localExperimentEnabled() {
  return process.env.CALENDAR_EXPERIMENT === 'local'
    && (process.env.CALENDAR_EXPERIMENT_TOKEN?.length ?? 0) >= 32;
}

export function validToken(value: unknown) {
  if (!localExperimentEnabled() || typeof value !== 'string' || !value) return false;
  const expected = Buffer.from(process.env.CALENDAR_EXPERIMENT_TOKEN!);
  const provided = Buffer.from(value);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function isAdmin(request: Request) {
  const bearer = request.headers.get('authorization');
  const cookie = request.headers.get('cookie')?.split(';').map(x => x.trim())
    .find(x => x.startsWith('calendar_experiment='))?.slice('calendar_experiment='.length);
  return validToken(bearer?.startsWith('Bearer ') ? bearer.slice(7) : cookie);
}
