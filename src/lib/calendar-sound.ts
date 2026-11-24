const base = '/assets/calendar/sounds/';

const sounds = {
  'accent-hover': ['accent-hover-1.mp3'],
  'small-hover': ['small-hover.mp3'],
  'card-click': ['small-click.mp3'],
} as const;

export type CalendarSound = keyof typeof sounds;

const cache = new Map<string, HTMLAudioElement>();
let prepared = false, listening = false;

function createAudio(file: string) {
  const audio = new Audio(base + file);
  audio.preload = 'auto';
  audio.volume = 0.5;
  return audio;
}

export function prepareCalendarSounds() {
  if (prepared || typeof document === 'undefined') return;
  prepared = true;
  for (const files of Object.values(sounds)) {
    for (const file of files) {
      const audio = createAudio(file);
      cache.set(file, audio);
      audio.load();
    }
  }
}

export function unlockCalendarSounds() { prepareCalendarSounds(); }

export function startCalendarSoundInput() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  for (const event of ['pointerdown', 'touchstart', 'keydown'] as const) {
    document.addEventListener(event, unlockCalendarSounds, { capture: true, passive: true });
  }
}

export function stopCalendarSoundInput() {
  if (!listening || typeof document === 'undefined') return;
  listening = false;
  for (const event of ['pointerdown', 'touchstart', 'keydown'] as const) {
    document.removeEventListener(event, unlockCalendarSounds, { capture: true });
  }
}

export function playCalendarSound(kind: CalendarSound) {
  if (!prepared || typeof window === 'undefined') return;
  const file = sounds[kind][0];
  const audio = cache.get(file) ?? createAudio(file);
  cache.set(file, audio);
  audio.pause();
  audio.currentTime = 0;
  const playback = audio.play();
  if (playback) playback.catch(() => { /* browsers may block audio before a user gesture */ });
}

export function playCalendarSoundAttribute(value: string | null | undefined) {
  if (value && Object.prototype.hasOwnProperty.call(sounds, value)) playCalendarSound(value as CalendarSound);
}
