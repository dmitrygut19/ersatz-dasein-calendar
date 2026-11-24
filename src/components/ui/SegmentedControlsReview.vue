<script setup lang="ts">
import { ref } from 'vue';
import SegmentedControl from './SegmentedControl.vue';
const provider = ref('Google Календарь');
const tier = ref('Все');
const degree = ref('Все');
</script>
<template>
  <div class="segmented-review">
    <SegmentedControl v-model="provider" :options="['Google Календарь', 'Яндекс Календарь']" label="Календарь" fluid/>
    <div class="segmented-filter-pair">
      <SegmentedControl v-model="degree" :options="['Все', 'I', 'II', 'III']" label="Градус" framed/>
      <SegmentedControl v-model="tier" :options="['Все', 'Тир I', 'Тир II', 'Тир III']" label="Тир" framed/>
    </div>
    <p role="status">Календарь: {{ provider }} · Градус: {{ degree }} · Тир: {{ tier }}</p>
  </div>
</template>
<style scoped>
.segmented-review { display: flex; flex-direction: column; align-items: flex-start; gap: 32px; margin: 32px 0; max-width: 840px; }
.segmented-review > :first-child { width: 100%; }
.segmented-filter-pair { display: flex; flex-wrap: wrap; gap: 32px; width: 100%; }
.segmented-filter-pair > * { flex: 0 1 280px; max-width: 100%; }
</style>
