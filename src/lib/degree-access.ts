const ranks: Record<string, number> = { I: 1, II: 2, III: 3 };
export function degreeAllowed(degree: number, exact: string[] | null, minimum: string | null) {
  return exact?.length ? exact.some(value => ranks[value] === degree) : degree >= (ranks[minimum ?? ''] ?? 0);
}
