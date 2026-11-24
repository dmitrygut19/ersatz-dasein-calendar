// Provider text can contain HTML, prose and several links. Prefer a meeting
// platform over supporting material, and keep calendar-source links separate.
export function isCalendarSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === 'calendar.google.com'
      || (url.hostname === 'www.google.com' && url.pathname.startsWith('/calendar'))
      || /^calendar\.yandex\.(ru|com)$/.test(url.hostname);
  } catch { return false; }
}

const platforms = ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'discord.com', 'discord.gg', 'discordapp.com',
  'jitsi.org', 'jit.si', 'meet.google.com', 'zoom.us', 'zoom.com', 'teams.microsoft.com', 'teams.live.com',
  'webex.com', 't.me', 'telemost.yandex.ru', 'telemost.360.yandex.ru', 'vk.com', 'vkvideo.ru', 'twitch.tv', 'rutube.ru'];
const platformHost = (host: string) => platforms.some(domain => host === domain || host.endsWith('.' + domain));
const decodeEntities = (text: string) => text.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
  const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  const code = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
});

export function participationUrl(...fields: (string | null | undefined)[]) {
  const candidates: string[] = [];
  for (const field of fields) {
    const text = decodeEntities(field ?? '');
    // Bare platform addresses are common when somebody pastes an invitation.
    for (const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'«»]+|(?<![\w@./-])(?:[a-z\d-]+\.)*(?:youtu\.be|youtube\.com|discord\.gg|discord\.com|jit\.si|jitsi\.org|meet\.google\.com|zoom\.us|zoom\.com|t\.me|telemost\.yandex\.ru|teams\.microsoft\.com)\/[^\s<>"'«»]+/gi)) {
      let value = match[0].replace(/[.,;:!?…]+$/, '');
      // Preserve balanced parentheses that are part of the path/query.
      for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
        while (value.endsWith(close) && value.split(close).length > value.split(open).length) value = value.slice(0, -1);
      }
      try {
        const url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
        if (url.username || url.password || isCalendarSourceUrl(url.href)) continue;
        candidates.push(url.href);
      } catch { /* Ignore malformed pasted links. */ }
    }
  }
  return candidates.find(value => platformHost(new URL(value).hostname)) ?? candidates[0] ?? '';
}
