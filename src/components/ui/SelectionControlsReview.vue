<script setup lang="ts">
import { ref } from 'vue';
import RadioControl from './RadioControl.vue';
import FilterChip from './FilterChip.vue';
const chosen = ref('selected');
const chip = ref('Все');
</script>
<template>
  <div class="selection-controls-review">
    <section><h2>Радиокнопка</h2><div class="radio-examples">
      <RadioControl v-model="chosen" value="default" name="radio-review" label="Выбрать вариант"/>
      <RadioControl v-model="chosen" value="selected" name="radio-review" label="Выбрать вариант"/>
      <RadioControl model-value="" value="disabled" name="radio-disabled" label="Выбрать вариант" disabled/>
      <RadioControl v-model="chosen" value="state4" name="radio-review" label="Выбрать вариант"/>
    </div><p role="status">Выбрано: {{ chosen }}</p></section>
    <section><h2>Фильтр</h2><div class="chip-examples"><FilterChip :selected="chip === 'Нет'" @click="chip = 'Нет'">Все</FilterChip><FilterChip :selected="chip === 'Все'" @click="chip = 'Все'">Все</FilterChip></div><p role="status">Активный вариант: {{ chip }}</p></section>
  </div>
</template>
<style scoped>
.selection-controls-review { display: flex; flex-wrap: wrap; gap: 48px; margin: 32px 0; }
.selection-controls-review section { display: flex; flex-direction: column; gap: 16px; }
.radio-examples { display: flex; flex-direction: column; gap: 20px; }
.chip-examples { display: flex; gap: 35px; align-items: start; }
.selection-controls-review p { font-size: 14px; color: var(--text-secondary); }
</style>
