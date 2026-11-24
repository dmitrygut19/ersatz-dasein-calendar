import type { APIRoute } from 'astro';
import { handle, readJson } from '../../../lib/http';
import { uploadCover, galleryCovers, removeGalleryCover } from '../../../lib/covers';
export const GET: APIRoute = () => handle(() => ({covers:galleryCovers()}));
export const DELETE: APIRoute = ({request}) => handle(async () => removeGalleryCover(await readJson(request)));
export const POST: APIRoute = ({ request }) => handle(() => uploadCover(request));
