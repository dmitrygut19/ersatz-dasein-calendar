<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, useId } from 'vue';
import MentorButton from '../ui/MentorButton.vue';
import EventDetailCard from './EventDetailCard.vue';
import MobileEventDialog from './MobileEventDialog.vue';
import ButtonPaletteFilter from '../ui/ButtonPaletteFilter.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import LinoMultiSelect from '../ui/LinoMultiSelect.vue';
import { exampleLodgeIcon, lodgeIconUrl } from '../../lib/lodge-icons';
import { matchesCalendarFilters } from '../../lib/calendar-filters';
import { mobileEventColor } from '../../lib/mobile-event-color';
import LinoIcon from '../ui/LinoIcon.vue';
import { linoSurface as vLinoSurface } from '../../lib/lino-card-frame';
import { calendarCoverShade as vCoverShade } from '../../lib/calendar-cover-shade';
import 'lino-ui/rough';
import '../../styles/lino-kit.css';
import { buttonDefaults, defaultAppearance, type Appearance } from '../../lib/appearance';
import { enableInterfaceSounds, playSound, setMuted } from 'lino-ui/sounds';
import designTokens from '../../../design/tokens.json';
import { eventPlatform } from '../../lib/event-platform';
import { communityConfig } from '../../lib/community-config';
import type { PublicEvent } from '../../lib/calendar';
import { calendarDate } from '../../lib/calendar-week';

type PublicAccount = { nick: string; degree: 'I' | 'II' | 'III' };

// The admin embeds this exact view; only analytics, sounds and the action differ.
const props = withDefaults(defineProps<{ embedded?: boolean; revision?: number }>(), { embedded: false, revision: 0 });
const emit = defineEmits<{ manage: [event: { id: string; date: string }]; create: [date: string] }>();
const eventButtonFilterId = useId();
const mobileSheetControlsId = useId();
function soundAttrs(kind:'small'|'button'='small') {
  return {'data-sound-hover':props.embedded ? '' : `${kind}Hover`, 'data-sound-click':props.embedded ? '' : `${kind}Click`};
}

const clock = ref(new Date());
const today = computed(() => calendarDate(clock.value));
const [initialYear, initialMonth] = today.value.split('-').map(Number);
const month = ref(initialMonth - 1), year = ref(initialYear);
const desktopView = ref(false);
const mobile = computed(() => !props.embedded && !desktopView.value);
const compact = computed(() => !desktopView.value);
const selectedDate = ref(today.value);
const selectedDateLabel = computed(() => new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(new Date(selectedDate.value+'T12:00:00')));
const mobileSelectedDate = ref('');
const eventPanel = ref<InstanceType<typeof MobileEventDialog>|HTMLElement|null>(null);
function requestEventClose(){
  if(mobile.value && eventPanel.value && 'requestClose' in eventPanel.value)eventPanel.value.requestClose();
  else closeEvent(true);
}
function chooseDate(date:string){selectedDate.value=date;const index=cells.value.findIndex(cell=>cell.date===date);if(index>=0&&cells.value[index].events.length)openDay(index);else closeEvent();}
function onCardKey(event:KeyboardEvent){if(!mobile.value&&event.key==='Escape'&&selected.value)closeEvent();}
const calendarRoot = ref<HTMLElement | null>(null);
let monthLoad: Promise<void> = Promise.resolve();
let boundaryTimer: ReturnType<typeof setTimeout>;
function updateClock() { clock.value = new Date(); }
function scheduleBoundary() {
  clearTimeout(boundaryTimer);
  if (props.embedded || !desktopView.value) return;
  const midnight = Date.parse(today.value + 'T00:00:00+03:00') + 86400000;

  boundaryTimer = setTimeout(() => {
    const previousDate = today.value;
    updateClock();
    if (today.value !== previousDate) { monthLoad = loadEvents(); }
    scheduleBoundary();
  }, Math.max(1, midnight - clock.value.getTime() + 1));
}

const events = ref<PublicEvent[]>([]);
const lodgeDirectory = ref<{id:string;name:string;iconUrl:string|null}[]>([]);
const filterLodges = ref<string[]>([]), filterDegree = ref('Все');
const filters = computed(() => ({lodges:filterLodges.value,degree:filterDegree.value}));
const filteredEvents = computed(() => events.value.filter(event => matchesCalendarFilters(event, filters.value)));
const filtersActive = computed(() => filterLodges.value.length > 0 || filterDegree.value !== 'Все');
const loading = ref(true);
const lodgeOptions = computed(() => lodgeDirectory.value.map(row => ({value:row.id,label:row.name,iconUrl:row.id==='raubritters'?null:lodgeIconUrl(row.id,row.iconUrl),iconName:row.id==='raubritters'?undefined:exampleLodgeIcon(row.id)})));
const lodgeSummary = computed(() => !filterLodges.value.length ? 'Все' : filterLodges.value.length > 1 ? `Ложи: ${filterLodges.value.length}` : lodgeDirectory.value.find(row=>row.id===filterLodges.value[0])?.name ?? 'Ложи: 1');
const account = ref<PublicAccount | null>(null);
type CardState = 'idle' | 'loading' | 'error' | 'checking' | 'access-error' | 'deleted';
const cardState = ref<CardState>('idle'), coverFailed = ref(false);
const reviewQuery = () => '';
const gated = computed(() => !props.embedded && Boolean(selected.value && (!selected.value.canFollow || cardState.value !== 'idle')));
const needsDegree = computed(() => selected.value?.requirements?.some(row => row.kind === 'degree' || row.kind === 'tier'));
const memberships = computed(() => selected.value?.requirements?.filter(row => row.kind === 'membership') ?? []);
const calendarHref = computed(() => selected.value?.calendarUrl?.startsWith('/api/') ? selected.value.calendarUrl + '?participant=' + encodeURIComponent(identity.telegramId) + reviewQuery() : selected.value?.calendarUrl);
watch(() => selected.value?.id, () => { coverFailed.value = false; coverBottomSpace.value = 0; });
function authorizeCard() {
  notify('Telegram-авторизация пока не подключена.');
}
const displayAccount = computed<PublicAccount | null>(() => account.value);
const accountInitials = computed(() => (displayAccount.value?.nick.replace(/^@/, '').slice(0, 2) ?? '').toUpperCase());
const degreeTier = computed(() => designTokens.interfaceLibrary.degreeTierMap[displayAccount.value?.degree ?? 'I']);
function coverMode(event?: PublicEvent | null, _date?: string) {
  return event ? event.appearance?.coverMode ?? 'illustration' : undefined;
}
function appearanceStyle(event?: PublicEvent | null) {
  if (!event) return undefined;
  const a = event.appearance ?? defaultAppearance(event.theme);
  const background = a ?? defaultAppearance(event.theme);
  const contrastingColor = (hex: string) => {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] < 0.179 ? 'var(--white-100)' : 'var(--text-primary)';
  };
  const mutedControl = (hex:string) => contrastingColor(hex) === 'var(--white-100)' ? 'var(--gray-350)' : 'var(--text-secondary)';
  const hoveredControl = (hex:string) => contrastingColor(hex) === 'var(--white-100)' ? 'color-mix(in srgb, var(--copper-600), var(--white-100) 45%)' : 'var(--copper-600)';
  return { '--event-pager-color': contrastingColor(background.start), '--event-card-pager-color': contrastingColor(background.end),
    '--event-pager-muted':mutedControl(background.start), '--event-card-pager-muted':mutedControl(background.end),
    '--event-pager-hover':hoveredControl(background.start), '--event-card-pager-hover':hoveredControl(background.end),
    ...(a ? { '--event-background': `linear-gradient(180deg, ${a.start}, ${a.end})`, '--event-chip-background': a.start, '--event-text': a.text,
      '--event-accent': a.accent, '--event-border': a.bordered ? a.accent : 'transparent' } : {}) };
}
const selected = ref<PublicEvent | null>(null);
const panelOffset = ref(0), panelTop = ref(0), panelSticky = ref(false), panelShift = ref(0);
let panelObserver: ResizeObserver | undefined;
let panelFrame = 0;
let panelHasPinned = false;
let panelLastScrollY = 0;
function floatPanel() {
  if(!panelSticky.value){panelShift.value=0;return;}
  const root=calendarRoot.value,card=root?.querySelector<HTMLElement>('.uc-card'),grid=root?.querySelector<HTMLElement>('.uc-grid');
  if(!card||!grid)return;
  const box=card.getBoundingClientRect(),naturalTop=box.top-panelShift.value;
  const gridBox=grid.getBoundingClientRect();
  const firstDay=root?.querySelector<HTMLElement>('.uc-day');
  const start=(firstDay?.getBoundingClientRect().top ?? gridBox.top)-naturalTop;
  const limit=gridBox.bottom-naturalTop-box.height;
  // The chosen row is only the opening anchor. Once pinned, the whole grid
  // bounds upward and downward travel, including when scrolling back up.
  if(naturalTop<=panelTop.value || window.scrollY<panelLastScrollY)panelHasPinned=true;
  panelLastScrollY=window.scrollY;
  panelShift.value=Math.max(panelHasPinned?start:0,Math.min(panelTop.value-naturalTop,limit));
}
function queuePanel(){cancelAnimationFrame(panelFrame);panelFrame=requestAnimationFrame(floatPanel);}
// Keep the opening anchor in document flow. Only a short card sticks; a tall
// card must scroll with the page so its final actions remain reachable.
function placePanel() {
  const root = calendarRoot.value;
  const main = root?.querySelector<HTMLElement>('.uc-main');
  const grid = root?.querySelector<HTMLElement>('.uc-grid');
  const card = root?.querySelector<HTMLElement>('.uc-card');
  const day = root?.querySelectorAll<HTMLElement>('.uc-day')[selectedCellIndex.value ?? -1];
  if (!main || !grid || !card || !day || !window.matchMedia('(min-width:901px)').matches) {
    panelOffset.value = 0; panelSticky.value = false; return;
  }
  const gap = parseFloat(getComputedStyle(root!).getPropertyValue('--space-6'));
  // Public page has no fixed header today. Account for a pinned header when
  // embedded in a shell as well, using its actual lower edge plus the same gap.
  const headerBottom = Math.max(0, ...Array.from(document.querySelectorAll<HTMLElement>('header,[data-sticky-header]'))
    .filter(el => ['fixed','sticky'].includes(getComputedStyle(el).position))
    .map(el => Math.max(0, el.getBoundingClientRect().bottom)));
  panelTop.value = headerBottom + gap;
  const mainTop = main.getBoundingClientRect().top;
  const height = card.getBoundingClientRect().height;
  const firstDay = root!.querySelector<HTMLElement>('.uc-day')!;
  const start = firstDay.getBoundingClientRect().top - mainTop;
  const wanted = Math.max(day.getBoundingClientRect().top - mainTop, panelTop.value - mainTop);
  const last = grid.getBoundingClientRect().bottom - mainTop - height;
  // Near the last row the lower boundary takes priority over row alignment.
  // If the card exceeds the entire grid it expands the calendar area in flow.
  panelOffset.value = height > grid.getBoundingClientRect().height
    ? wanted
    : Math.max(start, Math.min(wanted, Math.max(start, last)));
  panelSticky.value = height <= window.innerHeight - panelTop.value - gap;
  void nextTick(queuePanel);
}
async function observePanel() {
  await nextTick();
  panelObserver?.disconnect();
  placePanel();
  const root = calendarRoot.value;
  for (const selector of ['.uc-grid','.uc-card']) {
    const element = root?.querySelector(selector);
    if (element) panelObserver?.observe(element);
  }
}
const previewDegree = ref('Все');
const loadError = ref(''), notice = ref('');
const pagers = ref<Record<number, number>>({});
let timer: ReturnType<typeof setTimeout>, refreshTimer: ReturnType<typeof setInterval>;
let loadSequence = 0;
onBeforeUnmount(() => { clearInterval(refreshTimer); clearTimeout(timer); });

// Draft identity: stable per-device participant key until Telegram auth exists.
let identity = { telegramId: '', nick: '' };
function initializeIdentity() {
  let id = localStorage.getItem('calendar-participant-id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('calendar-participant-id', id); }
  identity = { telegramId: id, nick: `Гость ${id.slice(0, 4)}` };
}

const label = computed(() => {
  const raw = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(year.value, month.value, 1));
  const [monthName, yearNum] = raw.split(' ');
  return monthName[0].toUpperCase() + monthName.slice(1) + ', ' + yearNum;
});
const fmtDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const cells = computed(() => {
  const first = (new Date(year.value, month.value, 1).getDay() + 6) % 7;
  const days = new Date(year.value, month.value + 1, 0).getDate();
  const total = Math.ceil((first + days) / 7) * 7;
  return Array.from({ length: total }, (_, index) => {
    const day = index - first + 1;
    if (day < 1 || day > days) return {day:0,date:'',muted:true,events:[] as PublicEvent[]};
    const dateObj = new Date(year.value, month.value, day);
    const date = fmtDate(dateObj);
    return { day: dateObj.getDate(), date, muted:false, events: filteredEvents.value.filter(event => event.date === date) };
  });
});
const gridRange = computed(() => ({ from:fmtDate(new Date(year.value,month.value,1)), to:fmtDate(new Date(year.value,month.value+1,0)) }));
const viewCells = computed(() => cells.value.map((cell, index) => {
  const offset = Math.min(pagers.value[index] ?? 0, Math.max(cell.events.length - 1, 0));
  const event = cell.events[offset] ?? null;
  return { ...cell, event, platform: event ? eventPlatform(event) : null, offset, pager: cell.events.length > 1 };
}));
watch([month, year], () => { pagers.value = {}; closeEvent(); cardState.value = 'idle';const first=fmtDate(new Date(year.value,month.value,1));selectedDate.value=today.value.startsWith(first.slice(0,7))?today.value:first; });
const selectedCellIndex = ref<number | null>(null);
watch(filters, () => {
  pagers.value = {};
  if (!selected.value) return;
  if (!matchesCalendarFilters(selected.value, filters.value)) { closeEvent(); return; }
  const index = cells.value.findIndex(cell => cell.date === selected.value?.date);
  selectedCellIndex.value = index >= 0 ? index : null;
  if (index >= 0) pagers.value = {[index]:Math.max(0,cells.value[index].events.findIndex(event=>event.id===selected.value?.id))};
}, {flush:'sync'});
const selectedPager = computed(() => {
  const index = selectedCellIndex.value;
  if (index === null) return null;
  const cell = viewCells.value[index];
  if (!cell?.pager || cell.event?.id !== selected.value?.id) return null;
  return { index, offset: cell.offset, total: cell.events.length };
});
function stepPager(index: number, delta: number) {
  const total = cells.value[index]?.events.length ?? 0;
  const next = (pagers.value[index] ?? 0) + delta;
  if (next < 0 || next >= total) return;
  pagers.value = { ...pagers.value, [index]: next };
  if (selectedCellIndex.value === index) {
    const event = cells.value[index]?.events[next];
    if (event) { cardState.value = 'idle'; selected.value = event; void track('view', event); if (!props.embedded) void loadEvents(); }
  }
}
const isSat = computed(() => selected.value?.theme === 'saturnalia');
const selectedButtonPalette = computed(() => {
  const defaults = buttonDefaults(selected.value?.theme);
  const custom = selected.value?.appearance;
  return { background: custom?.buttonBackground ?? defaults.background, text: custom?.buttonText ?? defaults.text, accent: custom?.buttonAccent ?? defaults.accent };
});
const cardDateLabel = computed(() => {
  const event = selected.value;
  if (!event) return '';
  const dateLabel = (date:string) => new Intl.DateTimeFormat('ru-RU', {day:'numeric',month:'long',timeZone:'Europe/Moscow'}).format(new Date(date + 'T12:00:00+03:00'));
  const weekday = new Intl.DateTimeFormat('ru-RU', {weekday:'short',timeZone:'Europe/Moscow'}).format(new Date(event.date + 'T12:00:00+03:00'));
  const zone = event.timezone === 'Europe/Moscow' ? 'МСК' : event.timezone;
  let timing = event.allDay ? 'весь день' : event.start;
  if (!event.allDay && !event.noEnd && event.end) {
    const nextDay = event.endDate && event.endDate !== event.date;
    timing += nextDay ? '–' + event.end + ' (' + dateLabel(event.endDate!) + ')' : event.end < event.start ? '–' + event.end + ' (следующий день)' : '–' + event.end;
  }
  if (event.allDay && event.endDate) {
    const last = new Date(event.endDate + 'T12:00:00Z'); last.setUTCDate(last.getUTCDate()-1);
    const lastDate=last.toISOString().slice(0,10);
    if (lastDate > event.date) timing += ', до ' + dateLabel(lastDate) + ' включительно';
  }
  return dateLabel(event.date) + ', ' + weekday + ' · ' + timing + ' ' + zone;
});
const coverImage = ref<HTMLImageElement | null>(null);
const coverBottomSpace = ref(0);
const closeOnDark = ref(false);
watch(() => [selected.value?.id, selected.value?.cover, selected.value?.appearance?.start], () => {
  const background = selected.value?.appearance?.start;
  closeOnDark.value = background ? (0.2126 * parseInt(background.slice(1, 3), 16) + 0.7152 * parseInt(background.slice(3, 5), 16) + 0.0722 * parseInt(background.slice(5, 7), 16)) < 145 : selected.value?.theme === 'saturnalia';
  void nextTick(updateCloseTone);
});
function updateCloseTone() {
  const image = coverImage.value;
  const close = calendarRoot.value?.querySelector<HTMLElement>('.uc-card-close');
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight || !close) return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    // Composite the pixels actually behind the close control. Sampling the
    // source image's top-right corner ignores contain padding and PNG alpha.
    const box = image.getBoundingClientRect(), button = close.getBoundingClientRect();
    const style = getComputedStyle(image);
    const left = box.left + parseFloat(style.paddingLeft), top = box.top + parseFloat(style.paddingTop);
    const width = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const scale = (style.objectFit === 'contain' ? Math.min : Math.max)(width / image.naturalWidth, height / image.naturalHeight);
    const renderedWidth = image.naturalWidth * scale, renderedHeight = image.naturalHeight * scale;
    if (style.objectFit === 'contain') {
      // Keep image dimensions and rendered scale; reclaim blank pixels only.
      const probe = document.createElement('canvas'); probe.width = 128; probe.height = 128;
      const sample = probe.getContext('2d', {willReadFrequently:true});
      let last = 128;
      if (sample) {
        sample.drawImage(image,0,0,128,128);
        const rgba = sample.getImageData(0,0,128,128).data;
        while (last > 0 && !Array.from({length:128},(_,x)=>rgba[((last-1)*128+x)*4+3]).some(alpha=>alpha>8)) last--;
      }
      coverBottomSpace.value = parseFloat(style.paddingBottom) + (height-renderedHeight)/2 + renderedHeight*(1-last/128);
    } else coverBottomSpace.value = 0;
    const sx = 24 / button.width, sy = 24 / button.height;
    context.fillStyle = (selected.value?.appearance ?? defaultAppearance(selected.value?.theme)).start;
    context.fillRect(0, 0, 24, 24);
    context.beginPath();
    context.rect((left - button.left) * sx, (top - button.top) * sy, width * sx, height * sy);
    context.clip();
    context.drawImage(image, (left + (width - renderedWidth) / 2 - button.left) * sx,
      (top + (height - renderedHeight) / 2 - button.top) * sy, renderedWidth * sx, renderedHeight * sy);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    let luminance = 0;
    let weight = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3] / 255;
      luminance += (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) * alpha;
      weight += alpha;
    }
    if (weight) closeOnDark.value = luminance / weight < 145;
  } catch { closeOnDark.value = selected.value?.theme === 'saturnalia'; }
}
function move(delta: number) { const date = new Date(year.value, month.value + delta, 1); year.value = date.getFullYear(); month.value = date.getMonth(); }
function notify(value: string) { notice.value = value; clearTimeout(timer); timer = setTimeout(() => { notice.value = ''; }, 4000); }
async function track(kind: string, event: PublicEvent) {
  if (props.embedded) return;
  try {
    await fetch('/api/calendar/activity', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...identity, eventKey: event.id, kind }),
    });
  } catch { /* activity tracking must never block the calendar */ }
}
function closeEvent(withSound = false) {
  if (withSound && !props.embedded) playSound('viewClose');
  selected.value = null; selectedCellIndex.value = null;
}
function openEvent(event:PublicEvent,index:number){
  if(selected.value?.id===event.id&&selectedCellIndex.value===index){closeEvent(true);return;}
  if(!props.embedded)playSound('viewOpen');
  panelHasPinned=false;panelShift.value=0;panelLastScrollY=window.scrollY;
  cardState.value='idle';selectedDate.value=event.date;if(mobile.value)mobileSelectedDate.value=event.date;selected.value=event;selectedCellIndex.value=index;
  void track('view',event);if(!props.embedded)void loadEvents();
}
function openDay(index: number) {
  const first = cells.value[index]?.events[0];
  if (!first) return;
  pagers.value = { ...pagers.value, [index]: 0 };
  openEvent(first, index);
}
function follow(url: string) {
  if (selected.value) void track('open', selected.value);
  window.open(url, '_blank', 'noopener noreferrer');
}
async function loadEvents() {
  const sequence = ++loadSequence;
  loading.value = true;
  loadError.value = '';
  if (selected.value && !props.embedded) cardState.value = 'checking';
  try {
    const { from, to } = gridRange.value;
    const participant = identity.telegramId;
    const response = await fetch(props.embedded
      ? `/api/calendar-preview?from=${from}&to=${to}&degree=${previewDegree.value === 'Все' ? '' : previewDegree.value}`
      : `/api/calendar?participant=${encodeURIComponent(participant)}&from=${from}&to=${to}${reviewQuery()}`, {signal: AbortSignal.timeout(25_000)});
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (sequence !== loadSequence) return;
    // Validate before touching reactive state: a malformed successful response
    // otherwise throws in computed/render code and prevents the retry UI mounting.
    if (!result || !Array.isArray(result.events) || !result.events.every((event: unknown) => {
      if (!event || typeof event !== 'object') return false;
      const row = event as Record<string, unknown>;
      return ['id','title','date','start','end','description','url','venue','access','calendarUrl'].every(key => typeof row[key] === 'string')
        && typeof row.canFollow === 'boolean' && Array.isArray(row.requirements)
        && row.requirements.every((item: unknown) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).text === 'string');
    }) || (result.lodges !== undefined && (!Array.isArray(result.lodges) || !result.lodges.every((lodge: unknown) => lodge && typeof lodge === 'object' && typeof (lodge as Record<string, unknown>).id === 'string' && typeof (lodge as Record<string, unknown>).name === 'string')))) throw new Error('Invalid calendar response');
    events.value = result.events;
    lodgeDirectory.value = result.lodges ?? [];
    cardState.value = 'idle';
    account.value = result.account ?? null;
    if (selected.value) {
      const fresh = events.value.find(event => event.id === selected.value?.id);
      if (fresh) selected.value = fresh;
      else cardState.value = 'deleted';
      if (fresh && !matchesCalendarFilters(fresh, filters.value)) closeEvent();
      // A saved schedule change can move the open event to another day. Keep
      // the grid selection and the day's pager attached to that same event.
      const index = selected.value ? cells.value.findIndex(cell => cell.date === selected.value?.date) : -1;
      selectedCellIndex.value = index >= 0 ? index : null;
      if (index >= 0) {
        const offset = cells.value[index].events.findIndex(event => event.id === selected.value?.id);
        pagers.value = { ...pagers.value, [index]: Math.max(offset, 0) };
      }
    }
    loadError.value = '';


  } catch { if (sequence === loadSequence) { loadError.value = 'Не удалось загрузить календарь. Обновите страницу.'; if (selected.value) cardState.value = 'access-error'; } }
  finally { if (sequence === loadSequence) loading.value = false; }
}
const refreshOnFocus = () => { updateClock(); monthLoad = loadEvents(); };
const refreshOnVisible = () => { if (document.visibilityState === 'visible') refreshOnFocus(); };
watch([year, month], () => { monthLoad = loadEvents(); });
watch(() => props.revision, loadEvents);
watch(previewDegree, loadEvents);
watch(() => [selected.value?.id, selected.value?.date, selectedCellIndex.value], observePanel, {flush:'post'});
watch([today, desktopView], scheduleBoundary);

let stopDesktopMedia = () => {};
onMounted(() => {
  window.addEventListener('keydown',onCardKey);
  panelObserver = new ResizeObserver(placePanel);
  window.addEventListener('scroll',queuePanel,{passive:true});
  window.addEventListener('resize', placePanel);
  const media = window.matchMedia('(min-width:701px)');
  const sync = () => { desktopView.value = media.matches; };
  sync(); media.addEventListener('change', sync);
  stopDesktopMedia = () => media.removeEventListener('change', sync);
  initializeIdentity();
  if (!props.embedded) {
    setMuted(false);
    enableInterfaceSounds();
  }
  monthLoad = loadEvents();
  refreshTimer = setInterval(refreshOnFocus, 60_000);
  document.addEventListener('visibilitychange', refreshOnVisible);
  window.addEventListener('resize', updateCloseTone);
  window.addEventListener('focus', refreshOnFocus);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown',onCardKey);
  panelObserver?.disconnect();
  window.removeEventListener('scroll',queuePanel);cancelAnimationFrame(panelFrame);
  window.removeEventListener('resize', placePanel);
  clearTimeout(boundaryTimer); stopDesktopMedia();
  document.removeEventListener('visibilitychange', refreshOnVisible);
  window.removeEventListener('resize', updateCloseTone);
  window.removeEventListener('focus', refreshOnFocus);
});
</script>

<template>
  <component :is="embedded ? 'div' : 'main'" ref="calendarRoot" class="user-calendar user-calendar--lino" :class="{ 'user-calendar--embedded': embedded, 'user-calendar--public': true }">
    <ButtonPaletteFilter :id="eventButtonFilterId" :palette="selectedButtonPalette"/>
    <p v-if="loadError" v-lino-surface="true" role="alert" class="feedback error uc-feedback">{{ loadError }} <button type="button" class="text-action" @click="loadEvents">Повторить</button></p>
    <section class="demo-calendar" aria-label="Календарь событий">
        <div class="uc-bottombar">
          <div class="uc-monthrow">
            <h2 class="uc-month">{{ label }}</h2>
            <div class="uc-nav" role="group" aria-label="Переключение месяца">
              <button type="button" class="uc-nav-item" v-bind="soundAttrs()" aria-label="Предыдущий месяц" @click="move(-1)"><img src="/assets/calendar/nav-arrow.png" alt=""/></button>
              <button type="button" class="uc-nav-item" v-bind="soundAttrs()" aria-label="Следующий месяц" @click="move(1)"><img class="uc-nav-flip" src="/assets/calendar/nav-arrow.png" alt=""/></button>
            </div>
          </div>
          <SegmentedControl v-if="embedded" v-model="previewDegree" class="uc-degree-preview" :options="['Все','I','II','III']" label="Градус" framed/>
          <div v-else-if="displayAccount" v-lino-surface="true" class="uc-account"><span class="uc-avatar">{{ accountInitials }}</span><span>{{ displayAccount.nick }}</span><span v-lino-surface="{kind:'tag'}" class="uc-degree" :data-tier="degreeTier">Градус {{ displayAccount.degree }}</span></div>
          <MentorButton v-else :variant="1" class="uc-tg" v-bind="soundAttrs('button')" @click="authorizeCard">Войти через Telegram</MentorButton>
        </div>
        <div v-if="!embedded" class="uc-filters" role="group" aria-label="Фильтры событий">
          <LinoMultiSelect v-model="filterLodges" class="uc-lodges" :options="lodgeOptions" label="Ложи" :summary="lodgeSummary"/>
          <SegmentedControl v-model="filterDegree" :options="['Все','I','II','III']" label="Градус" framed lino/>
        </div>
        <p v-if="loading" role="status" class="uc-result">Загружаем календарь…</p>

      <div class="uc-main">
        <div class="uc-calendar">
        <div class="uc-grid" :class="{'uc-grid-compact':compact}">
          <span v-for="day in ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']" :key="day" class="uc-weekday">{{ day }}</span>
          <div v-for="(cell, index) in viewCells" :key="index" v-lino-surface="!cell.muted && {kind:'day',seed:index}" class="uc-day" :aria-hidden="cell.muted ? true : undefined" :style="!compact ? appearanceStyle(cell.event) : undefined" :data-sound-hover="!embedded && cell.event ? 'smallHover' : undefined" :class="{ 'uc-muted': cell.muted, 'uc-saturnalia': !compact && cell.event?.theme === 'saturnalia', 'uc-custom': !compact && cell.event?.appearance, 'uc-selected': mobile ? mobileSelectedDate === cell.date : selected && selectedCellIndex === index, 'uc-day-illustration': coverMode(cell.event, cell.date) === 'illustration', 'uc-day-artwork': coverMode(cell.event, cell.date) === 'poster' }">
              <template v-if="compact && !cell.muted">
                <span class="uc-compact-date" :class="{'uc-compact-today':cell.date===today}" :aria-current="cell.date===today?'date':undefined">{{ cell.day }}</span>
                <div class="uc-cell-events" aria-hidden="true">
                  <span v-for="event in cell.events.slice(0,4)" :key="event.id" class="uc-cell-event" :data-mobile-color="compact ? mobileEventColor(event) : undefined" :style="compact ? {'--mobile-event-accent':`var(--${mobileEventColor(event)})`} : appearanceStyle(event)">
                    <span class="uc-cell-label">{{ event.title }}</span>
                  </span>
                  <span v-if="cell.events.length>4" class="uc-cell-more">+{{ cell.events.length-4 }}</span>
                </div>
                <button v-if="cell.events.length" type="button" class="uc-date-button" :aria-label="cell.day+' '+label+': '+cell.events.map(event=>event.title).join(', ')" :aria-pressed="!!selected && selectedCellIndex===index" @click="chooseDate(cell.date)"></button>
              </template>
              <div v-if="!compact" class="uc-day-head">
                <span v-if="!cell.muted" class="uc-day-number"><span class="uc-date" :class="{'uc-date-today': desktopView && cell.date === today}" :aria-current="desktopView && cell.date === today ? 'date' : undefined">{{ cell.day }}</span></span>
                <span v-if="coverMode(cell.event, cell.date) && cell.event" class="uc-poster-time">{{ cell.event.start }}</span>
                <div v-if="cell.pager" class="uc-pager" role="group" aria-label="События дня">
                  <button type="button" class="uc-caret" v-bind="soundAttrs()" :disabled="cell.offset === 0" aria-label="Предыдущее событие" @click="stepPager(index, -1)"><LinoIcon name="caret" class="uc-event-arrow uc-event-arrow-back"/></button>
                  <span class="uc-counter">{{ cell.offset + 1 }}/{{ cell.events.length }}</span>
                  <button type="button" class="uc-caret" v-bind="soundAttrs()" :disabled="cell.offset >= cell.events.length - 1" aria-label="Следующее событие" @click="stepPager(index, 1)"><LinoIcon name="caret" class="uc-event-arrow uc-event-arrow-next"/></button>
                </div>
              </div>
              <div v-if="!compact && cell.event" class="uc-event" :data-title="cell.event.title">
                <button v-cover-shade type="button" class="uc-cover" :aria-pressed="!!selected && selectedCellIndex === index" :class="{'uc-cover-flat': cell.event.cover === '/assets/panel/a5ff5.png'}" :aria-label="`Открыть ${cell.event.title}`" @click="openEvent(cell.event, index)">
                  <img v-if="cell.event.cover" :src="cell.event.cover" alt=""/>
                </button>
                <button type="button" class="uc-caption" :data-event-id="cell.event.id" :aria-pressed="!!selected && selectedCellIndex === index" :aria-label="`Открыть ${cell.event.title}`" @click="openEvent(cell.event, index)">
                  <span class="uc-time">{{ cell.event.start }}</span><span class="uc-title">{{ cell.event.title }}</span>
                </button>
                <div v-if="cell.platform?.label" class="uc-venue">
                  <a v-if="!embedded && cell.event.canFollow && cell.platform.href" class="uc-venue-link" :href="cell.platform.href" target="_blank" rel="noopener noreferrer" :aria-label="`Открыть ${cell.event.title}: ${cell.platform.label} (в новой вкладке)`" @click.stop="track('open', cell.event)">
                    <span>{{ cell.platform.label }}</span>
                  </a>
                  <span v-else class="uc-venue-label" :title="!cell.event.canFollow ? cell.event.reason ?? 'Нет доступа к событию' : !cell.platform.href ? 'Ссылка на событие пока не указана' : undefined">
                    <span>{{ cell.platform.label }}</span><LinoIcon v-if="!cell.event.canFollow" name="calendar-lock"/>
                  </span>
                </div>
              </div>
              <div v-if="!compact && cell.events.length" class="uc-mobile-events" aria-hidden="true">
                <span v-for="e in cell.events.slice(0, 4)" :key="e.id" v-lino-surface="{kind:'chip'}" class="uc-mobile-event" :style="appearanceStyle(e)"><span>{{ e.title }}</span></span>
              </div>
              <button v-if="!compact && cell.event" type="button" class="uc-open" :aria-pressed="!!selected && selectedCellIndex === index" :aria-label="`${cell.day} ${label}: ${cell.events.length} событий. ${cell.events.map(e => e.title).join(', ')}`" :aria-expanded="selectedCellIndex === index && !!selected" @click="openDay(index)"></button>
              <template v-if="embedded && !cell.muted && !cell.event">
                <button type="button" class="uc-admin-empty" :aria-label="`Создать событие ${cell.date}`" @click="selectedDate=cell.date; emit('create',cell.date)"><span class="uc-admin-create" aria-hidden="true">{{ compact ? '+' : 'Создать событие' }}</span></button>
              </template>
          </div>
        </div>
        <section v-if="embedded && compact" class="uc-admin-day" aria-label="События выбранного дня">
          <p>{{ selectedDateLabel }}</p>
          <button v-for="event in events.filter(event=>event.date===selectedDate)" :key="event.id" type="button" class="text-action" @click="emit('manage',event)">{{ event.start }} · {{ event.title }}</button>
          <button type="button" class="text-action" @click="emit('create',selectedDate)">Создать событие</button>
        </section>

        </div>
        <component :is="mobile ? MobileEventDialog : 'aside'" ref="eventPanel" :active="!!selected" :content-key="selected?.id" :controls-id="mobileSheetControlsId" :class="mobile ? 'uc-mobile-panel' : {'uc-panel':true,'uc-panel-open':!!selected,'uc-panel-sticky':panelSticky}" :style="mobile ? undefined : {'--panel-offset':panelOffset+'px','--panel-top':panelTop+'px','--panel-shift':panelShift+'px'}" :aria-hidden="selected ? undefined : 'true'" aria-label="Карточка события" @close="closeEvent(true)">
          <template v-if="mobile && selectedPager" #navigation>
            <div class="uc-inline-pager" role="group" aria-label="События выбранного дня"><button type="button" class="uc-caret" v-bind="soundAttrs()" :disabled="selectedPager.offset===0" aria-label="Предыдущее событие в этот день" @click="stepPager(selectedPager.index,-1)"><LinoIcon name="caret" class="uc-event-arrow-back"/></button><span class="uc-counter">{{ selectedPager.offset+1 }}/{{ selectedPager.total }}</span><button type="button" class="uc-caret" v-bind="soundAttrs()" :disabled="selectedPager.offset>=selectedPager.total-1" aria-label="Следующее событие в этот день" @click="stepPager(selectedPager.index,1)"><LinoIcon name="caret" class="uc-event-arrow-next"/></button></div>
          </template>
          <div v-if="selected" :class="{'uc-panel-scroll':!mobile}">

            <EventDetailCard :key="selected.id" :event="selected" :show-close="!mobile" :access-lodge="lodgeDirectory.find(lodge=>lodge.name===selected?.access)" :calendar-href="calendarHref" :state="cardState" :embedded="embedded" @close="requestEventClose" @retry="loadEvents" @manage="emit('manage',selected)" @follow="track('open',selected)">
            </EventDetailCard>
          </div>

        </component>
      </div>
    </section>
    <p v-if="notice" v-lino-surface="true" class="uc-notice" role="status">{{ notice }}</p>
  </component>
</template>
<style scoped src="../../styles/user-calendar.css"></style>

<style scoped src="../../styles/mobile-calendar.css"></style>
