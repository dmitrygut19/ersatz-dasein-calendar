export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new HttpError(415, 'Ожидается JSON.');
  }
  const raw = await request.text();
  if (raw.length > 16_384) throw new HttpError(413, 'Слишком большой запрос.');
  try { return JSON.parse(raw); }
  catch { throw new HttpError(400, 'Некорректный JSON.'); }
}

export async function handle(action: () => unknown | Promise<unknown>) {
  try { return json(await action()); }
  catch (error) {
    if (error instanceof HttpError) return json({ message: error.message }, error.status);
    console.error('Experiment server operation failed:', error);
    return json({ message: 'Не удалось выполнить действие. Повторите попытку.' }, 500);
  }
}
