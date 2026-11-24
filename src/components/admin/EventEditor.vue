<script setup lang="ts">
import { computed, ref } from 'vue';
import FigmaField from '../ui/LinoField.vue';
import MentorButton from '../ui/MentorButton.vue';
import RepeatMenu from '../ui/RepeatMenu.vue';
import {repeatMenuOptions} from '../../lib/repeat-menu-options';
import RepeatSettings from '../ui/RepeatSettings.vue';
import type { DemoEvent } from '../../lib/admin-demo';
import AppearanceEditor from './AppearanceEditor.vue';
import type { Appearance } from '../../lib/appearance';
import { linoSurface as vLinoSurface } from '../../lib/lino-card-frame';
import { normalizedAppearance } from '../../lib/event-settings';
import {useAdminLino} from '../../lib/admin-ui';
import LinoSwitch from '../ui/LinoSwitch.vue';
import LinoSeparator from '../ui/LinoSeparator.vue';
import LinoSpinner from '../ui/LinoSpinner.vue';
const modern=useAdminLino();

type RepeatRuleState = { freq: string; interval: number; byWeekday: number[]; until: string | null; count: number | null };
const props = defineProps<{ scene: string; typeNames: string[]; types?: any[]; lodges?: {id:string;name:string;iconUrl:string|null}[]; initialDate?: string; startAppearance?: boolean; busy?: boolean; serverError?: string; initial?: (DemoEvent & { repeatRule?: unknown | null }) | null }>();
const emit = defineEmits<{ save: [event: DemoEvent & { repeatRule: unknown | null; scope: string; changes: Record<string,unknown>; degree: string|null; topicLodgeId: string|null; audienceLodgeIds: string[] }]; close: []; assignType: [name:string] }>();

const editing = computed(() => Boolean(props.initial));
const source = props.initial ?? null;
const draftId = source?.id ?? crypto.randomUUID();
const name = ref(source?.title ?? '');
const type = ref(source?.typeName && props.typeNames.includes(source.typeName) ? source.typeName : props.typeNames[0] ?? 'Конгресс');
const date = ref(source?.date ?? (props.initialDate || new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Moscow'}).format(new Date())));
const start = ref(source?.start ?? '19:00'), end = ref(source?.end ?? '20:30'), link = ref(source?.ownUrl ?? source?.url ?? ''), description = ref(source?.description ?? '');
const external = Boolean(source && source.source !== 'Админка');
const degree = ref(source?.degreeOverride ? source.typeDegree ?? '' : 'inherit');
const topic = ref(source?.communityEvent ? '__community' : source?.topicLodgeId ?? '');
const affiliationDegree = ref(source?.affiliationDegree ?? '');
const audience = ref<string[]>([...(source?.audienceLodgeIds ?? [])]);
const legacyAccess = ref(source?.accessOverride ? source.access : 'inherit');
const inheritPoints = ref(!source?.pointsOverride), points = ref(source?.points ?? 0);
const legacyOptions = computed(() => [{value:'inherit',label:`По типу: ${currentType.value?.accessLabel || 'Все'}`},...[...new Set(['Все',...(props.types ?? []).map(item=>item.accessLabel).filter(Boolean),source?.access].filter(Boolean))].map(value=>({value:value as string,label:value as string}))]);
const appearanceOpen = ref(Boolean(props.startAppearance)), chooseScope = ref(false);
const cover = ref(source?.cover ?? ''), appearance = ref<Appearance|null>(source?.appearance ?? null);
const appearanceChanged = ref(false), restoreAppearance = ref(false);
const currentType = computed(() => props.types?.find(item => item.name === type.value));
const displayedCover = computed(() => editing.value || appearanceChanged.value ? cover.value : currentType.value?.coverPath ?? '');
const degreeOptions = computed(() => [{value:'inherit',label:`По типу: ${currentType.value?.degree ? `не ниже ${currentType.value.degree}` : 'любой градус'}`},{value:'',label:'Любой градус'},...['I','II','III'].map(value=>({value,label:`Не ниже ${value} градуса`}))]);
function applyAppearance(value:{cover:string|null;appearance:Appearance}) { cover.value=value.cover ?? ''; appearance.value=value.appearance; appearanceChanged.value=true; restoreAppearance.value=false; appearanceOpen.value=false; }

const initialRule = (source?.repeatRule ?? null) as RepeatRuleState | null;
const repeat = ref('Не повторять');
const menuOpen = ref(!source && props.scene === 'event-repeat');
const custom = ref(false), interval = ref(1), unit = ref('Неделю'), finish = ref('never'), until = ref('2026-12-31'), count = ref(10), days = ref(['Пн','Чт']);
if (initialRule) {
  const units: Record<string, string> = { daily: 'День', weekly: 'Неделю', monthly: 'Месяц', yearly: 'Год' };
  const weekdayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  repeat.value = 'Настроить…';
  custom.value = true;
  interval.value = initialRule.interval || 1;
  unit.value = units[initialRule.freq] ?? 'Неделю';
  days.value = initialRule.byWeekday?.length ? initialRule.byWeekday.map(index => weekdayNames[index] ?? 'Пн') : days.value;
  finish.value = initialRule.until ? 'date' : initialRule.count ? 'count' : 'never';
  if (initialRule.until) until.value = initialRule.until;
  if (initialRule.count) count.value = initialRule.count;
}
const error = ref('');
const typeOptions = computed(() => props.typeNames.map(value => ({ label: value, value })));
function selectRepeat(value: string) { repeat.value = value; menuOpen.value = false; custom.value = value === 'Настроить…'; }
function ruleFromState(): unknown | null {
  const weekday = (new Date(`${date.value || '2026-01-01'}T12:00:00`).getDay() + 6) % 7;
  if (repeat.value === 'Не повторять') return null;
  if (repeat.value === 'Каждый день') return { freq: 'daily', interval: 1, byWeekday: [], until: null, count: null };
  if (repeat.value.startsWith('Каждую неделю')) return { freq: 'weekly', interval: 1, byWeekday: [weekday], until: null, count: null };
  if (repeat.value.startsWith('Каждый месяц')) return { freq: 'monthly', interval: 1, byWeekday: [], until: null, count: null };
  if (repeat.value.startsWith('Каждый год')) return { freq: 'yearly', interval: 1, byWeekday: [], until: null, count: null };
  if (repeat.value === 'Настроить…') {
    const freq = ({ 'День': 'daily', 'Неделю': 'weekly', 'Месяц': 'monthly', 'Год': 'yearly' } as Record<string, string>)[unit.value] ?? 'weekly';
    const picked = days.value.map(day => ({ 'Пн': 0, 'Вт': 1, 'Ср': 2, 'Чт': 3, 'Пт': 4, 'Сб': 5, 'Вс': 6 }[day] ?? 0));
    return {
      freq, interval: interval.value,
      byWeekday: freq === 'weekly' ? (picked.length ? picked : [weekday]) : [],
      until: finish.value === 'date' ? until.value : null,
      count: finish.value === 'count' ? count.value : null,
    };
  }
  return null;
}
function save(scope = '') {
  if (props.busy) return;
  error.value = '';
  if (!name.value.trim() || !date.value || !start.value || !end.value) { error.value = 'Заполните название, дату и время.'; return; }
  if (end.value === start.value) { error.value = 'Начало и конец не должны совпадать.'; return; }
  if (link.value && !/^https?:\/\//.test(link.value)) { error.value = 'Введите ссылку, начинающуюся с https:// или http://.'; return; }
  if (repeat.value === 'Настроить…' && finish.value === 'date' && until.value < date.value) { error.value = 'Дата окончания повторов должна быть не раньше даты события.'; return; }
  const customRepeat = `Интервал ${interval.value} ${unit.value.toLowerCase()} · ${days.value.join(', ')} · ${finish.value === 'date' ? `до ${until.value}` : finish.value === 'count' ? `после ${count.value} повторений` : 'без даты окончания'}`;
  if (source?.repeatRule && !scope) { chooseScope.value=true; return; }
  const changes: Record<string,unknown> = {};
  if (source && !external) for (const [key,value,original] of [['title',name.value.trim(),source.title],['date',date.value,source.date],['start',start.value,source.start],['end',end.value,source.end],['url',link.value,source.ownUrl ?? source.url],['description',description.value,source.description]]) if (value !== original) changes[key as string]=value;
  const desiredDegree = degree.value === 'inherit' ? null : degree.value;
  if (desiredDegree !== (source?.degreeOverride ? source.typeDegree ?? '' : null)) changes.degree=desiredDegree;
  const topicId = topic.value === '__community' ? null : topic.value || null;
  if (topicId !== (source?.topicLodgeId ?? null)) changes.topicLodgeId=topicId;
  if ((topic.value === '__community') !== Boolean(source?.communityEvent)) changes.communityEvent=topic.value === '__community';
  if ((affiliationDegree.value || null) !== (source?.affiliationDegree ?? null)) changes.affiliationDegree=affiliationDegree.value || null;
  if (JSON.stringify([...audience.value].sort()) !== JSON.stringify([...(source?.audienceLodgeIds ?? [])].sort())) changes.audienceLodgeIds=[...audience.value];
  const access = legacyAccess.value === 'inherit' ? null : legacyAccess.value;
  if (access !== (source?.accessOverride ? source.access : null)) changes.accessLabel=access;
  if ((inheritPoints.value ? null : points.value) !== (source?.pointsOverride ? source.points : null)) changes.points=inheritPoints.value ? null : Number(points.value);
  if (restoreAppearance.value) Object.assign(changes,{coverPath:'',appearance:null});
  else if (appearanceChanged.value) {
    if (cover.value !== (source?.cover ?? currentType.value?.coverPath ?? '')) changes.coverPath=cover.value || null;
    if (JSON.stringify(normalizedAppearance(appearance.value)) !== JSON.stringify(normalizedAppearance(source?.appearance ?? currentType.value?.appearance,source?.typeTheme ?? currentType.value?.theme))) changes.appearance=appearance.value;
  }
  emit('save', {
    id: draftId,
    title: name.value.trim(), date: date.value, start: start.value, end: end.value, typeName: type.value,
    source: source?.source ?? 'Админка', access: source?.access ?? 'Настройки типа', points: source?.points ?? 0,
    cover: source?.cover ?? '/assets/panel/a5ff5.png', description: description.value, url: link.value,
    repeat: repeat.value === 'Настроить…' ? customRepeat : repeat.value, repeatRule: ruleFromState(),
    scope: scope || 'occurrence', changes, degree: desiredDegree, topicLodgeId: topicId, communityEvent:topic.value === '__community', affiliationDegree:affiliationDegree.value || null, audienceLodgeIds:[...audience.value],
  });
}
</script>
<template>
  <form v-show="!appearanceOpen" v-lino-surface="!modern" class="admin-panel editor-panel" :class="{'admin-event-lino':!modern}" :aria-busy="busy" @submit.prevent="save()">
    <div class="panel-heading"><h2>{{ editing ? 'Редактировать событие' : 'Добавить событие' }}</h2><button class="close-button" type="button" aria-label="Свернуть добавление события" @click="emit('close')">−</button></div>
    <p v-if="editing" class="demo-note">{{ source?.repeatRule ? 'Выпуск серии' : 'Разовое событие' }} · {{ source?.title }} · {{ source?.date }} · {{ source?.start }} МСК</p>
    <fieldset :disabled="busy || chooseScope" class="editor-fields">
    <FigmaField id="event-name" v-model="name" label="Название" :disabled="external" :max-length="120" required/>
    <FigmaField id="event-type" v-model="type" label="Тип" type="select" :options="typeOptions" :helper="editing ? 'Тип назначается сразу всей серии; остальные поля сохраняются кнопкой ниже.' : undefined" @update:model-value="editing && emit('assignType', $event)"/>
    <FigmaField id="event-date" v-model="date" label="Дата (МСК)" :readonly="external" type="date" required/>
    <p v-if="scene === 'event-past'" class="field-helper field-error">Дата в прошлом: событие сохранится как прошедшее, уведомления не уйдут.</p>
    <div class="two-fields"><FigmaField id="event-start" v-model="start" label="Начало (МСК)" :readonly="external" type="time" required/><FigmaField id="event-end" v-model="end" label="Конец (МСК)" :readonly="external" type="time" required/></div>
    <FigmaField v-if="!editing && modern" id="event-repeat" :model-value="repeat" label="Повтор" type="select" :options="repeatMenuOptions(date).map(value=>({label:value,value}))" @update:model-value="selectRepeat(String($event))"/>
    <div v-else-if="!editing" class="field repeat-field"><label for="event-repeat">Повтор</label><button id="event-repeat" class="repeat-trigger" type="button" aria-haspopup="listbox" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><span>{{ repeat }}</span><img src="/assets/input/chevron-default.svg" width="24" height="24" alt=""/></button><RepeatMenu v-if="menuOpen" :date="date" :selected="repeat" @select="selectRepeat" @close="menuOpen = false"/></div>
    <RepeatSettings v-if="custom && !editing" v-model:interval="interval" v-model:unit="unit" v-model:days="days" v-model:finish="finish" v-model:until="until" v-model:count="count" @save="custom = false"/>
    <FigmaField id="event-link" v-model="link" label="Ссылка на площадку" :disabled="external" helper="Ссылка хранится у события. Пустое поле означает отсутствие ссылки."/>
    <FigmaField id="event-description" v-model="description" label="Описание" :readonly="external" type="textarea" :max-length="2000"/>
    <LinoSeparator/><FigmaField id="event-degree" v-model="degree" label="Требуемый градус участников" type="select" :options="degreeOptions"/>
    <FigmaField id="event-lodge" v-model="topic" label="Тематическая ложа" type="select" :options="[{value:'',label:'Принадлежность не указана'},{value:'__community',label:'Общие события сообщества'},...(lodges ?? []).map(lodge=>({value:lodge.id,label:lodge.name}))]"/>
    <FigmaField id="event-affiliation-degree" v-model="affiliationDegree" label="Градус принадлежности события" type="select" :options="[{value:'',label:'Без конкретного градуса'},...['I','II','III'].map(value=>({value,label:value}))]" helper="Для фильтра расписания. Не меняет требования к участникам."/>
    <fieldset class="lodge-audience"><legend>Аудитория по членству в ложах</legend><label v-for="lodge in lodges" :key="lodge.id"><input v-model="audience" type="checkbox" :value="lodge.id"/><img v-if="lodge.iconUrl" :src="lodge.iconUrl" alt=""/>{{ lodge.name }}</label></fieldset>
    <details v-if="editing"><summary>Прежние настройки группы и баллов</summary><FigmaField id="event-legacy-access" v-model="legacyAccess" label="Дополнительная группа участников" type="select" :options="legacyOptions" helper="Прежнее ограничение группы сохраняется дополнительно к градусу и ложам."/><LinoSwitch id="inherit-event-points" v-model="inheritPoints" label="Баллы по типу"/><FigmaField v-if="!inheritPoints" id="event-points" :model-value="points" label="Баллы выпуска" type="number" @update:model-value="points=Number($event)"/></details>
    <div class="editor-cover"><img v-if="displayedCover" :src="displayedCover" alt="Обложка события"/><span v-else>Без обложки</span><button class="text-action" type="button" @click="appearanceOpen=true">Настроить оформление</button><button v-if="editing" class="text-action" type="button" @click="appearanceChanged=true; restoreAppearance=true; cover=currentType?.coverPath ?? ''; appearance=currentType?.appearance ?? null">Вернуть оформление типа</button></div>
    </fieldset>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="serverError" class="feedback error" role="alert">{{ serverError }}</p>
    <div v-if="chooseScope" class="scope-choice" role="group" aria-label="Область сохранения" tabindex="-1">
      <h3>Применить изменения к выпуску или серии?</h3><p>Изменятся только отредактированные поля. Интервалы между выпусками сохранятся.</p>
      <MentorButton :disabled="busy" @click="save('occurrence')">Только это событие</MentorButton><MentorButton :disabled="busy" :variant="1" @click="save('series')">Всю серию</MentorButton><button type="button" class="text-action" :disabled="busy" @click="chooseScope=false">Вернуться к редактированию</button>
    </div>
    <p v-if="busy && modern" role="status"><LinoSpinner/>Сохраняем…</p>
    <MentorButton v-if="!chooseScope" type="submit" :disabled="busy">{{ busy ? 'Сохраняем…' : editing ? 'Сохранить изменения' : 'Добавить событие' }}</MentorButton>
    <button type="button" class="text-action" :disabled="busy" @click="emit('close')">Отмена</button>
  </form>
  <AppearanceEditor v-if="appearanceOpen" :event-mode="true" :initial="{title:name,cover:displayedCover,theme:source?.typeTheme ?? currentType?.theme,appearance:appearance ?? currentType?.appearance}" @close="appearanceOpen=false" @apply="applyAppearance"/>
</template>
<style scoped>
.repeat-field { position: relative; }
.editor-fields { display:flex; flex-direction:column; gap:var(--space-4); padding:0; margin:0; border:0; min-width:0; }
.admin-event-lino { --surface-bg:var(--bg-surface); --surface-border:var(--border-texture); background:transparent; }
.lodge-audience { border:0; padding:0; display:flex; flex-direction:column; gap:var(--space-2); }
.lodge-audience label { display:flex; align-items:center; gap:var(--space-2); }
.lodge-audience img { width:var(--space-6); height:var(--space-6); object-fit:contain; }
.editor-cover { display:flex; flex-wrap:wrap; align-items:center; gap:var(--space-3); }
.editor-cover img { width:var(--event-cover-width); height:var(--event-cover-height); object-fit:cover; }
.scope-choice { display:flex; flex-direction:column; gap:var(--space-4); }
.repeat-trigger { position: relative; display: flex; align-items: center; justify-content: space-between; width: 100%; height: 48px; border: 0; padding: 12px 16px; background: transparent; color: var(--text-primary); font-family: var(--font-body-family); font-size: 16px; line-height: 18px; text-align: left; cursor: pointer; }
.repeat-trigger::before { content: ''; position: absolute; inset: -2px -2px -1px -1px; background: url('/assets/input/default.png') center / 100% 100% no-repeat; pointer-events: none; }
.repeat-trigger span, .repeat-trigger img { position: relative; }
.repeat-field :deep(.repeat-menu) { position: absolute; top: calc(100% + 4px); left: 0; z-index: 10; }
.field input.is-past { color: var(--error); border-color: var(--error); }
@media (max-width: 700px) { .repeat-field :deep(.repeat-menu) { width: 100%; } }
</style>
