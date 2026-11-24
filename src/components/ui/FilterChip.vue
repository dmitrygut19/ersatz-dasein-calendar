<script setup lang="ts">
withDefaults(defineProps<{ selected?: boolean; disabled?: boolean }>(), { selected: false });
</script>
<template>
  <button class="filter-chip" :class="{ 'is-selected': selected }" type="button" :aria-pressed="selected" :disabled="disabled"><slot/></button>
</template>
<style scoped>
.filter-chip { display: inline-flex; align-items: center; justify-content: center; min-height: 33px; border: 2px solid var(--border-texture); padding: 6px 12px; background: var(--bg-surface); color: var(--text-primary); font-family: var(--font-body-family); font-size: 14px; line-height: 17px; font-weight: 500; white-space: nowrap; cursor: pointer; }
.filter-chip.is-selected { background: var(--accent); color: var(--bg-surface); }
.filter-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
