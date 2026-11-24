// Background sync scheduler: polls any connected external source on an interval
// so changes in Google/Yandex appear in the admin within ~a minute while the
// server is running. Started lazily on first request; free-tier hosts sleep when
// idle, in which case the next request triggers the lazy-sync path instead.
import { syncNow } from './integration';
import { getDb } from './db';
import { externalSources } from './db/schema';

let timer: ReturnType<typeof setInterval> | null = null;
let lastTickAt: number | null = null;

export function syncSchedulerStatus() {
  return { running: Boolean(timer), intervalMs: Number(process.env.CALENDAR_SYNC_INTERVAL_MS ?? 60_000), lastTickAt };
}

export function ensureSyncScheduler() {
  if (timer) return;
  const intervalMs = Number(process.env.CALENDAR_SYNC_INTERVAL_MS ?? 60_000);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
  timer = setInterval(() => {
    lastTickAt = Date.now();
    try {
      const source = getDb().select().from(externalSources).all().at(0) ?? null;
      if (!source || source.status === 'syncing') return;
      const stale = !source.lastSyncAt || Date.now() - new Date(source.lastSyncAt).getTime() >= intervalMs;
      if (stale) syncNow().catch(() => { /* error state is surfaced in the integration panel */ });
    } catch {
      // Scheduler must never crash the server; next tick retries.
    }
  }, intervalMs);
  timer.unref?.();
}
