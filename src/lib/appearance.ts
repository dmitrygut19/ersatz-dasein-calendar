import { HttpError } from './http';
import tokens from '../../design/tokens.json';

export type Appearance = {
  theme: 'ordinary' | 'arena' | 'saturnalia';
  start: string; end: string; accent: string; text: string; bordered: boolean;
  buttonBackground?: string; buttonText?: string; buttonAccent?: string;
  coverMode?: 'illustration' | 'poster';
};

export function buttonDefaults(theme: string | null = 'ordinary') {
  const special = theme === 'saturnalia';
  return { background: special ? tokens.eventTheme.saturnalia.buttonBackground : tokens.color.primitive['brown-900'],
    text: special ? tokens.eventTheme.saturnalia.text : tokens.color.primitive['white-100'],
    accent: special ? tokens.eventTheme.saturnalia.accent : tokens.color.primitive['copper-700'] };
}

export function defaultAppearance(theme: string | null = 'ordinary'): Appearance {
  const special = theme === 'saturnalia';
  const palette = tokens.eventTheme.saturnalia;
  const arena = theme === 'arena' ? tokens.eventTheme.arena : null;
  const button = buttonDefaults(theme);
  return { theme: special ? 'saturnalia' : theme === 'arena' ? 'arena' : 'ordinary',
    start: special ? palette.backgroundStart : arena?.backgroundStart ?? tokens.color.primitive['white-100'],
    end: special ? palette.backgroundEnd : arena?.backgroundEnd ?? tokens.color.primitive['white-100'],
    accent: special ? palette.cellBorder : arena?.accent ?? tokens.color.primitive['copper-700'],
    text: special ? palette.text : tokens.color.primitive['brown-900'], bordered: true,
    buttonBackground: button.background, buttonText: button.text, buttonAccent: button.accent };
}

export function validateAppearance(value: unknown): Appearance | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(422, 'Проверьте оформление.');
  const raw = value as Record<string, unknown>;
  if (raw.coverMode !== undefined && !['illustration', 'poster'].includes(String(raw.coverMode))) {
    throw new HttpError(422, 'Выберите иллюстрацию или афишу.');
  }
  if (!['ordinary', 'arena', 'saturnalia'].includes(String(raw.theme)) || typeof raw.bordered !== 'boolean') {
    throw new HttpError(422, 'Проверьте тему и обводку.');
  }
  const color = (key: string) => {
    if (typeof raw[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw[key])) throw new HttpError(422, 'Цвет задаётся в формате #RRGGBB.');
    return raw[key].toUpperCase();
  };
  return { theme: raw.theme as Appearance['theme'], start: color('start'), end: color('end'),
    accent: color('accent'), text: color('text'), bordered: raw.bordered,
    ...(raw.buttonBackground === undefined ? {} : { buttonBackground: color('buttonBackground') }),
    ...(raw.buttonText === undefined ? {} : { buttonText: color('buttonText') }),
    ...(raw.buttonAccent === undefined ? {} : { buttonAccent: color('buttonAccent') }),
    ...(raw.coverMode === undefined ? {} : { coverMode: raw.coverMode as Appearance['coverMode'] }) };
}
