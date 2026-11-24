export const eventPlatforms = ['YouTube', 'Discord', 'Jitsi'] as const;
type Platform = typeof eventPlatforms[number];
const images: Record<Platform, string> = { YouTube: 'youtube.png', Discord: 'discord.svg', Jitsi: 'jitsi.svg' };

// An occurrence's link overrides its type's venue, so a recognized URL wins.
export function eventPlatform(event: { url: string; venue: string }) {
  let platform: Platform | undefined;
  let href = '';
  try {
    const url = new URL(event.url);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      href = url.href;
      const host = url.hostname.toLowerCase();
      const matches = (domain: string) => host === domain || host.endsWith('.' + domain);
      if (matches('youtube.com') || matches('youtu.be') || matches('youtube-nocookie.com')) platform = 'YouTube';
      else if (matches('discord.com') || matches('discord.gg') || matches('discordapp.com')) platform = 'Discord';
      else if (matches('jitsi.org') || matches('jit.si')) platform = 'Jitsi';
    }
  } catch { /* A missing link still allows a saved venue label. */ }
  platform ??= eventPlatforms.find(name => name.toLowerCase() === event.venue.trim().toLowerCase());
  return { label: platform ?? (href ? 'К событию' : ''), image: platform ? `/assets/platforms/${images[platform]}` : '', href };
}
