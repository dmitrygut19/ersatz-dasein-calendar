// Confirmed directory IDs (0008_admin_event_settings.sql), never display-name matching.
// User confirmed that Sequencers is the existing priesthood entry.
const emblems: Record<string, string> = {
  priesthood: 'sequencers',
  'tech-priesthood': 'technopriests',
  gambling: 'gambling',
  atemporal: 'atemporal',
  mercenaries: 'ship',
  capitalists: 'ship',
  students: 'students-comrades',
  comrades: 'students-comrades',
};
export function lodgeIconUrl(id: string, savedUrl: string | null) {
  return savedUrl || (Object.hasOwn(emblems, id) ? `/assets/lodges/${emblems[id]}.svg` : null);
}
export function lodgeCoverUrl(id: string) {
  return Object.hasOwn(emblems,id) ? `/assets/lodge-covers/${emblems[id]}.svg` : null;
}
export function isLodgeArtworkPath(value: string) {
  return Object.values(emblems).some(name=>value===`/assets/lodges/${name}.svg` || value===`/assets/lodge-covers/${name}.svg`);
}

// Confirmed bindings first; extra supplied artwork is named by subject, never auto-assigned.
export const lodgeCoverExamples = [
  ['priesthood', 'Жречество — Секвенсоры'],
  ['tech-priesthood', 'Техножречество'],
  ['gambling', 'Гемблинг'],
  ['atemporal', 'Атемпораль'],
  ['mercenaries', 'Наймиты и капиталисты'],
  ['students', 'Студенты и камрады'],
].map(([id, name]) => ({ path: lodgeCoverUrl(id)!, name, mode: 'illustration' as const })).concat([
  ['priests','Птица'],['ram-pelt','Баранья шкура'],['amphora','Амфора'],['torch','Факел'],['writing-tablets','Письменные таблички'],
].map(([name,label])=>({path:`/assets/lodge-covers/${name}.svg`,name:label,mode:'illustration' as const})));

// Temporary neutral examples for entries without a confirmed emblem.
// Stable by ID, so adding/reordering directory entries does not shuffle icons.
const examples = ['sparkle', 'model', 'brush', 'hand', 'avatar', 'bell', 'text'];
export function exampleLodgeIcon(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return examples[hash % examples.length];
}
