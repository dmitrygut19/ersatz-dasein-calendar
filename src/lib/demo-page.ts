let preparation: Promise<void> | undefined;

// All calendar requests wait for a reload reset, so private events cannot flash back.
export function prepareDemoPage() {
  if (typeof window === 'undefined') return Promise.resolve();
  return preparation ??= (async () => {
    if (document.documentElement.dataset.publicDemo !== '1') return;
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type !== 'reload') return;
    const response = await fetch('/api/demo/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('Не удалось сбросить временное подключение. Обновите страницу ещё раз.');
  })();
}
