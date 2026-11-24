<script setup lang="ts">
import { computed } from 'vue';
import tokens from '../../../design/tokens.json';
const props = defineProps<{ id: string; palette: { background: string; text: string; accent: string } }>();
const matrix = computed(() => {
  const source = tokens.color.primitive;
  const rgb = (value: string, fallback: string) => {
    const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    return [1,3,5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  };
  const base = rgb(source['brown-900'], source['brown-900']);
  const ink = rgb(source['copper-700'], source['copper-700']);
  const targetBase = rgb(props.palette.background, source['brown-900']);
  const targetInk = rgb(props.palette.accent, source['copper-700']);
  const delta = ink.map((value, index) => value - base[index]);
  const norm = delta.reduce((sum, value) => sum + value * value, 0);
  const projection = delta.map(value => value / norm);
  const origin = projection.reduce((sum, value, index) => sum + value * base[index], 0);
  const rows = targetInk.map((value, index) => {
    const difference = value - targetBase[index];
    return [...projection.map(coefficient => coefficient * difference),0,targetBase[index] - difference * origin];
  });
  return [...rows.flat(),0,0,0,1,0].join(' ');
});
</script>
<template><svg class="button-palette-defs" width="0" height="0" aria-hidden="true"><defs><filter :id="id" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" :values="matrix"/></filter></defs></svg></template>
<style scoped>.button-palette-defs { position: absolute; pointer-events: none; }</style>
