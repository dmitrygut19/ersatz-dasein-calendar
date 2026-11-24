// Deployment switches. Both default to the protected local mode.
// The former review flags (CALENDAR_PUBLIC_DEMO, CALENDAR_DEMO_REMOTE) are still
// honoured so that a host configured before 2026-11-25 keeps working unchanged.

/** Admin pages and APIs are open without login (until Telegram login is connected). */
export function adminOpen() {
  return process.env.CALENDAR_ADMIN_OPEN === '1' || process.env.CALENDAR_PUBLIC_DEMO === '1';
}

/** Requests to admin pages and APIs are accepted from a non-loopback host name. */
export function remoteAllowed() {
  return process.env.CALENDAR_ALLOW_REMOTE === '1' || process.env.CALENDAR_DEMO_REMOTE === '1';
}

/** When set, the admin cannot replace the community iCal feed with another source. */
export function lockedFeedUrl() {
  return process.env.CALENDAR_SHARED_FEED_URL || null;
}
