import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { coverImages, calendarSettings } from './db/schema';
import { HttpError } from './http';
import { coverExamples } from './cover-examples';
import { isLodgeArtworkPath } from './lodge-icons';

const prefix = '/api/calendar/covers/';
const galleryKey = 'cover_gallery_hidden';
function hiddenCovers(): string[] {
  const raw = getDb().select().from(calendarSettings).where(eq(calendarSettings.key, galleryKey)).get()?.value;
  return raw ? JSON.parse(raw) : [];
}
export function galleryCovers() {
  const hidden = new Set(hiddenCovers());
  const options = [
    {path:'/assets/panel/2a38c.png',name:'Сатурналии'},
    {path:'/assets/panel/a5ff5.png',name:'Конгресс'},
    {path:'/assets/panel/6713c.png',name:'Дазайн-арена'},
    ...coverExamples,
    ...getDb().select({id:coverImages.id}).from(coverImages).all().map((row,index)=>({path:prefix+row.id,name:`Загруженная обложка ${index+1}`})),
  ];
  return options.filter((option,index)=>!hidden.has(option.path)&&options.findIndex(item=>item.path===option.path)===index);
}
export function removeGalleryCover(input: unknown) {
  const value = (input as {coverPath?:unknown} | null)?.coverPath;
  if (typeof value !== 'string' || !validCover(value)) throw new HttpError(422,'Выберите обложку из галереи.');
  // Removal affects selection only. Assigned covers and public asset URLs stay valid.
  const db=getDb();
  db.transaction(()=>{
    const valueSet=[...new Set([...hiddenCovers(),value])];
    db.insert(calendarSettings).values({key:galleryKey,value:JSON.stringify(valueSet)}).onConflictDoUpdate({target:calendarSettings.key,set:{value:JSON.stringify(valueSet)}}).run();
  });
  return {covers:galleryCovers()};
}
export function getCover(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return undefined;
  return getDb().select().from(coverImages).where(eq(coverImages.id, id)).get();
}
export function validCover(value: string) {
  return ['/assets/panel/a5ff5.png', '/assets/panel/2a38c.png', '/assets/panel/6713c.png', '/assets/cover-examples/antique-poster.jpg'].includes(value)
    || ['columns','lyre','philosopher','saturnalia'].some(name => value === `/assets/event-covers/community-demo/${name}.png`)
    || coverExamples.some(example => example.path === value)
    || isLodgeArtworkPath(value)
    || (value.startsWith(prefix) && Boolean(getCover(value.slice(prefix.length))));
}
export async function uploadCover(request: Request) {
  const max = 2_000_000;
  if (Number(request.headers.get('content-length')) > max) throw new HttpError(413, 'Выберите изображение до 2 МБ.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(422, 'Выберите изображение.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new HttpError(413, 'Выберите изображение до 2 МБ.'); }
    chunks.push(value);
  }
  const content = Buffer.concat(chunks);
  const mime = content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : content[0] === 255 && content[1] === 216 && content[2] === 255 ? 'image/jpeg'
    : content.toString('ascii', 0, 4) === 'RIFF' && content.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
  if (!mime) throw new HttpError(422, 'Поддерживаются PNG, JPEG и WebP.');
  const id = randomUUID();
  getDb().insert(coverImages).values({ id, mime, content }).run();
  return { coverPath: prefix + id };
}
