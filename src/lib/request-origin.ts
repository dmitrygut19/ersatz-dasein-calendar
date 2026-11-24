// Render forwards requests to an internal HTTP URL. OAuth needs the browser's URL.
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.slice(0, -1);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  if (!['http', 'https'].includes(proto)) throw new Error('Invalid forwarded protocol.');
  return new URL(`${proto}://${host}`).origin;
}
