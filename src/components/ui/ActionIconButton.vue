<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ action: 'edit' | 'delete'; label: string; active?: boolean; disabled?: boolean; forceHover?: boolean }>();
const assets = '/assets/action-icons/';
const frame = computed(() => props.action === 'edit' ? 'mask-edit.svg' : 'mask-delete.svg');
const icon = computed(() => props.active ? (props.action === 'edit' ? '/assets/panel/d7d44.svg' : assets + 'delete-active.svg') : props.action === 'edit' ? '/assets/panel/940d0.svg' : '/assets/panel/221fd.svg');
const editPath = 'M9.54111 3.07892C10.2903 3.82698 11.1038 4.81356 12.0885 5.50742M1.77043 11.0474C2.6267 11.5895 3.81478 12.7279 4.52121 13.6602M0.775012 14.7769C0.95697 13.7687 1.353 11.969 1.6634 10.939C4.24292 8.25032 7.3255 5.20386 10.0014 2.45011C10.4937 1.90804 10.9968 1.29007 11.6069 0.964823C12.1527 0.617895 12.7521 0.780518 13.191 1.21418L14.454 2.51516C14.9463 3.02471 14.8393 3.64268 14.3576 4.22812C11.2322 7.40468 7.70012 10.7222 4.66035 13.8771C3.62212 14.1698 1.87746 14.5384 0.775012 14.7769Z';
const deletePath = 'M0.775031 3.59031C4.32049 3.34801 9.64419 3.70569 13.775 3.2557M4.8396 3.1634C4.85065 2.41342 4.92796 1.58267 5.20409 0.878846C6.41904 0.728851 8.02057 0.924999 9.14716 0.775003L9.46747 3.33647M2.33238 3.97107C2.56433 6.94791 2.79627 11.0439 3.27121 14.2516C3.37061 15.1285 3.82346 15.6938 4.67393 15.6823C6.68412 15.7746 9.37911 15.913 10.8812 15.44C11.4445 15.2323 11.566 14.4823 11.6323 13.7785C11.8974 10.594 12.1625 6.78638 12.284 4.01722M5.25931 6.71715C5.09364 8.70171 5.48021 10.6517 5.45812 12.8439M9.03671 6.62484C9.24657 8.58633 8.79372 11.0093 8.92626 12.7747';
</script>
<template>
  <button class="action-icon-button" :class="{ 'is-active': active, 'force-hover': forceHover }" :data-action="action" type="button" :aria-label="label" :disabled="disabled" :style="{ '--action-frame': `url('${assets + frame}')` }">
    <img class="action-frame" :src="active ? '/assets/frames/action-active.svg' : assets + frame" width="42" height="42" alt=""/>
    <span v-if="!active" class="action-frame-hover" aria-hidden="true"></span>
    <img class="action-icon-static" :src="icon" width="18" height="18" alt=""/>
    <svg v-if="!active && action === 'edit'" class="action-icon-hover" width="15.55" height="15.5519" viewBox="0 0 15.55 15.5519" fill="none" aria-hidden="true"><path :d="editPath" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <svg v-if="!active && action === 'delete'" class="action-icon-hover" width="14.5501" height="16.55" viewBox="0 0 14.5501 16.55" fill="none" aria-hidden="true"><path :d="deletePath" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
</template>
<style scoped>
.action-icon-button { position: relative; display: block; flex: 0 0 40px; width: 40px; height: 40px; border: 0; padding: 0; background: var(--bg-subdued); cursor: pointer; }
.action-icon-button.is-active { background: var(--bg-canvas); }
.action-frame { position: absolute; left: -1px; top: -1px; display: block; width: 42px; height: 42px; pointer-events: none; }
.action-icon-static { position: absolute; left: 11px; top: 11px; display: block; width: 18px; height: 18px; pointer-events: none; }
.action-frame-hover { position: absolute; left: -1px; top: -1px; width: 42px; height: 42px; background: var(--accent); opacity: 0; pointer-events: none; -webkit-mask: var(--action-frame) 0 0 / 42px 42px no-repeat; mask: var(--action-frame) 0 0 / 42px 42px no-repeat; }
.action-icon-hover { position: absolute; left: 50%; top: 50%; display: block; opacity: 0; transform: translate(-50%,-50%); pointer-events: none; }
.action-icon-hover path { stroke: var(--accent); }
.action-frame-hover, .action-icon-hover, .action-icon-static { transition: opacity .3s ease; }
.action-icon-button:is(:hover,:focus-visible,.force-hover):not(:disabled):not(.is-active) .action-frame-hover,
.action-icon-button:is(:hover,:focus-visible,.force-hover):not(:disabled):not(.is-active) .action-icon-hover { opacity: 1; }
.action-icon-button:is(:hover,:focus-visible,.force-hover):not(:disabled):not(.is-active) .action-icon-static { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .action-frame-hover, .action-icon-hover, .action-icon-static { transition: none; }
}
</style>
