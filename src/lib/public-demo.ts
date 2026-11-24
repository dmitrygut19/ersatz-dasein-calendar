// Explicit review environment only. Normal deployments keep their access guard.
export function publicDemoEnabled() { return process.env.CALENDAR_PUBLIC_DEMO === '1'; }
