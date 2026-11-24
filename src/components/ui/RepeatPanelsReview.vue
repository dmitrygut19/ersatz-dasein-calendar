<script setup lang="ts">
import { ref } from 'vue';
import RepeatMenu from './RepeatMenu.vue';
import RepeatSettings from './RepeatSettings.vue';
const selected = ref('Не повторять');
const interval = ref(1), unit = ref('Неделю'), days = ref(['Пн','Чт']);
const finish = ref('never'), until = ref('2026-10-29'), count = ref(10);
const saved = ref(0);
</script>
<template>
  <div class="repeat-panels-review">
    <section><h2>Меню повтора</h2><RepeatMenu date="2026-10-29" :selected="selected" @select="selected = $event"/><p role="status">Выбрано: {{ selected }}</p></section>
    <section><h2>Настройка повторов</h2><RepeatSettings v-model:interval="interval" v-model:unit="unit" v-model:days="days" v-model:finish="finish" v-model:until="until" v-model:count="count" @save="saved++"/><p role="status">Сохранений: {{ saved }}</p></section>
  </div>
</template>
<style scoped>
.repeat-panels-review { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 40px; margin: 32px 0; }
.repeat-panels-review > section { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; min-width: 0; max-width: 100%; }
.repeat-panels-review p { font-size: 14px; color: var(--text-secondary); }
</style>
