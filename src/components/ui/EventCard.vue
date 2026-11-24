<script setup lang="ts">
import ActionIconButton from './ActionIconButton.vue';
defineProps<{ title: string; description: string; cover?: string | null; disabled?: boolean; nextEvent?: string | null }>();
const emit=defineEmits<{ edit: []; delete: [] }>();
</script>
<template>
  <article class="type-row event-card-row">
    <button class="mobile-row-trigger" type="button" :aria-label="`Редактировать ${title}`" :disabled="disabled" @click="emit('edit')"></button>
    <img v-if="cover" class="cover" :src="cover" alt="" width="72" height="46"/>
    <div class="type-summary"><h3>{{ title }}</h3><p>{{ description }}<template v-if="nextEvent"> · <span class="event-card-next">ближайшее {{ nextEvent }}</span></template></p></div>
    <div class="actions">
      <ActionIconButton action="edit" :label="`Редактировать ${title}`" :disabled="disabled" @click="emit('edit')"/>
      <ActionIconButton action="delete" :label="`Удалить ${title}`" :disabled="disabled" @click="emit('delete')"/>
    </div>
  </article>
</template>
<style>
.type-row.event-card-row { background: var(--bg-surface); }
.type-row.event-card-row::before { inset: -1px; border-image: url('/assets/event-card/border.png?v=manual1') 8 fill / var(--space-2) / 0 stretch; }
.event-card-row .cover { position: absolute; top: var(--space-3); left: var(--space-3); width: var(--event-cover-width); height: calc(100% - var(--space-3) - var(--space-3)); object-fit: cover; background: var(--bg-canvas); }
.event-card-row .type-summary { margin-left: calc(var(--event-cover-width) + var(--space-4)); }
.event-card-row .type-summary h3 { font-family: var(--font-display-family), sans-serif; font-weight: var(--font-weight-bold); font-size: var(--control-md-size); line-height: 22px; }
.event-card-row .type-summary p { font-family: var(--font-body-family), sans-serif; font-size: var(--input-helper-size); font-weight: var(--input-helper-weight); line-height: var(--body-sm-line); }
.event-card-row .type-summary strong, .event-card-row .type-summary .event-card-next { font-weight: var(--font-weight-medium); color: var(--text-primary); }
</style>
