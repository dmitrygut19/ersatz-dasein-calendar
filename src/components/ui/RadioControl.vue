<script setup lang="ts">
const props = defineProps<{ modelValue: string; value: string; name: string; disabled?: boolean; label: string; compact?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
function change() { if (!props.disabled) emit('update:modelValue', props.value); }
</script>
<template>
  <label class="radio-control" :class="{ 'is-selected': modelValue === value, 'is-disabled': disabled, 'is-compact': compact }">
    <input type="radio" :name="name" :value="value" :checked="modelValue === value" :disabled="disabled" @change="change"/>
    <span class="radio-mark" aria-hidden="true"><img v-if="modelValue === value" src="/assets/controls/radio-dot.svg" width="20" height="20" alt=""/></span>
    <span class="radio-label">{{ label }}</span>
  </label>
</template>
<style scoped>
.radio-control { position: relative; display: flex; align-items: center; gap: 8px; width: 210px; min-height: 28px; font-family: var(--font-body-family); font-size: 16px; line-height: 24px; font-weight: 400; color: var(--text-primary); cursor: pointer; }
.radio-control input { position: absolute; width: 20px; height: 20px; margin: 0; opacity: 0; }
.radio-mark { position: relative; flex: 0 0 20px; width: 20px; height: 20px; border: 2px solid var(--border-texture); border-radius: 10px; background: var(--bg-surface); overflow: hidden; }
.radio-mark img { position: absolute; left: -2px; top: -2px; display: block; width: 20px; height: 20px; }
.is-selected .radio-mark { background: var(--accent); }
.is-disabled { color: var(--text-placeholder); cursor: default; }
.is-disabled .radio-mark { border-color: var(--text-placeholder); }
.radio-control:has(input:focus-visible) .radio-mark { outline: 2px solid var(--accent); outline-offset: 2px; }
.radio-control.is-compact { width: auto; }
</style>
