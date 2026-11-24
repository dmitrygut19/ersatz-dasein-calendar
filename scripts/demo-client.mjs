// Small cookie jar for independent review browsers in API checks.
const networkFetch = globalThis.fetch;
export function createDemoClient(base) {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    fetch: async (input, options = {}) => {
      if (!String(input).startsWith(base)) return networkFetch(input, options);
      const headers = new Headers(options.headers);
      if (cookie && !headers.has('Cookie')) headers.set('Cookie', cookie);
      const response = await networkFetch(input, { ...options, headers });
      const session = response.headers.getSetCookie().find(value => value.startsWith('calendar_demo_session='));
      if (session) cookie = session.split(';')[0];
      return response;
    },
  };
}
