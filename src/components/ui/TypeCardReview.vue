<script setup lang="ts">
import { ref } from 'vue';
import TypeCard from './TypeCard.vue';
import TypeCardControls from './TypeCardControls.vue';
import AccessBadge from './AccessBadge.vue';
const selected=ref<string|null>('Участники Сатурналий');
const options=[{label:'Участники Сатурналий',value:'Участники Сатурналий'},{label:'Все участники',value:'Все участники'}];
function createType() { window.location.href='/admin?screen=type-new'; }
const examples=[{id:'desktop-open',access:'open',size:'desktop'},{id:'desktop-closed',access:'closed',size:'desktop'},{id:'mobile-open',access:'open',size:'mobile'},{id:'mobile-closed',access:'closed',size:'mobile'}] as const;
</script>
<template>
  <div class="type-card-reference">
    <div v-for="example in examples" :key="example.id" class="type-card-example" :class="example.id">
      <TypeCard title="САТУРНАЛИИ" count-label="3 события" :access="example.access" :size="example.size">
        <template #badge><AccessBadge compact :variant="example.access === 'open' ? 'success' : 'error'">ТЕКСТ</AccessBadge></template>
        <template #controls><TypeCardControls :id="`card-${example.id}`" v-model="selected" :options="options" @create="createType"/></template>
      </TypeCard>
    </div>
  </div>
</template>
<style>
.type-card-reference { position: relative; width: 852px; height: 628px; background: #e9e9e9; }
.type-card-example { position: absolute; width: 812px; left: 20px; }
.type-card-example.desktop-open { top: 14px; }
.type-card-example.desktop-closed { top: 108px; left: 21px; }
.type-card-example.mobile-open { top: 292px; width: 326px; }
.type-card-example.mobile-closed { top: 292px; left: 369px; width: 326px; }
@media (max-width: 948px) {
 .type-card-reference { width: 100%; height: auto; display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-3); }
 .type-card-example { position: static; width: 100% !important; }
 .type-card-example.desktop-open, .type-card-example.desktop-closed { display: none; }
}
</style>
