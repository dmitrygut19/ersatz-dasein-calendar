import type { APIRoute } from 'astro';
import { finishConnect } from '../../../../lib/integration';
import { requestOrigin } from '../../../../lib/request-origin';

// Browser redirect endpoint: on success opens the calendar; on failure returns to the
// connect screen with a readable message instead of exposing provider internals.
export const GET: APIRoute = async ({ url, request, redirect }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error || !code || !state) return redirect('/admin?screen=connect-error');
  try {
    const status = await finishConnect(code, state, requestOrigin(request));
    return redirect(status.pendingMatches > 0 ? '/admin?screen=calendar&matches=1' : '/admin?screen=calendar');
  } catch {
    return redirect('/admin?screen=connect-error');
  }
};
