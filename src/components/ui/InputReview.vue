<script setup lang="ts">
import { ref } from 'vue';
import FigmaField from './FigmaField.vue';
const value = ref('Введите значение');
</script>
<template>
  <div class="input-reference" aria-label="Три состояния Input из Figma">
    <FigmaField id="input-default" v-model="value" label="Default" hidden-label helper="Ошибка" leading-icon trailing-icon/>
    <FigmaField id="input-error" model-value="Введите значение" label="error" hidden-label error="Ошибка" leading-icon trailing-icon/>
    <FigmaField id="input-disabled" model-value="Введите значение" label="Disabled" hidden-label helper="Ошибка" disabled leading-icon trailing-icon/>
  </div>
</template>
<style>
.input-reference { position: relative; width: 871px; height: 192px; background: #e9e9e9; }
.input-reference > .field { position: absolute; width: 403px; left: 20px; top: 20px; }
.input-reference > .field:nth-child(2) { left: 448px; top: 17px; }
.input-reference > .field:nth-child(3) { top: 112px; }
@media (max-width: 967px) {
  .input-reference { width: 100%; height: auto; padding: 20px; display: flex; flex-direction: column; gap: 24px; }
  .input-reference > .field { position: relative; inset: auto !important; width: 100%; flex: none; }
}
</style>
