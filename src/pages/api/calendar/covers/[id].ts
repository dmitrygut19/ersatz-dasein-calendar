import type { APIRoute } from 'astro';
import { getCover } from '../../../../lib/covers';
export const GET: APIRoute = ({ params }) => {
  const image = getCover(params.id ?? '');
  return image ? new Response(new Uint8Array(image.content), { headers: { 'Content-Type': image.mime } }) : new Response(null, { status: 404 });
};
