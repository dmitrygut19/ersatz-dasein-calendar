import type { Directive } from 'vue';

// Measure only text that is actually visible (including the title's line clamp).
// The cover remains positioned against the day, independent of these sizes.
const observers = new WeakMap<HTMLElement, ResizeObserver>();
function observe(el: HTMLElement) {
  observers.get(el)?.disconnect();
  const day = el.closest<HTMLElement>('.uc-day');
  if (!day || !el.querySelector('img')) return;
  const head = day.querySelector<HTMLElement>('.uc-day-head');
  const caption = day.querySelector<HTMLElement>('.uc-caption');
  const venue = day.querySelector<HTMLElement>('.uc-venue');
  const measure = () => {
    const bounds = day.getBoundingClientRect();
    if (head) el.style.setProperty('--cover-header-height', `${Math.max(0, head.getBoundingClientRect().bottom - bounds.top)}px`);
    if (caption) el.style.setProperty('--cover-footer-height', `${Math.max(0, bounds.bottom - caption.getBoundingClientRect().top)}px`);
  };
  const observer = new ResizeObserver(measure);
  for (const node of [day, head, caption, venue]) if (node) observer.observe(node);
  observers.set(el, observer);
  measure();
}

export const calendarCoverShade: Directive<HTMLElement> = {
  mounted: observe,
  updated: observe,
  unmounted(el) { observers.get(el)?.disconnect(); observers.delete(el); },
};
