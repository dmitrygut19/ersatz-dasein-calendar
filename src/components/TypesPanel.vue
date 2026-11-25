<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import FigmaField from './ui/FigmaField.vue';
import MentorButton from './ui/MentorButton.vue';
import EventCard from './ui/EventCard.vue';
import ActionIconButton from './ui/ActionIconButton.vue';
import { dateShortLabel } from '../lib/admin-demo';
import type { Appearance } from '../lib/appearance';
import { eventPlatforms } from '../lib/event-platform';

type EventType = {
  id: string; name: string; recognitionWords: string; accessLabel: string;
  degree: string | null; points: number | null;
  venue: string; venueUrl: string; coverPath: string | null; theme: string; appearance?: Appearance | null; inUse?: boolean;
};
type NextEvent = { typeName: string; date: string; start: string };
const props = defineProps<{ initialTypes: EventType[]; externalAppearance?: boolean; events?: NextEvent[] }>();
const emit = defineEmits<{ appearance: []; saved: []; created: [type: EventType]; cancelled: [] }>();
const types = ref([...props.initialTypes]);
const nextEventByType = computed(() => {
  const map: Record<string, string> = {};
  for (const event of [...(props.events ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!map[event.typeName]) map[event.typeName] = `${dateShortLabel(event.date)}, ${event.start}`;
  }
  return map;
});
const draft = ref<Omit<EventType, 'id'> & { id?: string } | null>(null);
const message = ref('');
const error = ref('');
const busy = ref(false);
const deleteCandidate = ref<string | null>(null);
const appearance = ref(false);
let nameInput: { focus: () => void } | null = null;
const setNameInput = (instance: unknown) => { nameInput = instance as typeof nameInput; };
const fieldErrors = ref<Record<string, string>>({});
const addButton = ref<HTMLButtonElement | null>(null);
const assets = '/assets/panel/';
const defaultCover = assets + 'a5ff5.png';
const accessSuggestions = computed(() => [...new Set(['Все', ...types.value.map(x => x.accessLabel).filter(Boolean)])]);
const accessOptions = computed(() => accessSuggestions.value.map(label => ({ label, value: label })));
const degreeOptions = [{ label: 'Все', value: null }, ...['I','II','III'].map(value => ({ label: `Градус ${value}`, value }))];
const displayItems = computed(() => [...types.value, { id: 'new', name: '', recognitionWords: '', accessLabel: '', degree: null, points: null, venue: '', venueUrl: '', coverPath: defaultCover, theme: 'ordinary' }]);
const coverOptions = [
  { file: 'a5ff5.png', label: 'Конгресс' },
  { file: '2a38c.png', label: 'Сатурналии' },
  { file: '6713c.png', label: 'Дазайн-арена' },
];
defineExpose({
  startCreate: (name = '') => edit(undefined, name),
  startEditByName: (name: string) => { const type = types.value.find(item => item.name === name) ?? types.value[0]; if (type) return edit(type); },
  getAppearanceDraft: () => draft.value ? { title: draft.value.name, cover: draft.value.coverPath || null, theme: draft.value.theme, appearance: draft.value.appearance ?? null } : null,
  applyAppearance: (value: { cover: string | null; appearance: Appearance }) => { if (draft.value) { draft.value.coverPath = value.cover || null; draft.value.theme = value.appearance.theme; draft.value.appearance = value.appearance; } },
});

async function request(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(15_000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? 'Не удалось выполнить действие.');
  return result;
}
async function edit(type?: EventType, name = '') {
  if (busy.value) return false;
  if (draft.value) emit('cancelled');
  draft.value = type ? { ...type } : { name, recognitionWords: '', accessLabel: 'Все', degree: null,
    points: null, venue: '', venueUrl: '', coverPath: defaultCover, theme: 'ordinary' };
  error.value = ''; message.value = ''; appearance.value = false; deleteCandidate.value = null;
  fieldErrors.value = {};
  await nextTick(); nameInput?.focus();
  return true;
}
async function cancel() { if (busy.value) return; draft.value = null; error.value = ''; fieldErrors.value = {}; emit('cancelled'); await nextTick(); addButton.value?.focus(); }
function confirmDelete(id: string) {
  if (busy.value) return;
  if (draft.value?.id === id) draft.value = null;
  appearance.value = false; fieldErrors.value = {};
  deleteCandidate.value = id; error.value = ''; message.value = '';
}
async function save() {
  if (!draft.value || busy.value) return;
  fieldErrors.value = {};
  if (!draft.value.name.trim()) fieldErrors.value.name = 'Введите название типа.';
  if (draft.value.points !== null && (!Number.isSafeInteger(draft.value.points) || draft.value.points < 0)) fieldErrors.value.points = 'Введите целое неотрицательное число.';
  if (Object.keys(fieldErrors.value).length) { await nextTick(); if (fieldErrors.value.name) nameInput?.focus(); return; }
  busy.value = true; error.value = ''; message.value = '';
  try {
    const form = draft.value;
    // Keep server validation authoritative, including whitespace and numeric types.
    // Tiers are removed from the product (09.11.2026): stored value is always cleared.
    const saved = await request(form.id ? `/api/types/${form.id}` : '/api/types', {
      method: form.id ? 'PUT' : 'POST', body: JSON.stringify({ name: form.name, recognitionWords: form.recognitionWords, accessLabel: form.accessLabel, tier: null, degree: form.degree, points: (form.points as unknown) === '' ? null : form.points, venue: form.venue, venueUrl: form.venueUrl, coverPath: form.coverPath || '', theme: form.theme, appearance: form.appearance ?? null }),
    });
    const index = types.value.findIndex(type => type.id === saved.type.id);
    if (index < 0) types.value.push({ ...saved.type, inUse: false });
    else types.value[index] = { ...saved.type, inUse: types.value[index].inUse };
    draft.value = null; message.value = 'Тип сохранён.';
    emit('saved');
    if (!form.id) emit('created', saved.type);
    await nextTick(); addButton.value?.focus();
  } catch (e) { error.value = e instanceof TypeError || (e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name)) ? 'Нет связи с сервером. Данные в форме сохранены; попробуйте ещё раз.' : e instanceof Error ? e.message : 'Не удалось сохранить тип.'; }
  finally { busy.value = false; }
}
async function remove(id: string) {
  if (busy.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try {
    await request(`/api/types/${id}`, { method: 'DELETE' });
    types.value = types.value.filter(type => type.id !== id); deleteCandidate.value = null; message.value = 'Тип удалён.';
    if (draft.value?.id === id) draft.value = null;
    emit('saved');
    await nextTick(); addButton.value?.focus();
  } catch (e) { error.value = e instanceof Error ? e.message : 'Не удалось удалить тип.'; }
  finally { busy.value = false; }
}
</script>

<template>
  <section class="types-panel" aria-labelledby="types-title" :aria-busy="busy">
    <h2 id="types-title">Типы событий</h2>
    <p v-if="message" role="status" class="feedback">{{ message }}</p>
    <p v-if="error && !draft" role="alert" class="feedback error">{{ error }}</p>
    <p v-if="!types.length && !draft">Типов событий пока нет. Добавьте первый тип.</p>

    <template v-for="type in displayItems" :key="type.id">
      <template v-if="type.id !== 'new' && draft?.id !== type.id">
        <div v-if="deleteCandidate === type.id" class="type-row event-card-row is-deleting" role="group" :aria-label="`Удаление типа ${type.name}`">
          <div class="deleting-main"><img v-if="type.coverPath" class="cover" :src="type.coverPath" alt="" width="72" height="46"/><div class="type-summary"><h3>Удалить тип «{{ type.name }}»?</h3><p>Это действие нельзя отменить.</p></div></div>
          <div class="actions confirm-actions"><MentorButton class="card-confirm" :disabled="busy" @click="remove(type.id)">Удалить</MentorButton><MentorButton class="card-confirm" :variant="1" :disabled="busy" @click="deleteCandidate = null">Отмена</MentorButton></div>
        </div>
        <EventCard v-else :title="type.name" :description="type.accessLabel || 'Доступ не задан'" :cover="type.coverPath" :next-event="nextEventByType[type.name] ?? null" :disabled="busy" @edit="edit(type)" @delete="confirmDelete(type.id)"/>
      </template>
      <form v-if="draft && (draft.id ?? 'new') === type.id" class="type-editor" novalidate @submit.prevent="save" @keydown.esc.prevent="cancel">
      <div v-if="draft.id" class="type-row editing-heading">
        <img v-if="draft.coverPath" class="cover" :src="draft.coverPath" alt="" width="72" height="46"/>
        <div class="type-summary"><h3>{{ type.name }}</h3><p>{{ type.accessLabel || 'Доступ не задан' }}</p></div>
        <div class="actions"><ActionIconButton action="edit" label="Закрыть редактирование" active :disabled="busy" @click="cancel"/><ActionIconButton action="delete" :label="`Удалить ${type.name}`" :disabled="busy" @click="confirmDelete(type.id)"/></div>
      </div>
      <h3 v-else>Новый тип</h3>
      <div class="editor-fields">
      <FigmaField :ref="setNameInput" id="type-name" v-model="draft.name" label="Название типа" :max-length="80" :disabled="busy" :error="fieldErrors.name" required/>
      <FigmaField id="type-recognition" v-model="draft.recognitionWords" label="Слова для распознавания" :max-length="240" :disabled="busy"/>
      <FigmaField id="type-access" v-model="draft.accessLabel" label="Доступ" type="select" :options="accessOptions" :disabled="busy"/>
      <FigmaField id="type-degree" v-model="draft.degree" label="Градусы" type="select" :options="degreeOptions" :disabled="busy"/>
      <div class="two-fields">
        <FigmaField id="type-points" v-model="draft.points" label="Е-баллы" type="number" :error="fieldErrors.points" :disabled="busy"/>
      </div>
      <FigmaField id="type-venue" v-model="draft.venue" label="Площадка" type="select" :options="[{label:'Определять по ссылке',value:''}, ...eventPlatforms.map(value => ({label:value,value}))]" :disabled="busy"/>
      <button class="appearance-toggle" type="button" :aria-expanded="appearance" :disabled="busy" @click="externalAppearance ? emit('appearance') : appearance = !appearance"><img :src="assets + 'd3843.svg'" width="24" height="24" alt=""/>Настроить оформление</button>
      <fieldset v-if="appearance" class="appearance"><legend>Обложка</legend><label v-for="cover in coverOptions" :key="cover.file" class="cover-choice"><input v-model="draft.coverPath" type="radio" :value="assets + cover.file" :disabled="busy"/><img :src="assets + cover.file" width="72" height="46" alt=""/><span>{{ cover.label }}</span></label></fieldset>
      </div>
      <p v-if="error" role="alert" class="feedback error">{{ error }}</p>
      <div class="form-actions"><MentorButton type="submit" :disabled="busy">{{ busy ? 'Сохраняем…' : 'Сохранить' }}</MentorButton><MentorButton :variant="1" class="cancel-edit" :class="{ 'existing-type': draft.id }" :disabled="busy" @click="cancel">Отмена</MentorButton></div>
    </form>
    </template>
    <button ref="addButton" type="button" class="add-type" :disabled="busy" @click="edit()"><img :src="assets + 'e7fb1.svg'" width="18" height="18" alt=""/>Добавить тип</button>
  </section>
</template>
