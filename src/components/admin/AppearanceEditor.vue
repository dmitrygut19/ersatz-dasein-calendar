<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onMounted, nextTick, useId, watch } from 'vue';
import MentorButton from '../ui/MentorButton.vue';
import ButtonPaletteFilter from '../ui/ButtonPaletteFilter.vue';
import FigmaField from '../ui/FigmaField.vue';
import RadioControl from '../ui/RadioControl.vue';
import { defaultAppearance, buttonDefaults, validateAppearance, type Appearance } from '../../lib/appearance';
import {useAdminLino} from '../../lib/admin-ui';
import ActionIconButton from '../ui/ActionIconButton.vue';
import LinoSwitch from '../ui/LinoSwitch.vue';
import LinoSeparator from '../ui/LinoSeparator.vue';
import LinoSwatchGroup from '../ui/LinoSwatchGroup.vue';
const modern=useAdminLino();
import { coverExamples } from '../../lib/cover-examples';
const props = defineProps<{ eventMode?: boolean; initial?: { title: string; cover: string | null; theme: string | null; appearance: Appearance | null } }>();
const emit = defineEmits<{ close: []; apply: [value: { cover: string | null; appearance: Appearance }] }>();
const defaultCover = '/assets/panel/a5ff5.png';
const options = [{ path: '/assets/panel/2a38c.png', name: 'Сатурналии' }, { path: defaultCover, name: 'Конгресс' }, { path: '/assets/panel/6713c.png', name: 'Дазайн-арена' }];
const gallery=ref<{path:string;name:string}[]>([...options,...coverExamples]);
const deleteCandidate=ref<string|null>(null), galleryMessage=ref('');
const uploadInput=ref<HTMLInputElement|null>(null);
onMounted(async()=>{
  try {
    const response=await fetch('/api/covers',{signal:AbortSignal.timeout(25_000)});
    const result=await response.json();
    if(!response.ok || !Array.isArray(result.covers))throw new Error();
    gallery.value=result.covers;
  } catch {uploadError.value='Не удалось загрузить галерею. Закройте и откройте оформление снова.';}
});
async function removeCover(path:string){
  if(busy.value)return;
  busy.value=true;uploadError.value='';galleryMessage.value='';
  try{
    const response=await fetch('/api/covers',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({coverPath:path}),signal:AbortSignal.timeout(25_000)});
    const result=await response.json();
    if(!response.ok || !Array.isArray(result.covers))throw new Error(result.message||'Не удалось удалить обложку. Повторите попытку.');
    gallery.value=result.covers;deleteCandidate.value=null;
    galleryMessage.value='Обложка убрана из галереи. Уже назначенные обложки сохранены.';
    busy.value=false;
    await nextTick();uploadInput.value?.focus();
  }catch(error){uploadError.value=error instanceof Error?error.message:'Не удалось удалить обложку. Повторите попытку.';}
  finally{busy.value=false;}
}
const initialAppearance = props.initial?.appearance ?? defaultAppearance(props.initial?.theme);
const coverMode = ref<NonNullable<Appearance['coverMode']>>(initialAppearance.coverMode ?? 'illustration');
const cover = ref(props.initial?.cover || defaultCover), theme = ref(initialAppearance.theme);
const initialButton = buttonDefaults(initialAppearance.theme);
const colors = ref({ start: initialAppearance.start, end: initialAppearance.end, accent: initialAppearance.accent, text: initialAppearance.text,
  buttonBackground: initialAppearance.buttonBackground ?? initialButton.background, buttonText: initialAppearance.buttonText ?? initialButton.text, buttonAccent: initialAppearance.buttonAccent ?? initialButton.accent });
const buttonPalette = computed(() => ({ background: colors.value.buttonBackground, text: colors.value.buttonText, accent: colors.value.buttonAccent }));
const buttonFilterId = useId();
const bordered = ref(initialAppearance.bordered), uploadError = ref(''), busy = ref(false);
const borderChoice = computed({ get: () => String(bordered.value), set: (value: string) => { bordered.value = value === 'true'; } });
const themeOptions = [{ id: 'ordinary', name: 'Обычная' }, { id: 'arena', name: 'Арена' }, { id: 'saturnalia', name: 'Сатурналии' }] as const;
const themePalettes = ref<Record<Appearance['theme'], Appearance>>({ ordinary: defaultAppearance('ordinary'), arena: defaultAppearance('arena'), saturnalia: defaultAppearance('saturnalia') });
function rememberPalette() { themePalettes.value[theme.value] = { theme: theme.value, ...colors.value, bordered: bordered.value }; }
rememberPalette();
watch([colors, bordered], rememberPalette, { deep: true, flush: 'sync' });
function themeSample(value: Appearance['theme']) {
  const palette = themePalettes.value[value];
  return { background: `linear-gradient(180deg, ${palette.start}, ${palette.end})`, borderColor: palette.bordered ? palette.accent : 'transparent' };
}
let pendingFile: File | null = null, objectUrl = '';
onBeforeUnmount(() => { if (objectUrl) URL.revokeObjectURL(objectUrl); });
function selectTheme(value: Appearance['theme']) {
  rememberPalette();
  const defaults = themePalettes.value[value];
  // Replace the draft before switching its key so the old preset remains intact.
  const nextColors = { start: defaults.start, end: defaults.end, accent: defaults.accent, text: defaults.text,
    buttonBackground: defaults.buttonBackground!, buttonText: defaults.buttonText!, buttonAccent: defaults.buttonAccent! };
  theme.value = value;
  colors.value = nextColors;
  bordered.value = defaults.bordered;
}
function selectCover(value: string) {
  pendingFile = null; cover.value = value; uploadError.value = '';
  const example = coverExamples.find(item => item.path === value);
  if (example) coverMode.value = example.mode;
}
const preview = computed(() => ({ color: colors.value.text, background: `linear-gradient(${colors.value.start},${colors.value.end})`, borderColor: bordered.value ? colors.value.accent : 'transparent' }));
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2_000_000) { uploadError.value = 'Выберите PNG, JPEG или WebP до 2 МБ.'; return; }
  uploadError.value = '';
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  pendingFile = file; objectUrl = URL.createObjectURL(file); cover.value = objectUrl;
}
async function apply() {
  if (busy.value) return;
  busy.value = true; uploadError.value = '';
  try {
    const appearance = validateAppearance({ theme: theme.value, ...colors.value, bordered: bordered.value, coverMode: coverMode.value })!;
    if (pendingFile) {
      const response = await fetch('/api/covers', { method: 'POST', body: pendingFile, signal: AbortSignal.timeout(25_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      cover.value = result.coverPath; pendingFile = null;
    }
    emit('apply', { cover: cover.value, appearance });
  } catch (error) { uploadError.value = error instanceof Error ? error.message : 'Не удалось применить оформление.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="appearance-editor">
    <ButtonPaletteFilter :id="buttonFilterId" :palette="buttonPalette" :artwork-filter="buttonFilterId"/>
    <div class="panel-heading"><h2>{{ eventMode ? 'Оформление события' : `Оформление типа «${initial?.title || 'Новый тип'}»` }}</h2><button class="close-button" aria-label="Закрыть оформление" @click="emit('close')"><img src="/assets/appearance/close.svg" width="20" height="20" alt=""/></button></div>
    <h3>Обложка</h3>
    <div class="cover-gallery">
      <label class="upload-cover"><img src="/assets/appearance/upload.svg" width="20" height="20" alt=""/><span>Загрузить</span><input ref="uploadInput" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Загрузить обложку" :disabled="busy" @change="upload"/></label>
      <div v-for="option in gallery" :key="option.path" class="cover-gallery-item">
       <button type="button" class="cover-option" :class="{ chosen: cover === option.path }" :aria-label="`Выбрать обложку ${option.name}`" :aria-pressed="cover === option.path" :disabled="busy" @click="selectCover(option.path)"><img :src="option.path" :alt="option.name"/><span v-if="cover === option.path" class="selected-mark" aria-hidden="true"><img src="/assets/appearance/check.svg" width="15" height="12.5" alt=""/></span></button>
       <ActionIconButton v-if="deleteCandidate!==option.path" class="cover-remove" action="delete" :label="`Удалить из галереи: ${option.name}`" :disabled="busy" @click="deleteCandidate=option.path"/>
       <div v-else class="cover-delete-confirm" role="group" :aria-label="`Удаление обложки ${option.name}`"><span>Убрать из галереи?</span><button type="button" class="text-action" :disabled="busy" @click="removeCover(option.path)">Удалить</button><button type="button" class="text-action" :disabled="busy" @click="deleteCandidate=null">Отмена</button></div>
      </div>
    </div>
    <p v-if="uploadError" role="alert" class="feedback error">{{ uploadError }}</p>
    <p v-if="galleryMessage" role="status" class="demo-note">{{ galleryMessage }}</p>
    <LinoSeparator/><h3>Тема</h3><div v-if="modern" class="admin-editor-section"><LinoSwatchGroup :model-value="theme" :options="themeOptions.map(option=>({value:option.id,label:option.name,color:themePalettes[option.id].start}))" label="Тема оформления" @update:model-value="selectTheme($event as Appearance['theme'])"/><span>{{ themeOptions.find(option=>option.id===theme)?.name }}</span></div><div v-else class="theme-options"><button v-for="option in themeOptions" :key="option.id" class="theme-option" :class="[option.id,{ chosen: theme === option.id }]" :aria-pressed="theme === option.id" @click="selectTheme(option.id)"><span :style="themeSample(option.id)"></span>{{ option.name }}</button></div>
    <div class="color-editor">
      <div class="field"><span>Фон</span><div class="two-fields"><FigmaField id="appearance-start" v-model="colors.start" label="Фон: начало" :color-swatch="colors.start" hidden-label/><FigmaField id="appearance-end" v-model="colors.end" label="Фон: конец" :color-swatch="colors.end" hidden-label/></div></div>
      <FigmaField id="appearance-accent" v-model="colors.accent" label="Акцентный цвет" :color-swatch="colors.accent"/>
      <FigmaField id="appearance-text" v-model="colors.text" label="Цвет текста" :color-swatch="colors.text"/>
      <FigmaField id="appearance-button-background" v-model="colors.buttonBackground" label="Фон кнопки" :color-swatch="colors.buttonBackground"/>
      <FigmaField id="appearance-button-text" v-model="colors.buttonText" label="Цвет текста кнопки" :color-swatch="colors.buttonText"/>
      <FigmaField id="appearance-button-accent" v-model="colors.buttonAccent" label="Цвет орнамента и рамки кнопки" :color-swatch="colors.buttonAccent"/>
      <LinoSwitch v-if="modern" id="appearance-bordered" v-model="bordered" label="Обводка"/><fieldset v-else class="inline-options"><legend>Обводка</legend><RadioControl v-model="borderChoice" value="true" :name="'appearance-border-' + buttonFilterId" label="С обводкой" compact/><RadioControl v-model="borderChoice" value="false" :name="'appearance-border-' + buttonFilterId" label="Без обводки" compact/></fieldset>
    </div>
    <MentorButton :disabled="busy" @click="apply">{{ busy ? 'Загрузка…' : 'Применить' }}</MentorButton>
    <h2>Событие в календаре</h2><div class="appearance-preview"><div><p>В календаре</p><div class="preview-cell" :class="'preview-cell-' + coverMode" :style="preview"><span>13 · 20:00</span><img :src="cover" alt="Выбранная обложка"/><p>{{ initial?.title || 'Событие' }}</p></div></div><div class="preview-event" :class="'preview-event-' + coverMode" :style="preview"><img :src="cover" alt=""/><h3>{{ initial?.title || 'Событие' }}</h3><p>13 сентября 2026, 20:00</p><p>Событие только для участников</p><MentorButton full-width :palette="buttonPalette" :artwork-filter="buttonFilterId">К событию</MentorButton></div></div>
  </section>
</template>
<style scoped>
.appearance-editor .close-button { display: grid; place-items: center; }
.cover-gallery-item{position:relative;min-width:0;}
.cover-gallery-item .cover-option{width:100%;}
.cover-gallery .cover-remove{position:absolute;top:var(--space-2);right:var(--space-2);width:var(--control-compact);height:var(--control-compact);min-height:0;padding:0;z-index:2;}
.cover-delete-confirm{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:var(--space-2);padding:var(--space-2);background:var(--bg-surface);font-size:var(--body-sm-size);text-align:center;}
.cover-gallery .cover-delete-confirm button{min-height:var(--control-compact);background:none;border:0;overflow:visible;}
.cover-mode { margin-top:var(--space-4); }
.preview-cell { position:relative; height:var(--calendar-day-small); min-height:0; }
.preview-cell > span, .preview-cell > p { position:relative; z-index:1; }
.preview-cell > p { margin-top:auto; font-weight:700; overflow-wrap:anywhere; flex:none; overflow:hidden; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; }
.preview-cell-illustration > img { position:absolute; inset:0; object-fit:cover; width:100%; margin:0; height:100%; min-height:0; }
.preview-event-illustration > img { object-fit:cover; }
.preview-cell-poster { overflow:hidden; }
.preview-cell-poster > img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
</style>
