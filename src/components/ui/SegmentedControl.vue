<script setup lang="ts">
import LinoToggleGroup from './LinoToggleGroup.vue';
const props = withDefaults(defineProps<{
  modelValue: string;
  options: string[];
  label: string;
  framed?: boolean;
  fluid?: boolean;
  lino?: boolean;
}>(), { framed: false, fluid: false });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function onKeydown(event: KeyboardEvent, index: number) {
  let next = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % props.options.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + props.options.length) % props.options.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = props.options.length - 1;
  else return;
  event.preventDefault();
  emit('update:modelValue', props.options[next]);
  (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
}
</script>

<template>
  <div v-if="lino" class="segmented-control" :class="{framed,fluid}"><span v-if="framed" class="lino-field-label">{{ label }}</span><LinoToggleGroup :model-value="modelValue" :options="options.map(value=>({value,label:value}))" :label="label" :fluid="fluid" @update:model-value="emit('update:modelValue',$event)"/></div>
  <div v-else class="segmented-control" :class="{ framed, fluid }">
    <span v-if="framed" class="segmented-label">{{ label }}</span>
    <div class="segmented-options" role="group" :aria-label="label">
      <button v-for="(option, index) in options" :key="option" type="button" :aria-pressed="modelValue === option" @click="emit('update:modelValue', option)" @keydown="onKeydown($event, index)">{{ option }}</button>
    </div>
  </div>
</template>

<style scoped>
.segmented-control { min-width: 0; }
.segmented-control.framed { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.segmented-label { font-family: var(--font-display-family); font-size: 14px; line-height: 18px; font-weight: var(--font-weight-medium); color: var(--text-secondary); }
.segmented-options { display: flex; align-items: stretch; gap: 4px; padding: 4px; background: var(--bg-canvas); min-width: 0; }
.framed .segmented-options { border: 2px solid var(--border-texture); }
.segmented-options button { display: flex; flex: 0 0 64px; align-items: center; justify-content: center; min-width: 0; min-height: 35px; padding: 8px 12px; border: 0; border-radius: 0; background: var(--bg-canvas); color: #aba8a6; font-family: var(--font-body-family); font-size: 16px; font-weight: var(--font-weight-medium); line-height: normal; white-space: nowrap; cursor: pointer; }
.segmented-options button[aria-pressed='true'] { background: var(--bg-surface); color: var(--text-primary); }
.segmented-options button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.fluid .segmented-options { width: 100%; }
.fluid .segmented-options button { flex: 1 1 0; }
@media (max-width: 359px) { .framed .segmented-options { width: 100%; } .framed .segmented-options button { flex: 1 1 0; padding-inline: 4px; } }
</style>
