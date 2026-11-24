<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { dateShortLabel } from '../../lib/admin-demo';
import FigmaField from '../ui/FigmaField.vue';
import RadioControl from '../ui/RadioControl.vue';
import LinoSpinner from '../ui/LinoSpinner.vue';
import LinoIcon from '../ui/LinoIcon.vue';
import {useAdminLino} from '../../lib/admin-ui';
const modern=useAdminLino();
import FilterChip from '../ui/FilterChip.vue';
import MentorSecondaryButton from '../ui/MentorSecondaryButton.vue';

type Release = { id: string; title: string; date: string; start: string; metrics: { viewed: number; opened: number; reminders: number } };
type Row = { id: string; nick: string; degree: string | null; action: string; reminder: boolean; lastActivity: string };

const props = defineProps<{ scene: string }>();
const emit = defineEmits<{ participant: [row: Row]; retry: [] }>();

const types = ref<{ id: string; name: string }[]>([]);
const typeId = ref(''), period = ref('3months');
const releases = ref<Release[]>([]), selectedKey = ref(''), extra = ref(false);
const search = ref(''), degree = ref(''), action = ref('Все'), reminder = ref('Все'), page = ref(1);
const data = ref<{ metrics: { viewed: number; opened: number; reminders: number }; participants: Row[]; total: number; pageSize: number } | null>(null);
const loading = ref(false), error = ref(''), releasesError = ref('');
const pageSize = 8;
let releasesSequence=0, participantsSequence=0;

async function api(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(20_000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? 'Не удалось выполнить действие.');
  return result;
}
async function loadTypes() {
  try {
    types.value = (await api('/api/types')).types.map((type: any) => ({ id: type.id, name: type.name }));
    // The dashboard is scoped to a chosen type; without it, typeless events would head the list.
    if (!typeId.value && types.value.length) typeId.value = types.value[0].id;
  }
  catch { releasesError.value = 'Не удалось загрузить типы событий.'; }
}
async function loadReleases() {
  const sequence=++releasesSequence;
  participantsSequence++;
  loading.value=false;
  releasesError.value = '';
  try {
    const query = new URLSearchParams({ period: period.value });
    if (typeId.value) query.set('typeId', typeId.value);
    const result=await api('/api/analytics/releases?' + query);
    if(sequence!==releasesSequence)return;
    releases.value = result.releases;
    if (!releases.value.some(release => release.id === selectedKey.value)) selectedKey.value = releases.value[0]?.id ?? '';
  } catch (e) { if(sequence===releasesSequence){releasesError.value = e instanceof Error ? e.message : 'Не удалось загрузить события.'; releases.value = [];} }
}
async function loadParticipants() {
  const sequence=++participantsSequence;
  if (!selectedKey.value) { data.value = null; loading.value=false; return; }
  loading.value = true; error.value = '';
  try {
    const query = new URLSearchParams({ eventKey: selectedKey.value, page: String(page.value), pageSize: String(pageSize) });
    if (search.value.trim()) query.set('search', search.value.trim());
    if (degree.value) query.set('degree', degree.value);
    if (action.value === 'Перешли') query.set('action', 'opened');
    if (action.value === 'Только посмотрели') query.set('action', 'viewed');
    if (reminder.value === 'Включено') query.set('reminder', 'on');
    if (reminder.value === 'Не включено') query.set('reminder', 'off');
    const result=await api('/api/analytics/participants?' + query);
    if(sequence===participantsSequence)data.value=result;
  } catch (e) { if(sequence===participantsSequence){error.value = e instanceof Error ? e.message : 'Не удалось загрузить участников.'; data.value = null;} }
  finally { if(sequence===participantsSequence)loading.value = false; }
}
const visibleReleases = computed(() => extra.value ? releases.value : releases.value.slice(0, 4));
const pages = computed(() => data.value ? Math.max(1, Math.ceil(data.value.total / pageSize)) : 1);
const shown = computed(() => {
  if (!data.value) return '';
  const from = data.value.total === 0 ? 0 : (page.value - 1) * pageSize + 1;
  return `${from}–${Math.min(page.value * pageSize, data.value.total)} из ${data.value.total}`;
});
const activityTime = (iso: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
let timer: ReturnType<typeof setTimeout>;
watch([selectedKey, degree, action, reminder], () => { page.value = 1; loadParticipants(); });
watch(page, loadParticipants);
watch(search, () => { participantsSequence++;clearTimeout(timer); timer = setTimeout(() => { page.value = 1; loadParticipants(); }, 250); });
watch([typeId, period], loadReleases);
onMounted(async () => { await loadTypes(); await loadReleases(); await loadParticipants(); });
onBeforeUnmount(()=>{clearTimeout(timer);participantsSequence++;releasesSequence++;});
</script>
<template>
  <div class="analytics-grid">
    <aside class="admin-panel analytics-events">
      <h2>События</h2>
      <FigmaField id="analytics-type" v-model="typeId" label="Тип события" type="select" :options="[{ value: '', label: 'Все типы' }, ...types.map(type => ({ value: type.id, label: type.name }))]"/>
      <FigmaField id="analytics-period" v-model="period" label="Период" type="select" :options="[{ value: '3months', label: 'Последние 3 месяца' }, { value: 'month', label: 'Текущий месяц' }, { value: 'all', label: 'За всё время' }]"/>
      <p v-if="releasesError" role="alert" class="feedback error">{{ releasesError }}</p>
      <div class="issue-list">
        <button v-for="release in visibleReleases" :key="release.id" class="issue-button" :class="{ active: selectedKey === release.id }" @click="selectedKey = release.id; page = 1">
          <strong>{{ dateShortLabel(release.date) }}, {{ release.start }}</strong>
          <span>{{ release.metrics.viewed }} просмотров · {{ release.metrics.opened }} переходов</span>
          <span>{{ release.metrics.reminders }} напоминаний</span>
        </button>
      </div>
      <button v-if="!extra && releases.length > 4" class="secondary" @click="extra = true">Показать ещё</button>
      <div v-if="!releases.length && !releasesError" class="empty-state"><h3>Событий в периоде нет</h3></div>
    </aside>
    <section class="admin-panel analytics-results">
      <h2>{{ types.find(type => type.id === typeId)?.name ?? 'Все типы' }}</h2>
      <template v-if="props.scene === 'participants-error' || error">
        <div class="empty-state" role="alert"><h3>Не удалось загрузить аналитику</h3><p>{{ error || 'Проверьте соединение и повторите.' }}</p><button class="secondary" @click="error = ''; loadParticipants()">Повторить</button></div>
      </template>
      <template v-else-if="!selectedKey"><div class="empty-state"><h3>Выберите событие слева</h3><p>Аналитика считается по выпускам.</p></div></template>
      <template v-else-if="props.scene === 'participants-empty' || !data">
        <div class="empty-state"><h3>Активности пока нет</h3><p>Для выбранного выпуска ещё нет просмотров и переходов.</p></div>
      </template>
      <template v-else>
        <div class="metrics">
          <div><strong>{{ data.metrics.viewed }}</strong><span>Посмотрели карточку</span></div>
          <div><strong>{{ data.metrics.opened }}</strong><span>Перешли по ссылке</span></div>
          <div><strong>{{ data.metrics.reminders }}</strong><span>Поставили напоминание</span></div>
        </div>
        <div class="analytics-filters" @input="page = 1" @change="page = 1">
          <FigmaField id="participant-search" v-model="search" label="Telegram-ник" hidden-label placeholder="Telegram-ник"/>
          <FigmaField id="participant-degree" v-model="degree" label="Градус" hidden-label type="select" :options="[{value:'',label:'Все градусы'},...['I','II','III'].map(value=>({value,label:'Градус '+value}))]"/>
        </div>
        <div class="filter-actions">
          <div class="filter-chips"><FilterChip v-for="value in ['Все','Перешли','Только посмотрели']" :key="value" :selected="action === value" @click="action = value; page = 1">{{ value }}</FilterChip></div>
          <span>Найдено {{ data.total }} участников</span>
        </div>
        <fieldset class="inline-options"><legend>Напоминание в боте</legend><RadioControl v-for="value in ['Все','Включено','Не включено']" :key="value" v-model="reminder" :value="value" name="participant-reminder" :label="value" @update:model-value="page = 1"/></fieldset>
        <p v-if="loading" role="status" class="feedback"><LinoSpinner/>Загружаем участников…</p>
        <div v-else-if="data.participants.length" class="table-scroll">
          <table class="participants-table">
            <thead><tr><th>Telegram-ник</th><th>Градус</th><th>Действие</th><th>Напоминание</th><th>Последняя активность</th></tr></thead>
            <tbody>
              <tr v-for="row in data.participants" :key="row.id">
                <td class="nick-cell" @click="emit('participant', row)"><button class="text-action">{{ row.nick }}</button></td>
                <td><span v-if="row.degree" class="degree-badge" :data-degree="row.degree">{{ row.degree }}</span><span v-else>—</span></td>
                <td>{{ row.action }}</td>
                <td><span class="reminder-cell"><LinoIcon v-if="modern" name="bell"/><img v-else :src="row.reminder ? '/assets/reminder/reminder-bell.svg' : '/assets/reminder/reminder-bell-off.svg'" width="16" height="16" alt=""/>{{ row.reminder ? 'Включено' : 'Не включено' }}</span></td>
                <td>{{ activityTime(row.lastActivity) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state"><h3>Ничего не найдено</h3><p>Попробуйте изменить фильтры.</p></div>
        <div v-if="pages > 1" class="pagination">
          <span>{{ shown }} участников</span>
          <div class="button-row">
            <button class="secondary" :disabled="page === 1" @click="page--">Назад</button>
            <button v-for="number in pages" :key="number" class="secondary" :aria-current="page === number ? 'page' : undefined" @click="page = number">{{ number }}</button>
            <button class="secondary" :disabled="page === pages" @click="page++">Далее</button>
          </div>
        </div>
      </template>
      <p class="demo-note">Переход по ссылке не подтверждает посещение.</p>
    </section>
  </div>
</template>
<style scoped>
.nick-cell { cursor: pointer; }
.inline-options { gap: var(--space-6); }
.inline-options :deep(.radio-control) { width: auto; }
</style>
