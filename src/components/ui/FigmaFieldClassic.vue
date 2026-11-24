<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
const props = withDefaults(defineProps<{
  id: string; label: string; modelValue: string | number | null;
  type?: 'text' | 'password' | 'number' | 'select'; disabled?: boolean; error?: string;
  maxLength?: number; required?: boolean; hiddenLabel?: boolean;
  helper?: string; placeholder?: string; leadingIcon?: boolean; trailingIcon?: boolean;
  colorSwatch?: string;
  options?: { label: string; value: string | null }[]; suggestions?: string[];
}>(), { type: 'text' });
const emit = defineEmits<{ 'update:modelValue': [value: string | number | null] }>();
const control = ref<HTMLInputElement | HTMLButtonElement | null>(null);
const colorPicker = ref<HTMLInputElement | null>(null);
const root = ref<HTMLElement | null>(null);
const open = ref(false);
const state = computed(() => props.disabled ? 'disabled' : props.error ? 'error' : 'default');
const pickerValue = computed(() => /^#[0-9A-Fa-f]{6}$/.test(String(props.modelValue)) ? String(props.modelValue) : '#000000');
function openColorPicker() { if (!props.disabled) colorPicker.value?.click(); }
function updateColor(event: Event) { emit('update:modelValue', (event.target as HTMLInputElement).value.toUpperCase()); }
const chevron = computed(() => props.trailingIcon || props.type === 'select' || Boolean(props.suggestions));
const helperText = computed(() => props.error || props.helper);
const currentValue = computed(() => props.modelValue ?? '');
const currentLabel = computed(() => props.type === 'select' ? (props.options?.find(option => (option.value ?? '') === currentValue.value)?.label ?? props.placeholder ?? '') : '');
function update(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', props.type === 'number' ? (value === '' ? null : Number(value)) : value);
}
function toggle() { if (props.disabled) return; open.value = !open.value; }
function choose(option: { label: string; value: string | null }) { emit('update:modelValue', option.value); open.value = false; control.value?.focus(); }
async function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open.value = true; await nextTick(); moveFocus(event.key === 'ArrowDown' ? 1 : -1); }
  else if (event.key === 'Escape' && open.value) { event.stopPropagation(); open.value = false; }
}
function onMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopPropagation(); open.value = false; control.value?.focus(); }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); moveFocus(event.key === 'ArrowDown' ? 1 : -1); }
  if (event.key === 'Tab') open.value = false;
}
function moveFocus(direction: number) {
  const buttons = [...root.value?.querySelectorAll<HTMLButtonElement>('.field-select-option') ?? []];
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = buttons[(index + direction + buttons.length) % buttons.length] ?? buttons[0];
  next?.focus();
}
function onDocumentPointer(event: PointerEvent) { if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false; }
onMounted(() => document.addEventListener('pointerdown', onDocumentPointer));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointer));
defineExpose({ focus: () => control.value?.focus() });
</script>
<template>
  <div class="field" :data-state="state">
    <label :id="id + '-label'" :for="id" :class="{ 'sr-only': hiddenLabel }">{{ label }}</label>
    <div class="field-control" :class="{ 'has-chevron': chevron, 'has-leading-icon': leadingIcon, 'has-color-swatch': colorSwatch }">
      <img v-if="leadingIcon" class="field-leading" :src="`/assets/input/calendar-${state}.svg`" width="24" height="24" alt=""/>
      <template v-if="colorSwatch">
        <button type="button" class="field-color-swatch" :style="{ backgroundColor: colorSwatch }" :disabled="disabled" aria-label="Палитра" :aria-describedby="id + '-label'" @click="openColorPicker"></button>
        <input ref="colorPicker" class="field-color-picker" type="color" :value="pickerValue" tabindex="-1" aria-hidden="true" @input="updateColor"/>
      </template>
      <div v-if="type === 'select'" ref="root" class="field-select">
        <button :id="id" ref="control" type="button" class="field-select-trigger" :disabled="disabled" aria-haspopup="listbox" :aria-expanded="open" :aria-invalid="Boolean(error)" :aria-describedby="helperText ? id + '-helper' : undefined" @click="toggle" @keydown="onTriggerKeydown"><span class="field-select-value">{{ currentLabel }}</span></button>
        <div v-if="open" class="field-select-menu" role="listbox" :aria-labelledby="id" tabindex="-1" @keydown="onMenuKeydown">
          <button v-for="option in options" :key="option.value ?? ''" type="button" role="option" class="field-select-option" :class="{ 'is-current': (option.value ?? '') === currentValue }" :aria-selected="(option.value ?? '') === currentValue" @click="choose(option)">{{ option.label }}</button>
        </div>
      </div>
      <input v-else autocomplete="off" :id="id" ref="control" :type="type" :value="modelValue ?? ''" :placeholder="placeholder" :maxlength="maxLength" :required="required" :disabled="disabled" :list="suggestions ? id + '-options' : undefined" :min="type === 'number' ? 0 : undefined" :step="type === 'number' ? 1 : undefined" :aria-invalid="Boolean(error)" :aria-describedby="helperText ? id + '-helper' : undefined" @input="update"/>
      <img v-if="chevron" class="field-chevron" :src="`/assets/input/chevron-${state}.svg`" width="24" height="24" alt=""/>
    </div>
    <datalist v-if="suggestions" :id="id + '-options'"><option v-for="value in suggestions" :key="value" :value="value"/></datalist>
    <p v-if="helperText" :id="id + '-helper'" class="field-helper" :class="{ 'field-error': error }" :role="error ? 'alert' : undefined">{{ helperText }}</p>
  </div>
</template>
