<script setup lang="ts">
import { computed } from 'vue';
import LinoTag from '../ui/LinoTag.vue';
import { useAdminLino } from '../../lib/admin-ui';
import { adminAccessTags, type AccessEvent, type AccessLodge } from '../../lib/admin-access-tags';
const props = defineProps<{ event: AccessEvent; lodges: AccessLodge[] }>();
const modern = useAdminLino();
const tags = computed(() => adminAccessTags(props.event, props.lodges).filter(tag => tag.key !== 'degree'));
</script>
<template>
  <div class="event-access-tags" role="group" aria-label="Доступ участников">
    <component :is="modern ? LinoTag : 'span'" v-for="tag in tags" :key="tag.key" :tier="modern ? tag.tier ?? 0 : undefined" class="event-access-tag" :class="{'tier-badge':!modern}" :data-access-tag="tag.key">
      <span>{{ tag.label }}</span>
    </component>
  </div>
</template>
<style scoped>
.event-access-tags { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:var(--space-2); min-width:0; max-width:100%; }
.event-access-tag { display:inline-flex; gap:var(--space-2); max-width:100%; height:auto; min-height:var(--badge-height); white-space:normal; text-align:left; overflow-wrap:anywhere; }
.event-access-tag > span { min-width:0; }
@media (max-width:700px) { .event-access-tags { justify-content:flex-start; } }
</style>
