<script setup lang="ts">
import { computed } from 'vue';
import { icon } from 'lino-ui/icon';
import '../../lib/lino-calendar-icons.js';
const props = defineProps<{name:string}>();
const markup = computed(() => icon(props.name));
</script>
<template><span class="lino-glyph" aria-hidden="true" v-html="markup"/></template>
<style scoped>
.lino-glyph { display:inline-flex; align-items:center; justify-content:center; flex:none; width:var(--icon-size,var(--icon-sm)); height:var(--icon-size,var(--icon-sm)); }
.lino-glyph :deep(svg) { display:block; flex:none; width:calc(var(--icon-size,var(--icon-sm)) * var(--icon-w)); height:calc(var(--icon-size,var(--icon-sm)) * var(--icon-h)); margin:calc(var(--icon-size,var(--icon-sm)) * var(--icon-mt)) calc(var(--icon-size,var(--icon-sm)) * var(--icon-mr)) calc(var(--icon-size,var(--icon-sm)) * var(--icon-mb)) calc(var(--icon-size,var(--icon-sm)) * var(--icon-ml)); stroke:currentColor; stroke-width:max(0px,calc(var(--icon-stem,0px) - var(--icon-size,var(--icon-sm)) * var(--icon-h) * var(--icon-fr) * var(--icon-base))); }
</style>
