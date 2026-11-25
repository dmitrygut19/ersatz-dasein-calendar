<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import TypesPanel from '../TypesPanel.vue';
import AdminDialog from '../ui/AdminDialog.vue';
import LinoSpinner from '../ui/LinoSpinner.vue';
import { ADMIN_LINO } from '../../lib/admin-ui';
import { adminMaterial as vAdminMaterial } from '../../lib/admin-material';
import MentorButton from '../ui/MentorButton.vue';
import MentorSecondaryButton from '../ui/MentorSecondaryButton.vue';
import FigmaField from '../ui/FigmaField.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import EventAccessTags from './EventAccessTags.vue';
import UntypedAccessTags from './UntypedAccessTags.vue';
import { adminAccessTags } from '../../lib/admin-access-tags';
import UserCalendar from '../calendar/UserCalendar.vue';
import EventEditor from './EventEditor.vue';
import IntegrationPanel from './IntegrationPanel.vue';
import AppearanceEditor from './AppearanceEditor.vue';
import ParticipantsPanel from './ParticipantsPanel.vue';
import { linoSurface as vLinoSurface } from '../../lib/lino-card-frame';
import type { Appearance } from '../../lib/appearance';
import { dateLabel, dateShortLabel, initialEvents, screens, type DemoEvent } from '../../lib/admin-demo';
import { prepareCalendarSounds, startCalendarSoundInput, stopCalendarSoundInput, playCalendarSound } from '../../lib/calendar-sound';

function onAdminButtonHover(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLElement>('.app-button');
  if (!button || button.matches(':disabled, [aria-disabled="true"]')) return;
  if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
  playCalendarSound('accent-hover');
}
onMounted(() => { prepareCalendarSounds(); startCalendarSoundInput(); });
onBeforeUnmount(stopCalendarSoundInput);

type ServerOccurrence = {
  sourceSeriesId: string | null; sourceCalendarId: string | null; allowedDegrees: string[] | null; requiresAuth: boolean; typeTier: string | null;
  id: string; eventId: string; title: string; date: string; start: string; end: string; allDay?: boolean;
  description: string; url: string; ownUrl: string; typeId: string | null; typeName: string | null;
  typeTheme: string | null; appearance: Appearance | null; accessOverride: boolean; pointsOverride: boolean;
  affiliationDegree: string|null; communityEvent:boolean;
  typeDegree: string|null; degreeOverride:boolean; topicLodgeId:string|null; audienceLodgeIds:string[];
  source: 'manual' | 'google' | 'yandex'; access: string; points: number; cover: string | null; repeat: string; repeatRule?: unknown;
};
type IntegrationStatus = {
  connectionMethod: 'ical' | 'oauth' | 'caldav';
  state: 'none' | 'manual' | 'connected' | 'syncing' | 'error';
  provider: string; calendarSummary: string; lastSyncAt: string | null; lastSyncError: string | null; pendingMatches: number;
};
type MatchItem = {
  externalId: string; externalTitle: string; externalDate: string; externalStart: string; externalEnd: string;
  manualEventId: string; manualTitle: string; manualDate: string;
};
type TypeSuggestion = { eventId: string; title: string; date: string; suggestions: { id: string; name: string }[] };

const lodges = ref<{id:string;name:string;iconUrl:string|null}[]>([]);
const creationDate=ref(''), eventSaving=ref(false), eventError=ref('');
function createOnDate(date:string) { creationDate.value=date; eventError.value=''; go('event-new'); nextTick(()=>document.getElementById('event-name')?.focus()); }
function accessSummary(event: DemoEvent) { return 'Доступ участников: '+adminAccessTags(event,lodges.value).filter(tag=>tag.key!=='degree').map(tag=>tag.label).join(' · '); }
const props = defineProps<{ initialTypes: any[]; initialScreen: string; initialUi?: string }>();
const modernUi=props.initialUi !== 'classic';
provide(ADMIN_LINO,modernUi);
const currentTypes = ref(props.initialTypes);
const appearanceInitial = ref<{title: string; cover: string | null; theme: string | null; appearance: Appearance | null} | null>(null);
const scene = ref(screens.some(item => item.id === props.initialScreen) ? props.initialScreen : 'calendar');
const events = ref<DemoEvent[]>([]);
const eventsLoaded = ref(false),eventsLoadError=ref('');
const integration = ref<IntegrationStatus | null>(null);
const matches = ref<MatchItem[]>([]);
const typeSuggestions = ref<TypeSuggestion[]>([]);
const typeChoices = ref<Record<string, string>>({});
const selectedId = ref('demo-saturnalia-event');
const selected = computed(() => events.value.find(event => event.id === selectedId.value) ?? events.value[0] ?? initialEvents[1]);
const isManualSelected = computed(() => selected.value.source === 'Админка');
const isSeriesRelease = computed(() => selected.value.repeat !== 'Не повторять');
type EventGroup = { key: string; events: DemoEvent[]; first: DemoEvent; rest: number; series: boolean };
function groupKey(event: DemoEvent) { return JSON.stringify([event.source,event.sourceCalendarId ?? '',event.sourceSeriesId ?? event.eventId ?? event.id]); }
const eventGroups = computed<EventGroup[]>(() => {
  const map = new Map<string, DemoEvent[]>();
  for (const event of events.value) {
    const key = groupKey(event);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(event);
  }
  return [...map.entries()].map(([key, list]) => ({ key, events: list, first: list[0], rest: list.length - 1, series: Boolean(list[0].repeatRule || list[0].sourceSeriesId) || list.length > 1 }));
});
const untypedGroups = computed<EventGroup[]>(() => {
  if (!eventsLoaded.value) return [];
  const ids = new Set(currentTypes.value.map(type=>type.id));
  return eventGroups.value.flatMap(group=>{
    const list=group.events.filter(event=>!event.typeId || !ids.has(event.typeId)).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
    if (!list.length) return [];
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'});
    const first=list.find(event=>event.date>=today) ?? list[list.length-1];
    return [{...group,events:list,first,rest:list.length-1}];
  });
});
const assignmentChoices=ref<Record<string,string>>({}),assignmentErrors=ref<Record<string,string>>({}),assignmentBusy=ref<Record<string,boolean>>({});
type TypeContext = {key:string;eventIds:string[];title:string};
const typeContext=ref<TypeContext|null>(null),queueOverlay=ref(false);
function differentAccess(group:EventGroup) { const signature=(event:DemoEvent)=>JSON.stringify(adminAccessTags(event,lodges.value).map(tag=>[tag.key,tag.label]).sort()); return group.events.some(event=>signature(event)!==signature(group.first)); }
async function assignQueue(context:TypeContext,typeId=assignmentChoices.value[context.key]) {
  if (!typeId || assignmentBusy.value[context.key]) return;
  assignmentBusy.value[context.key]=true;assignmentErrors.value[context.key]='';
  try {
    await api('/api/events/assign-type',{method:'POST',body:JSON.stringify({eventIds:context.eventIds,typeId})});
    await loadEvents();await loadTypeSuggestions();notify('Тип назначен событиям без типа.');
  } catch(error) { assignmentErrors.value[context.key]=error instanceof Error?error.message:'Не удалось назначить тип.'; }
  finally { assignmentBusy.value[context.key]=false; }
}
function queueContext(group:EventGroup):TypeContext { return {key:group.key,eventIds:[...new Set(group.events.map(event=>event.eventId ?? event.id))],title:group.first.title}; }
async function createQueueType(group:EventGroup) { if(await typePanel.value?.startCreate(group.first.title))typeContext.value=queueContext(group); }
async function queueTypeCreated(type:{id:string;name:string}) {
  if(!currentTypes.value.some(item=>item.id===type.id))currentTypes.value.push(type);
  const context=typeContext.value;if(!context)return;typeContext.value=null;
  assignmentChoices.value[context.key]=type.id;
  await assignQueue(context,type.id);
}
const activeGroupId = ref('');
const activeGroup = computed(() => (queueOverlay.value ? untypedGroups.value : eventGroups.value).find(group => group.key === activeGroupId.value) ?? null);
function pluralEvents(count: number) {
  const last = count % 10, decade = count % 100;
  if (last === 1 && decade !== 11) return 'событие';
  if (last >= 2 && last <= 4 && (decade < 12 || decade > 14)) return 'события';
  return 'событий';
}
function openGroup(group: EventGroup) {
  queueOverlay.value=scene.value==='access';
  if (!group.series) { openEvent(group.first); return; }
  activeGroupId.value = group.key;
  go('event-group');
}
const mode = ref('connected'), provider = ref('Google Календарь'), calendarLink = ref(''), connectMessage = ref('');
const connecting = ref(false);
watch(provider, () => { calendarLink.value = ''; connectMessage.value = ''; });
const notification = ref('');
const selectedParticipant = ref<{ id: string; nick: string } | null>(null);
const profile = ref<{ participant: any; metrics: { viewed: number; opened: number; reminders: number }; history: { eventKey: string; eventDate: string | null; title: string | null; viewed: number; opened: number; reminder: number | null; lastActivity: number }[] } | null>(null);
const profileLoading = ref(false), profileError = ref('');
const typePanel = ref<InstanceType<typeof TypesPanel> | null>(null);
const isLogin = computed(() => ['login','denied'].includes(scene.value));
const isConnect = computed(() => scene.value.startsWith('connect'));
const analytics = computed(() => scene.value.startsWith('participant'));
const eventForm = computed(() => ['event-new','event-past','event-repeat','repeat-custom','event-edit'].includes(scene.value));
const overlay = computed(() => scene.value.startsWith('integration-') || ['event','event-settings','event-delete','event-group','participant','appearance-type','appearance-event'].includes(scene.value));
const sceneTitle = computed(() => screens.find(item => item.id === scene.value)?.title ?? 'Админка');
const typeNames = computed(() => currentTypes.value.length ? currentTypes.value.map(type => type.name) : ['Конгресс','Сатурналии']);
const typeLinks = computed(() => Object.fromEntries(currentTypes.value.filter((type: any) => type.venueUrl).map((type: any) => [type.name, type.venueUrl])));
const accessOptions = computed(() => [...new Set(events.value.map(event => event.access).filter(access => access !== 'Все'))].map(access => ({ label: access, value: access })));
const status = computed(() => mode.value === 'manual' ? 'Ручной режим' : mode.value === 'disconnected' ? 'Календарь не подключён' : 'Календарь подключён');
const panelState = computed(() => {
  if (scene.value === 'integration-error') return 'error';
  if (scene.value === 'integration-disconnected') return 'disconnected';
  if (integration.value?.state === 'error') return 'error';
  if (integration.value?.state === 'syncing') return 'syncing';
  return 'connected';
});
const calendarRevision = ref(0);
const profilePeriod = ref('Последние 3 месяца');let timer: ReturnType<typeof setTimeout>;

function toDemo(event: ServerOccurrence): DemoEvent {
  return {
    id: event.id, eventId: event.eventId, allDay: event.allDay ?? false, typeId:event.typeId, sourceCalendarId:event.sourceCalendarId, sourceSeriesId:event.sourceSeriesId, allowedDegrees:event.allowedDegrees, requiresAuth:event.requiresAuth, typeTier:event.typeTier, title: event.title, date: event.date, start: event.start, end: event.end,
    typeName: event.typeName ?? 'Без типа', source: event.source === 'google' ? 'Google Calendar' : event.source === 'yandex' ? 'Яндекс Календарь' : 'Админка',
    access: event.access, points: event.points, cover: event.cover ?? '',
    description: event.description, url: event.url, ownUrl: event.ownUrl, repeat: event.repeat, repeatRule: event.repeatRule ?? null,
    affiliationDegree:event.affiliationDegree, communityEvent:event.communityEvent,
    typeDegree:event.typeDegree, degreeOverride:event.degreeOverride, topicLodgeId:event.topicLodgeId, audienceLodgeIds:event.audienceLodgeIds,
    typeTheme: event.typeTheme, appearance: event.appearance, accessOverride: event.accessOverride, pointsOverride: event.pointsOverride,
  };
}
async function api(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(25_000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? 'Не удалось выполнить действие.');
  return result;
}
async function loadEvents() {
  try {
  const { events: list } = await api('/api/events') as { events: ServerOccurrence[] };
  events.value = list.map(toDemo);
  eventsLoaded.value = true;
  eventsLoadError.value='';
  calendarRevision.value++;
  } catch(error) {eventsLoadError.value='Не удалось загрузить события. Обновите страницу.';throw error;}
}
async function manageCalendarEvent(target: { id: string; date: string }) {
  try {
    let event = events.value.find(item => item.id === target.id);
    if (!event) {
      const result = await api(`/api/events?from=${encodeURIComponent(target.date)}&to=${encodeURIComponent(target.date)}`) as { events: ServerOccurrence[] };
      const occurrence = result.events.find(item => item.id === target.id);
      if (!occurrence) throw new Error('Событие уже удалено или перенесено. Обновите календарь.');
      event = toDemo(occurrence); events.value.push(event);
    }
    openEvent(event);
  } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось открыть настройки события.'); }
}
async function loadMatches() {
  const { matches: list } = await api('/api/integration/matches') as { matches: MatchItem[] };
  matches.value = list;
}
async function loadTypeSuggestions() {
  try {
    const { suggestions } = await api('/api/type-suggestions') as { suggestions: TypeSuggestion[] };
    typeSuggestions.value = suggestions;
  } catch { typeSuggestions.value = []; }
}
function applyStatus(next: IntegrationStatus) {
  integration.value = next;
  mode.value = next.state === 'manual' || next.state === 'none' ? 'manual' : 'connected';
}
async function loadIntegration() {
  const { integration: next } = await api('/api/integration') as { integration: IntegrationStatus };
  applyStatus(next);
}
function notify(value: string) { notification.value = value; clearTimeout(timer); timer = setTimeout(() => { notification.value = ''; },5000); }
async function go(value: string) {
  eventError.value='';
  scene.value = value; history.pushState(null,'',`/admin?screen=${encodeURIComponent(value)}&adminUi=${modernUi ? 'lino' : 'classic'}`);
  if (value === 'connect-error') connectMessage.value = 'Не удалось подключить календарь. Начните подключение заново.';
  await nextTick();
  if (value === 'type-edit') await typePanel.value?.startEditByName('Сатурналии');
  if (value === 'type-new') await typePanel.value?.startCreate();
  if (!overlay.value) window.scrollTo(0,0);
}
function closeOverlay() { if(eventSaving.value) return; const target=queueOverlay.value?'access':analytics.value ? 'participants' : mode.value === 'manual' ? 'manual' : 'calendar';queueOverlay.value=false;go(target); }
async function openParticipant(row: { id: string; nick: string }) {
  selectedParticipant.value = row;
  profile.value = null; profileError.value = '';
  go('participant');
  await loadProfile();
}
async function loadProfile() {
  if (!selectedParticipant.value) return;
  profileLoading.value = true; profileError.value = '';
  try {
    const period = profilePeriod.value === 'За всё время' ? 'all' : '3months';
    profile.value = (await api(`/api/analytics/participants/${encodeURIComponent(selectedParticipant.value.id)}?period=${period}`)).profile;
  } catch (error) { profileError.value = error instanceof Error ? error.message : 'Не удалось загрузить профиль.'; }
  finally { profileLoading.value = false; }
}
function openEvent(event: DemoEvent) { selectedId.value = event.id; go('event'); }
function onPop() { scene.value = new URL(location.href).searchParams.get('screen') ?? 'calendar'; }
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && overlay.value) closeOverlay();
  if (event.key === 'Tab' && overlay.value) {
    const dialog = document.querySelector<HTMLElement>('.admin-overlay');
    const controls = [...dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') ?? []].filter(node=>node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}
async function connect() {
  if (connecting.value) return;
  connectMessage.value = '';
  connecting.value = true;
  try {
    const { integration: next } = await api('/api/integration/connect', { method: 'POST', body: JSON.stringify({ provider: provider.value.startsWith('Яндекс') ? 'yandex' : 'google', url: calendarLink.value }) }) as { integration: IntegrationStatus };
    calendarLink.value = '';
    applyStatus(next); await loadEvents(); await loadMatches();
    go(next.state === 'error' ? 'integration-error' : 'integration-connected');
  } catch (error) { connectMessage.value = error instanceof Error ? error.message : 'Не удалось подключить календарь.'; }
  finally { connecting.value = false; }
}
async function skipCalendar() {
  try { const { integration: next } = await api('/api/integration', { method: 'POST', body: JSON.stringify({ action: 'manual' }) }) as { integration: IntegrationStatus }; applyStatus(next); }
  catch { mode.value = 'manual'; }
  go('manual');
}
async function updateIntegration() {
  go('integration-syncing');
  try {
    const { integration: next } = await api('/api/integration', { method: 'POST', body: JSON.stringify({ action: 'sync' }) }) as { integration: IntegrationStatus };
    applyStatus(next); await loadEvents(); await loadMatches();
    go(next.state === 'error' ? 'integration-error' : 'integration-connected');
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Синхронизация не удалась.');
    try { await loadIntegration(); } catch {}
    go('integration-error');
  }
}
async function disconnectCalendar() {
  try {
    const { integration: next } = await api('/api/integration', { method: 'POST', body: JSON.stringify({ action: 'disconnect' }) }) as { integration: IntegrationStatus };
    applyStatus(next);
  } catch { mode.value = 'disconnected'; }
  go('integration-disconnected');
}
async function saveEvent(event: DemoEvent & {repeatRule?:unknown;scope:string;changes:Record<string,unknown>;degree:string|null;topicLodgeId:string|null;audienceLodgeIds:string[]}) {
  if(eventSaving.value) return;
  eventSaving.value=true; eventError.value='';
  const editing=['event-edit','event-settings','appearance-event'].includes(scene.value);
  try {
    if(editing) await api('/api/events/'+encodeURIComponent(event.id), {method:'PUT',body:JSON.stringify({scope:event.scope,changes:event.changes})});
    else {
      const type=currentTypes.value.find(item=>item.name===event.typeName);
      const result=await api('/api/events',{method:'POST',body:JSON.stringify({requestId:event.id,title:event.title,date:event.date,start:event.start,end:event.end,url:event.url,description:event.description,venue:'',typeId:type?.id ?? null,repeatRule:event.repeatRule ?? null,degree:event.degree,topicLodgeId:event.topicLodgeId,audienceLodgeIds:event.audienceLodgeIds,...event.changes})});
      selectedId.value=result.event.id;
    }
    await loadEvents();
    if(editing) go('event'); else go(mode.value === 'manual' ? 'manual' : 'calendar');
    notify(editing ? 'Изменения сохранены.' : 'Событие сохранено.');
  } catch(error) { eventError.value=error instanceof Error ? error.message : 'Не удалось сохранить. Данные в форме сохранены.'; }
  finally { eventSaving.value=false; }
}
const deleting = ref(false);
async function removeEvent(releaseOnly: boolean) {
  if (deleting.value) return;
  deleting.value = true;
  try {
    const at = selected.value.id.lastIndexOf('@');
    const target = releaseOnly || at < 0 ? selected.value.id : selected.value.id.slice(0, at);
    await api(`/api/events/${encodeURIComponent(target)}`, { method: 'DELETE' });
    await loadEvents();
    notify(releaseOnly ? 'Выпуск отменён, остальная серия сохранена.' : 'Событие удалено.');
    closeOverlay();
  } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось удалить событие.'); }
  finally { deleting.value = false; }
}
async function assignEventType(event: DemoEvent, value: string | number | null) {
  const type = currentTypes.value.find(item => item.name === value);
  if (!type) return;
  try {
    await api('/api/type-suggestions/resolve', { method: 'POST', body: JSON.stringify({ eventId: event.eventId ?? event.id.split('@')[0], typeId: type.id, action: 'other' }) });
    await loadEvents(); await loadTypeSuggestions();
    notify('Тип события сохранён для всей серии.');
  } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось назначить тип.'); }
}
async function refreshTypes() { try {currentTypes.value = (await api('/api/types')).types; await loadEvents();} catch(error){notify(error instanceof Error?error.message:'Не удалось обновить типы.');} }
function openAppearance() {
  appearanceInitial.value = typePanel.value?.getAppearanceDraft() ?? null;
  go('appearance-type');
}
function applyAppearance(value: { cover: string | null; appearance: Appearance }) {
  typePanel.value?.applyAppearance(value); closeOverlay(); notify('Оформление применено. Сохраните тип.');
}
async function resolveTypeSuggestion(eventId: string, typeId: string | null, action: 'accept' | 'other' | 'skip') {
  try {
    await api('/api/type-suggestions/resolve', { method: 'POST', body: JSON.stringify({ eventId, typeId, action }) });
    await loadEvents(); await loadTypeSuggestions();
    notify(action === 'skip' ? 'Пропущено до следующей синхронизации.' : 'Тип назначен событию.');
  } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось назначить тип.'); }
}
async function resolveMatch(externalId: string, action: 'link' | 'import' | 'skip') {
  try {
    await api(`/api/integration/matches/${encodeURIComponent(externalId)}`, { method: 'POST', body: JSON.stringify({ action }) });
    if (action !== 'skip') {
      const { integration: next } = await api('/api/integration', { method: 'POST', body: JSON.stringify({ action: 'sync' }) }) as { integration: IntegrationStatus };
      applyStatus(next);
    }
    await loadEvents(); await loadMatches();
    notify(action === 'link' ? 'События связаны.' : action === 'import' ? 'Событие импортировано отдельно.' : 'Пропущено до следующей синхронизации.');
  } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось применить решение.'); }
}
onMounted(async () => {
  try { await Promise.all([loadEvents(), loadIntegration(), loadMatches(), loadTypeSuggestions(), api('/api/lodges').then(result=>{lodges.value=result.lodges;})]); } catch { notification.value = 'Не удалось загрузить данные сервера. Обновите страницу.'; }
  if (scene.value === 'manual') mode.value = 'manual';
  if (scene.value === 'type-edit') { await nextTick(); await typePanel.value?.startEditByName('Сатурналии'); }
  if (scene.value === 'type-new') { await nextTick(); await typePanel.value?.startCreate(); }
  if (overlay.value) { document.body.style.overflow = 'hidden'; document.querySelector<HTMLElement>('.admin-overlay')?.focus(); }
  if (scene.value === 'connect-error') connectMessage.value = 'Не удалось подключить календарь. Начните подключение заново.';
  window.addEventListener('popstate',onPop); window.addEventListener('keydown',onKey);
});
watch(scene, async () => { await nextTick(); document.body.style.overflow = overlay.value ? 'hidden' : ''; if (overlay.value) document.querySelector<HTMLElement>('.admin-overlay')?.focus(); });
let refreshTimer: ReturnType<typeof setInterval>;
onMounted(() => {
  // Auto-refresh the workspace so external calendar changes appear without a manual reload.
  // Skipped while any overlay/editor is open so in-progress edits are never disturbed.
  refreshTimer = setInterval(() => {
    if (overlay.value || eventForm.value || document.querySelector('.type-editor')) return;
    loadEvents().catch(() => {});
    loadMatches().catch(() => {});
    loadTypeSuggestions().catch(() => {});
  }, 30_000);
});
onBeforeUnmount(() => { clearTimeout(timer); clearInterval(refreshTimer); document.body.style.overflow = ''; window.removeEventListener('popstate',onPop); window.removeEventListener('keydown',onKey); });
</script>

<template>
  <main v-admin-material="modernUi" class="admin-shell" :class="{ 'auth-shell': isLogin, 'admin-ui--lino': modernUi }" :data-screen="scene" @mouseover="onAdminButtonHover">
    <div v-if="isLogin" class="auth-card admin-panel">
      <template v-if="scene === 'login'"><h1>Админка календаря</h1><p>Войдите через Telegram. Доступ есть у редакторов событий сообщества</p><MentorButton @click="go('connect')">Войти через Telegram</MentorButton></template>
      <template v-else><img class="lock-illustration" src="/assets/auth/lock.svg" width="48" height="48" alt=""/><h1>Нет доступа</h1><p>У этого аккаунта нет прав на доступ к админке</p><div class="account-row"><span class="avatar">МЛ</span><span>@nickname</span><button class="text-action" @click="go('login')">Сменить аккаунт</button></div></template>
    </div>
    <template v-else>
      <header class="admin-heading"><h1>Админка</h1><button v-if="!isConnect" class="integration-status" @click="go(mode === 'manual' || mode === 'disconnected' ? 'integration-disconnected' : 'integration-connected')"><img src="/assets/input/calendar-default.svg" width="24" height="24" alt=""/>{{ status }}</button></header>
      <section v-if="isConnect" class="admin-panel connect-panel">
        <h2>Подключите календарь</h2><SegmentedControl v-model="provider" :options="['Google Календарь','Яндекс Календарь']" label="Календарь" fluid/>
        <template v-if="provider.startsWith('Яндекс')">
          <ol class="connection-steps"><li>Откройте Яндекс.Календарь и настройки нужного календаря</li><li>Во вкладке «Экспорт» скопируйте ссылку iCal</li><li>Вставьте ссылку ниже и нажмите «Подключить»</li></ol>
        </template>
        <template v-else>
          <ol class="connection-steps"><li>Откройте Google Календарь → настройки нужного календаря</li><li>В разделе «Интеграция календаря» скопируйте закрытый адрес в формате iCal</li><li>Вставьте ссылку ниже и нажмите «Подключить»</li></ol>
        </template>
        <FigmaField id="calendar-source" v-model="calendarLink" label="Ссылка iCal" :disabled="connecting" :error="connectMessage"/>
        <div class="button-row"><MentorButton :disabled="connecting" @click="connect">{{ connecting ? 'Подключаем…' : 'Подключить' }}</MentorButton><MentorButton :disabled="connecting" :variant="1" @click="skipCalendar">Пропустить</MentorButton></div>
      </section>
      <template v-else>
        <nav class="admin-tabs" aria-label="Разделы админки"><button :aria-current="!analytics ? 'page' : undefined" @click="go('calendar')">Календарь</button><button :aria-current="analytics ? 'page' : undefined" @click="go('participants')">Участники</button></nav>
        <ParticipantsPanel v-if="analytics" :key="scene === 'participant' ? 'participants' : scene" :scene="scene" @participant="openParticipant" @retry="go('participants')"/>
        <template v-else>
          <section v-if="matches.length" class="admin-panel matches-panel">
            <div class="panel-heading"><h2>Похожие события из подключённого календаря</h2></div>
            <p class="demo-note">Внешнее событие похоже на созданное вручную. Решите, что с ним делать; импорт не продолжится, пока пары не разобраны.</p>
            <article v-for="match in matches" :key="match.externalId" class="match-row">
              <div class="match-pair"><div><strong>{{ match.externalTitle }}</strong><p>{{ dateShortLabel(match.externalDate) }} · {{ match.externalStart }}–{{ match.externalEnd }} · Google Calendar</p></div><span class="match-arrow" aria-hidden="true">↔</span><div><strong>{{ match.manualTitle }}</strong><p>{{ dateShortLabel(match.manualDate) }} · Админка</p></div></div>
              <div class="button-row"><MentorSecondaryButton @click="resolveMatch(match.externalId,'link')">Связать</MentorSecondaryButton><MentorSecondaryButton @click="resolveMatch(match.externalId,'import')">Импортировать отдельно</MentorSecondaryButton><MentorSecondaryButton @click="resolveMatch(match.externalId,'skip')">Пропустить</MentorSecondaryButton></div>
            </article>
          </section>
          <section v-if="typeSuggestions.length" class="admin-panel matches-panel">
            <div class="panel-heading"><h2>События без типа</h2></div>
            <p class="demo-note">Система предлагает тип по словам в названии. Подтвердите предложение или назначьте другой тип; пропуск действует до следующей синхронизации.</p>
            <article v-for="item in typeSuggestions" :key="item.eventId" class="match-row">
              <div class="match-pair"><div><strong>{{ item.title }}</strong><p>{{ dateShortLabel(item.date) }} · импортированное событие</p></div></div>
              <div class="button-row">
                <MentorSecondaryButton v-for="suggestion in item.suggestions" :key="suggestion.id" @click="resolveTypeSuggestion(item.eventId, suggestion.id, 'accept')">Это «{{ suggestion.name }}»</MentorSecondaryButton>
                <FigmaField :id="`suggestion-type-${item.eventId}`" v-model="typeChoices[item.eventId]" label="Другой тип" hidden-label placeholder="Другой тип…" type="select" :options="typeNames.map(name => ({ label: name, value: name }))"/>
                <MentorSecondaryButton :disabled="!typeChoices[item.eventId]" @click="resolveTypeSuggestion(item.eventId, currentTypes.find((type: any) => type.name === typeChoices[item.eventId])?.id ?? null, 'other')">Назначить</MentorSecondaryButton>
                <MentorSecondaryButton @click="resolveTypeSuggestion(item.eventId, null, 'skip')">Пропустить</MentorSecondaryButton>
              </div>
            </article>
          </section>
          <div class="workspace-grid">
            <section class="admin-panel event-list"><div class="panel-heading"><h2>{{ scene === 'access' ? 'События без типа' : 'События' }}</h2><button class="text-action" @click="go(scene === 'access' ? 'calendar' : 'access')">{{ scene === 'access' ? 'Все события' : 'События без типа' }}</button></div>
              <p v-if="mode === 'manual'" class="demo-note">Ручной режим · внешний календарь не подключён</p>
              <template v-if="scene === 'access'">
                <p v-if="!eventsLoaded && !eventsLoadError" role="status">Загружаем события…</p><p v-if="eventsLoadError" role="alert">{{eventsLoadError}}</p>
                <article v-for="group in untypedGroups" :key="group.key" v-lino-surface="true" class="event-list-card untyped-event-card admin-event-lino" :aria-busy="assignmentBusy[group.key] || false">
                  <button class="event-title text-action" type="button" @click="openGroup(group)">{{group.first.title}}</button>
                  <p v-if="group.series" class="demo-note">Серия · {{group.events.length}} выпусков без типа в периоде</p>
                  <p class="event-meta">{{dateLabel(group.first.date)}} · {{group.first.start}}–{{group.first.end}} МСК</p>
                  <p v-if="differentAccess(group)" class="demo-note">Разные условия доступа</p>
                  <UntypedAccessTags v-else :event="group.first" :lodges="lodges"/>
                  <button v-if="group.series" class="text-action" type="button" @click="openGroup(group)">Посмотреть выпуски</button>
                  <div class="untyped-assignment">
                    <FigmaField :id="`untyped-${group.first.id}`" :model-value="assignmentChoices[group.key] ?? ''" label="Тип события" type="select" :disabled="assignmentBusy[group.key] || !currentTypes.length" :options="[{label:'Выбрать тип',value:''},...currentTypes.map(type=>({label:type.name,value:type.id}))]" @update:model-value="assignmentChoices[group.key]=String($event ?? '')"/>
                    <MentorSecondaryButton :disabled="!assignmentChoices[group.key] || assignmentBusy[group.key]" @click="assignQueue(queueContext(group))">Назначить тип</MentorSecondaryButton>
                    <button class="text-action" type="button" :disabled="assignmentBusy[group.key]" @click="createQueueType(group)">Создать тип</button>
                  </div>
                  <p v-if="group.series" class="demo-note">Назначить для {{group.events.length}} выпусков серии</p>
                  <p v-if="assignmentErrors[group.key]" class="feedback error" role="alert">{{assignmentErrors[group.key]}}</p>
                </article>
              </template>
              <template v-else>
                <p v-if="!eventsLoaded && !eventsLoadError" role="status">Загружаем события…</p><p v-if="eventsLoadError" role="alert">{{eventsLoadError}}</p>
                <article v-for="group in eventGroups" :key="group.key" v-lino-surface="true" class="event-list-card event-group-card admin-event-lino">
                  <div class="event-list-heading">
                    <div class="event-list-identity"><img v-if="group.first.cover" class="list-cover" :src="group.first.cover" alt="Обложка показанного выпуска"/><span v-else class="list-cover missing-cover">Без обложки</span><div><p class="demo-note">{{ group.series ? 'Серия · '+group.events.length+' выпусков в периоде' : 'Разовое событие' }}</p><button class="event-title text-action" type="button" @click="openGroup(group)">{{ group.first.title }}</button><p class="event-meta">{{ group.series ? 'Показан выпуск: ' : '' }}{{ dateLabel(group.first.date) }} · {{ group.first.start }}–{{ group.first.end }} МСК</p></div></div>
                    <EventAccessTags :event="group.first" :lodges="lodges"/>
                  </div>
                  <div class="button-row"><button class="text-action" @click="openGroup(group)">{{ group.series ? 'Выпуски серии' : 'Открыть событие' }}</button><button class="text-action" @click="selectedId=group.first.id; go('event-settings')">Редактировать</button><button v-if="group.first.source === 'Админка'" class="text-action" @click="selectedId=group.first.id; go('event-delete')">Удалить</button></div>
                </article>
              </template>
              <div v-if="scene === 'access' ? eventsLoaded && !untypedGroups.length : eventsLoaded && !events.length" class="empty-state"><h3>{{ scene === 'access' ? 'Все события распределены по типам' : 'Событий пока нет' }}</h3><p>{{ scene === 'access' ? 'Новые события без назначенного типа появятся здесь' : 'Добавьте первое событие вручную.' }}</p></div>
            </section>
            <aside class="workspace-aside"><p v-if="typeContext" class="demo-note">Новый тип для «{{typeContext.title}}»</p><TypesPanel ref="typePanel" :initial-types="currentTypes" :events="events" external-appearance @appearance="openAppearance()" @saved="refreshTypes" @created="queueTypeCreated" @cancelled="typeContext=null"/>
              <EventEditor v-if="eventForm" :key="scene === 'event-edit' ? selected.id : scene + creationDate" :scene="scene" :type-names="typeNames" :types="currentTypes" :lodges="lodges" :initial-date="creationDate" :busy="eventSaving" :server-error="eventError" :initial="scene === 'event-edit' ? selected : null" @save="saveEvent" @assign-type="assignEventType(selected, $event)" @close="go('calendar')"/>
              <button v-else class="manual-event-button admin-panel" @click="creationDate=''; go('event-new')"><img src="/assets/panel/e7fb1.svg" width="18" height="18" alt=""/>Добавить событие вручную</button>
            </aside>
          </div>
          <section v-if="scene !== 'access'" class="admin-preview" aria-label="Превью пользовательского календаря"><UserCalendar embedded :revision="calendarRevision" @manage="manageCalendarEvent" @create="createOnDate"/></section>
        </template>
      </template>
    </template>
    <p v-if="notification" class="admin-toast" role="status">{{ notification }}</p>
    <AdminDialog v-if="overlay" :label="sceneTitle" :textured="['event-group','event-delete'].includes(scene)" :classes="{ 'admin-event-lino': !modernUi && ['event-group','event-delete'].includes(scene), 'wide-overlay': scene.startsWith('appearance-'), 'event-overlay': ['event','event-settings','event-delete','event-group'].includes(scene), 'drawer-overlay': scene.startsWith('integration-') || scene==='participant' }" @close="closeOverlay">
        <IntegrationPanel v-if="scene.startsWith('integration-')" :state="scene === 'integration-syncing' ? 'syncing' : panelState" :summary="integration?.calendarSummary" :last-sync-at="integration?.lastSyncAt" :last-sync-error="integration?.lastSyncError" :provider="integration?.provider" @close="closeOverlay" @change="go('connect')" @update="updateIntegration" @disconnect="disconnectCalendar"/>
        <AppearanceEditor v-else-if="scene === 'appearance-type'" :initial="appearanceInitial ?? undefined" @close="closeOverlay" @apply="applyAppearance"/>
        <section v-else-if="scene === 'participant'" class="participant-profile"><div class="panel-heading"><h2>Активность участника</h2><button class="close-button" aria-label="Закрыть участника" @click="closeOverlay">×</button></div>
          <p v-if="profileLoading" role="status" class="feedback"><LinoSpinner/>Загружаем профиль…</p>
          <template v-else-if="profile">
            <h3>{{ profile.participant.nick }}</h3>
            <div class="button-row"><span v-if="profile.participant.degree" class="degree-badge" :data-degree="profile.participant.degree">{{ profile.participant.degree }} градус</span><span v-else>Градус не задан</span></div>
            <FigmaField id="participant-period" v-model="profilePeriod" label="Период" type="select" :options="[{value:'Последние 3 месяца',label:'Последние 3 месяца'},{value:'За всё время',label:'За всё время'}]" @update:model-value="loadProfile"/>
            <div class="metrics"><div><strong>{{ profile.metrics.viewed }}</strong><span>Событий просмотрено</span></div><div><strong>{{ profile.metrics.opened }}</strong><span>Переходов к событиям</span></div><div><strong>{{ profile.metrics.reminders }}</strong><span>Напоминаний включено</span></div></div>
            <h3>История событий</h3>
            <div v-if="!profile.history.length" class="empty-state"><h3>Активности в периоде нет</h3></div>
            <template v-else>
              <div class="history-head"><span>Событие</span><span>Действие</span><span>Напоминание</span></div>
              <div v-for="row in profile.history" :key="row.eventKey" class="history-row"><div><strong>{{ row.title ?? 'Событие удалено' }}</strong><p>{{ row.eventDate ? dateShortLabel(row.eventDate) : '' }}</p></div><span>{{ row.opened ? 'Перешёл' : 'Посмотрел' }}</span><span class="history-reminder"><img :src="row.reminder ? '/assets/reminder/reminder-bell.svg' : '/assets/reminder/reminder-bell-off.svg'" width="16" height="16" alt=""/>{{ row.reminder ? 'Включено' : 'Не включено' }}</span></div>
            </template>
          </template>
          <div v-else class="empty-state"><h3>{{ selectedParticipant ? 'Не удалось загрузить профиль' : 'Участник не выбран' }}</h3><p>{{ selectedParticipant ? (profileError || 'Попробуйте закрыть и открыть участника снова.') : 'Откройте участника из таблицы на вкладке «Участники».' }}</p><button v-if="selectedParticipant" class="secondary" @click="loadProfile">Повторить</button></div>
          <p class="demo-note">История — зафиксированные действия; переход по ссылке не подтверждает посещение.</p></section>
        <section v-else-if="scene === 'event-group'" class="event-group-popup"><div class="panel-heading"><h2>{{ activeGroup?.first.title }}</h2><button class="close-button" aria-label="Закрыть список событий" @click="closeOverlay">×</button></div>
          <p v-if="activeGroup" class="demo-note">{{ activeGroup.events.length }} {{ pluralEvents(activeGroup.events.length) }} · нажмите, чтобы открыть выпуск</p>
          <div v-if="activeGroup" class="group-release-list">
            <template v-for="release in activeGroup.events" :key="release.id">
            <div v-if="queueOverlay" class="queue-release"><button class="group-release" @click="openEvent(release)"><img v-if="release.cover" class="list-cover" :src="release.cover" alt="Обложка выпуска"/><span v-else class="list-cover missing-cover">Без обложки</span><span>{{release.title}}<br/>{{dateLabel(release.date)}} · {{release.start}}–{{release.end}}</span></button><UntypedAccessTags :event="release" :lodges="lodges"/></div>
            <button v-else class="group-release" @click="openEvent(release)">
              <img v-if="release.cover" class="list-cover" :src="release.cover" alt="Обложка выпуска"/><span v-else class="list-cover missing-cover">Без обложки</span><span>{{ release.title }}<br/>{{ dateLabel(release.date) }} · {{ release.start }}–{{ release.end }}</span>
              <span class="release-access">{{ accessSummary(release) }}</span>
            </button>
            </template>
          </div>
        </section>
        <EventEditor v-else-if="['event-settings','appearance-event'].includes(scene)" :start-appearance="scene === 'appearance-event'" :key="selected.id" scene="event-edit" :type-names="typeNames" :types="currentTypes" :lodges="lodges" :initial="selected" :busy="eventSaving" :server-error="eventError" @save="saveEvent" @assign-type="assignEventType(selected, $event)" @close="go('event')"/>
        <section v-else-if="scene === 'event-delete'" class="event-detail confirm-delete" role="group" aria-label="Удаление события">
          <button class="close-button detail-close" aria-label="Отменить удаление события" :disabled="deleting" @click="go('event')">×</button>
          <h2>Удалить «{{ selected.title }}»?</h2>
          <p v-if="isSeriesRelease">Удаление отменит все выпуски серии. Чтобы убрать один выпуск, нажмите «Только этот выпуск».</p>
          <p v-else>Это действие нельзя отменить.</p>
          <div class="button-row">
            <MentorButton :disabled="deleting" @click="removeEvent(false)">{{ deleting ? 'Удаляем…' : 'Удалить' }}</MentorButton>
            <MentorButton v-if="isSeriesRelease" :variant="1" :disabled="deleting" @click="removeEvent(true)">Только этот выпуск</MentorButton>
          </div>
        </section>
        <section v-else class="event-detail"><button class="close-button detail-close" aria-label="Закрыть событие" @click="closeOverlay">×</button><img v-if="selected.cover" class="event-hero" :src="selected.cover" alt=""/><div class="event-detail-content"><h2>{{ selected.title }}</h2><h3>{{ dateLabel(selected.date) }} в {{ selected.start }}</h3><p>{{ selected.description }}</p><div class="button-row"><span class="tier-badge">{{ accessSummary(selected) }}</span><span>{{ selected.points }} е-баллов</span></div><p>Источник: {{ selected.source }}</p><p>Повтор: {{ selected.sourceSeriesId ? "Серия из календаря-источника" : selected.repeat }}</p><MentorButton @click="go('event-settings')">Настройки события</MentorButton><div v-if="isManualSelected" class="detail-actions"><button class="text-action" @click="go('event-settings')">Редактировать событие</button><button class="text-action danger-action" @click="go('event-delete')">Удалить событие</button></div></div></section>
    </AdminDialog>
  </main>
</template>
<style scoped>
.matches-panel { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.match-row { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--bg-canvas); padding-top: 12px; }
.match-pair { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.match-pair p { margin: 4px 0 0; color: var(--text-secondary); }
.match-arrow { color: var(--text-secondary); }
.confirm-delete { position: relative; display: flex; flex-direction: column; gap: var(--space-4); border: 0; }
.confirm-delete h2 { margin-top: 0; padding-right: var(--control-compact); }
.confirm-delete .button-row { margin-top: var(--space-2); }
.detail-actions { display: flex; gap: 16px; margin-top: 12px; }
.danger-action, .danger-action:hover { color: var(--error); }
.event-list-identity { display:flex; align-items:start; gap:var(--space-4); }
.untyped-assignment { display:flex;flex-wrap:wrap;align-items:flex-end;gap:var(--space-3);min-width:0; }
.untyped-assignment > :first-child { flex:1;min-width:0; }
@media (max-width:700px) { .untyped-assignment > :first-child { flex-basis:100%; } }
.event-list-heading { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:var(--space-4); min-width:0; }
.event-list-heading > .event-list-identity { flex:1 1 calc(var(--space-32) * 3); min-width:0; }
.event-list-heading > .event-access-tags { flex:0 1 auto; }
@media (max-width:700px) { .event-list-heading > .event-list-identity, .event-list-heading > .event-access-tags { flex-basis:100%; } }
.event-list-identity > div { flex:1; min-width:0; overflow-wrap:anywhere; }
.event-list-identity .event-title { text-align:left; }
@media (max-width:600px) {
 .event-list-identity { flex-wrap:wrap; }
 .event-list-identity > div { flex-basis:100%; }
 .event-list-identity .missing-cover { flex-basis:100%; width:auto; height:auto; }
}
.list-cover { flex:0 0 var(--event-cover-width); width:var(--event-cover-width); height:var(--event-cover-height); object-fit:cover; }
.missing-cover { font-size:var(--input-helper-size); color:var(--text-secondary); }
.group-release { flex-wrap:wrap; }
.group-release > span { flex:1; min-width:0; overflow-wrap:anywhere; }
.event-group-more { margin: 0; color: var(--text-secondary); font-size: var(--input-helper-size); }
.event-list-card .event-card-next { font-weight: var(--font-weight-medium); color: var(--text-primary); }
.group-release-list { display: flex; flex-direction: column; gap:var(--space-4); }
.release-access { grid-column:2; font-size:var(--input-helper-size); color:var(--text-secondary); }
.group-release { display: grid; grid-template-columns: var(--event-cover-width) minmax(0, 1fr); align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border: 0;  background: none; color: var(--text-primary); font: inherit; text-align: left; cursor: pointer; }
</style>
