import { randomBytes } from 'node:crypto';
import { createDemoDatabase, resetDemoImports } from './db';

export const DEMO_COOKIE = 'calendar_demo_session';
const TTL = 30 * 60_000;
const MAX_SESSIONS = 16;
type Session = { id: string; db: ReturnType<typeof createDemoDatabase>; lastSeen: number; active: number; lastSyncAttempt: number };
const sessions = new Map<string, Session>();

function remove(session: Session) {
  session.db.$client.close();
  sessions.delete(session.id);
}

export function demoSession(id?: string) {
  const now = Date.now();
  for (const session of sessions.values()) if (!session.active && now - session.lastSeen > TTL) remove(session);
  let session = id ? sessions.get(id) : undefined;
  if (session) { session.lastSeen = now; return session; }
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.values()].filter(item => !item.active).sort((a,b) => a.lastSeen - b.lastSeen)[0];
    if (oldest) remove(oldest);
    else throw new Error('Demo sessions are busy. Retry shortly.');
  }
  const key = randomBytes(32).toString('hex');
  session = { id: key, db: createDemoDatabase(), lastSeen: now, active: 0, lastSyncAttempt: 0 };
  sessions.set(key, session);
  return session;
}

export function resetDemoSession(session: Session) {
  // Invalidate in-flight syncs through deletion of their source row.
  resetDemoImports(session.db);
  session.lastSyncAttempt = 0;
}

const cleanup = setInterval(() => {
  for (const session of sessions.values()) if (!session.active && Date.now()-session.lastSeen > TTL) remove(session);
}, 60_000);
cleanup.unref();
