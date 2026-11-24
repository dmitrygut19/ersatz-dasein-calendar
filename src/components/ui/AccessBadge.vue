<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'success' | 'error'; compact?: boolean }>(), { variant: 'success' });
</script>
<template>
  <span class="access-badge" :data-variant="variant" :class="{ 'access-badge--compact': compact }"><span class="access-badge__text"><slot>ТЕКСТ</slot></span></span>
</template>
<style>
.access-badge { position: relative; display: inline-flex; align-items: center; flex: none; padding: var(--space-1) var(--space-3); background: var(--bg-surface); color: var(--access-open); font-family: var(--font-body-family), sans-serif; font-size: var(--badge-size); font-weight: var(--badge-weight); line-height: var(--badge-line); white-space: nowrap; }
.access-badge::before { content: ''; position: absolute; inset: -2px; background: url('/assets/badges/success.png?v=manual1') center / 100% 100% no-repeat; pointer-events: none; }
.access-badge[data-variant='error'] { color: var(--access-closed); line-height: normal; }
.access-badge[data-variant='error']::before { background-image: url('/assets/badges/error.png?v=manual1'); }
.access-badge__text { position: relative; }
.access-badge--compact { font-size: var(--input-helper-size); line-height: var(--caption-line); }
</style>
