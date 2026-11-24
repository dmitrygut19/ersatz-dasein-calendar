<script setup lang="ts">
withDefaults(defineProps<{
  title: string; countLabel: string; access?: 'open' | 'closed'; size?: 'responsive' | 'desktop' | 'mobile';
}>(), { access: 'open', size: 'responsive' });
</script>
<template>
  <div class="type-card-host">
    <article class="type-card" :data-access="access" :data-size="size">
      <div class="type-card-heading">
        <div class="type-card-copy"><h3>{{ title }}</h3><p>{{ countLabel }}</p></div>
        <div class="type-card-badge"><slot name="badge"/></div>
      </div>
      <div v-if="access === 'closed'" class="type-card-controls"><slot name="controls"/></div>
    </article>
  </div>
</template>
<style>
.type-card-host { container-type: inline-size; min-width: 0; width: 100%; }
.type-card { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: var(--space-4); padding: var(--space-4) var(--space-5); min-width: 0; background: var(--bg-surface); }
.type-card::before { content: ''; position: absolute; inset: 0; border: var(--space-1) solid transparent; border-image: url('/assets/type-card/border-figma.png') 4 fill / var(--space-1) / 0 stretch; pointer-events: none; }
.type-card-heading { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); min-height: var(--control-default); min-width: 0; }
.type-card-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.type-card .type-card-copy h3 { margin: 0; color: var(--text-primary); font-family: var(--font-body-family), sans-serif; font-size: var(--control-lg-size); font-weight: var(--font-weight-bold); line-height: normal; overflow-wrap: anywhere; }
.type-card-copy p { margin: 0; color: var(--text-secondary); font-family: var(--font-body-family), sans-serif; font-size: var(--input-helper-size); font-weight: var(--input-helper-weight); line-height: var(--caption-line); }
.type-card-badge { flex: none; }
.type-card .access-badge--compact { line-height: var(--caption-line); }
.type-card-controls { position: relative; display: flex; align-items: flex-end; gap: var(--space-4); min-width: 0; }
.type-card[data-size='mobile'] { gap: var(--space-3); }
.type-card[data-size='mobile'] .type-card-heading { flex-direction: column-reverse; justify-content: flex-start; gap: var(--space-2); min-height: 0; }
.type-card[data-size='mobile'][data-access='open'] .type-card-heading { min-height: 85px; justify-content: space-between; padding: 1px; }
.type-card[data-size='mobile'] .type-card-copy h3 { font-size: var(--body-md-size); line-height: var(--body-sm-line); }
.type-card[data-size='mobile'] .type-card-copy p { line-height: normal; }
.type-card[data-size='mobile'] .access-badge--compact { line-height: normal; }
.type-card[data-size='mobile'] .type-card-controls { flex-direction: column; align-items: stretch; gap: var(--space-3); }
@container (max-width: 600px) {
  .type-card[data-size='responsive'] { gap: var(--space-3); }
  .type-card[data-size='responsive'] .type-card-heading { flex-direction: column-reverse; justify-content: flex-start; gap: var(--space-2); min-height: 0; }
  .type-card[data-size='responsive'][data-access='open'] .type-card-heading { min-height: 85px; justify-content: space-between; padding: 1px; }
  .type-card[data-size='responsive'] .type-card-copy h3 { font-size: var(--body-md-size); line-height: var(--body-sm-line); }
  .type-card[data-size='responsive'] .type-card-copy p { line-height: normal; }
  .type-card[data-size='responsive'] .access-badge--compact { line-height: normal; }
  .type-card[data-size='responsive'] .type-card-controls { flex-direction: column; align-items: stretch; gap: var(--space-3); }
}
</style>
