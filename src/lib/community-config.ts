// Opening the subscription page never changes the participant's permissions.
export const communityConfig = { subscriptionUrl: 'https://boosty.to/m0rtymerr' };
export const safeWebUrl = (value: string | null | undefined) => {
  try { const url = new URL(value ?? ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
};
