export type AccessLodge = { id: string; name: string; iconUrl: string | null };
export type AccessEvent = {
  access: string; typeDegree?: string | null; allowedDegrees?: string[] | null;
  typeTier?: string | null; requiresAuth?: boolean; audienceLodgeIds?: string[];
};
export type AccessTag = { key: string; label: string; tier?: 0 | 1 | 2 };

// Presentation of the resolved occurrence DTO, not a second access policy.
// Topic/affiliation and event titles never participate in audience labels.
export function adminAccessTags(event: AccessEvent, directory: AccessLodge[]): AccessTag[] {
  const tags: AccessTag[] = [];
  const exact = event.allowedDegrees?.length ? event.allowedDegrees : null;
  const degree = exact?.length === 1 ? exact[0] : event.typeDegree;
  const tier = degree === 'II' ? 1 : degree === 'III' ? 2 : 0;
  tags.push({ key: 'degree', label: exact ? `Градус: ${exact.join(' или ')}` : event.typeDegree ? `Градус: не ниже ${event.typeDegree}` : 'Любой градус', tier: exact && exact.length > 1 ? 0 : tier });
  if (event.requiresAuth) tags.push({ key: 'auth', label: 'Нужна авторизация' });
  if (event.typeTier) tags.push({ key: 'tier', label: `Тир: ${event.typeTier}` });
  const ids = [...new Set(event.audienceLodgeIds ?? [])];
  for (const id of ids) {
    const lodge = directory.find(row => row.id === id);
    tags.push({ key: `lodge:${id}`, label: lodge?.name ?? id });
  }
  if (!ids.length) tags.push({ key: 'lodges:all', label: 'Все ложи' });
  // The server suppresses the legacy group requirement only if it is already
  // represented by a selected audience lodge with the same name.
  if (event.access !== 'Все' && !directory.some(row => ids.includes(row.id) && row.name === event.access)) {
    tags.push({ key: 'group', label: `Группа: ${event.access}` });
  }
  return tags;
}
