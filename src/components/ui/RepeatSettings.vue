<script setup lang="ts">
import { computed, ref } from 'vue';
import FigmaField from './FigmaField.vue';
import FilterChip from './FilterChip.vue';
import RadioControl from './RadioControl.vue';
import MentorButton from './MentorButton.vue';
const props = defineProps<{ interval: number; unit: string; days: string[]; finish: string; until: string; count: number }>();
const emit = defineEmits<{ 'update:interval': [value: number]; 'update:unit': [value: string]; 'update:days': [value: string[]]; 'update:finish': [value: string]; 'update:until': [value: string]; 'update:count': [value: number]; save: [] }>();
const dateInput = ref<HTMLInputElement | null>(null);
const dateLabel = computed(() => {
  const [year,month,day] = props.until.split('-');
  return year && month && day ? `${day}.${month}.${year}` : 'Выбрать дату';
});
function toggleDay(day: string) { emit('update:days', props.days.includes(day) ? props.days.filter(value => value !== day) : [...props.days, day]); }
function openDate() { emit('update:finish','date'); try { if (dateInput.value?.showPicker) dateInput.value.showPicker(); else dateInput.value?.focus(); } catch { dateInput.value?.focus(); } }
</script>
<template>
  <section class="repeat-settings" aria-label="Настройка повторов">
    <div class="repeat-settings-group">
      <label class="repeat-caption">Повторять с интервалом</label>
      <div class="repeat-interval-row"><div class="repeat-stepper">
        <button type="button" :disabled="interval <= 1" aria-label="Уменьшить интервал" @click="emit('update:interval',Math.max(1,interval-1))"><img src="/assets/repeat/minus.svg" width="24" height="24" alt=""/></button>
        <output>{{ interval }}</output>
        <button type="button" aria-label="Увеличить интервал" @click="emit('update:interval',interval+1)"><img src="/assets/repeat/plus.svg" width="24" height="24" alt=""/></button>
      </div><FigmaField id="repeat-unit" :model-value="unit" label="Период" hidden-label type="select" :options="['День','Неделю','Месяц','Год'].map(value=>({label:value,value}))" @update:model-value="emit('update:unit',String($event))"/></div>
    </div>
    <div class="repeat-settings-group"><span class="repeat-caption">По дням</span><div class="repeat-weekdays"><FilterChip v-for="day in ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']" :key="day" :selected="days.includes(day)" @click="toggleDay(day)">{{ day }}</FilterChip></div></div>
    <fieldset class="repeat-finish"><legend class="repeat-caption">Закончить</legend>
      <RadioControl :model-value="finish" value="never" name="repeat-finish" label="Никогда" compact @update:model-value="emit('update:finish',$event)"/>
      <div class="repeat-date-row"><RadioControl :model-value="finish" value="date" name="repeat-finish" label="Дата" compact @update:model-value="emit('update:finish',$event)"/><button type="button" class="repeat-date-button" @click="openDate">{{ dateLabel }}</button><input ref="dateInput" class="repeat-native-date" type="date" :value="until" aria-label="Дата окончания повторов" @input="emit('update:until',($event.target as HTMLInputElement).value)"/></div>
      <div class="repeat-count-row"><RadioControl :model-value="finish" value="count" name="repeat-finish" label="После" compact @update:model-value="emit('update:finish',$event)"/><div class="repeat-stepper repeat-count-stepper"><button type="button" aria-label="Уменьшить число повторений" :disabled="count <= 1" @click="emit('update:finish','count'); emit('update:count',Math.max(1,count-1))"><img src="/assets/repeat/minus-muted.svg" width="24" height="24" alt=""/></button><output>{{ count }}</output><button type="button" aria-label="Увеличить число повторений" @click="emit('update:finish','count'); emit('update:count',count+1)"><img src="/assets/repeat/plus.svg" width="24" height="24" alt=""/></button></div><span>повторений</span></div>
    </fieldset>
    <MentorButton class="repeat-save" :variant="1" @click="emit('save')">Сохранить</MentorButton>
  </section>
</template>
<style scoped>
.repeat-settings { display: flex; flex-direction: column; gap: 16px; width: 376px; max-width: 100%; border: 2px solid var(--border-texture); padding: 20px; background: var(--bg-surface); box-shadow: 0 8px 24px rgb(0 0 0 / .12); }
.repeat-settings-group { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.repeat-caption { padding: 0; color: var(--text-secondary); font-family: var(--font-display-family); font-size: 14px; line-height: 18px; font-weight: 500; }
.repeat-interval-row { display: flex; align-items: flex-start; gap: 16px; width: 100%; }
.repeat-stepper { display: flex; align-items: center; gap: 8px; height: 48px; flex: none; }
.repeat-stepper button { width: 24px; height: 24px; border: 0; padding: 0; border-radius: 50%; background: var(--border-texture); cursor: pointer; }
.repeat-stepper button:disabled { background: var(--bg-subdued); cursor: default; }
.repeat-stepper img { display: block; width: 24px; height: 24px; }
.repeat-stepper output { font-family: var(--font-body-family); font-size: 16px; line-height: 18px; }
.repeat-interval-row :deep(.field) { min-width: 0; }
.repeat-weekdays { display: flex; gap: 4px; width: 100%; }
.repeat-weekdays :deep(.filter-chip) { flex: 1; min-width: 0; padding-inline: 0; }
.repeat-finish { display: flex; flex-direction: column; gap: 10px; min-width: 0; border: 0; margin: 0; padding: 0; }
.repeat-finish legend { margin-bottom: 10px; }
.repeat-date-row, .repeat-count-row { position: relative; display: flex; align-items: center; gap: 8px; min-height: 28px; }
.repeat-date-button { border: 0; padding: 0; background: transparent; color: var(--text-primary); font-family: var(--font-body-family); font-size: 16px; line-height: 19px; font-weight: 700; cursor: pointer; }
.repeat-native-date { position: absolute; left: 70px; top: 0; width: 1px; height: 1px; opacity: 0; }
.repeat-count-row { min-height: 48px; font-family: var(--font-body-family); font-size: 16px; line-height: 24px; }
.repeat-count-stepper { gap: 8px; }
.repeat-count-row > span { white-space: nowrap; }
:deep(.repeat-save.app-button) { height: 40px; max-width: none; }
@media (max-width: 390px) { .repeat-settings { padding: 16px; } .repeat-count-row { flex-wrap: wrap; } }
</style>
