<script setup lang="ts">
import { ref } from 'vue';
import ActionIconButton from './ActionIconButton.vue';
const clicks = ref(0);
</script>
<template>
  <div class="action-icons-review">
    <div v-for="action in ['edit','delete'] as const" :key="action" class="action-icons-group">
      <h2>{{ action === 'edit' ? 'Редактировать' : 'Удалить' }}</h2>
      <div class="action-icons-states">
        <div><span>Default</span><ActionIconButton :action="action" :label="`${action}: Default`" @click="clicks++"/></div>
        <div><span>Hover</span><ActionIconButton :action="action" :label="`${action}: Hover`" force-hover @click="clicks++"/></div>
        <div><span>Active</span><ActionIconButton :action="action" :label="`${action}: Active`" active @click="clicks++"/></div>
      </div>
    </div>
  </div>
  <p class="action-icons-status" role="status">Нажатий: {{ clicks }}</p>
</template>
<style scoped>
.action-icons-review { display: flex; flex-wrap: wrap; gap: 48px; margin: 32px 0; }
.action-icons-group { display: flex; flex-direction: column; gap: 24px; }
.action-icons-states { display: flex; gap: 24px; }
.action-icons-states > div { display: flex; flex-direction: column; gap: 12px; font-size: 14px; color: var(--text-secondary); }
.action-icons-status { margin-block: 24px; }
</style>
