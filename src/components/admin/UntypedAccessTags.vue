<script setup lang="ts">
import { computed } from 'vue';
import LinoTag from '../ui/LinoTag.vue';
import { useAdminLino } from '../../lib/admin-ui';
import { adminAccessTags, type AccessEvent, type AccessLodge } from '../../lib/admin-access-tags';
const props=defineProps<{event:AccessEvent;lodges:AccessLodge[]}>();
const modern=useAdminLino();
const tags=computed(()=>adminAccessTags(props.event,props.lodges).filter(tag=>tag.key!=='degree'));
</script>
<template>
  <div class="untyped-access-tags" role="group" aria-label="Аудитория события">
    <component :is="modern?LinoTag:'span'" v-for="tag in tags" :key="tag.key" class="untyped-access-tag" :class="{'tier-badge':!modern}" :data-access-tag="tag.key">
      <span>{{tag.label}}</span>
    </component>
  </div>
</template>
<style scoped>
.untyped-access-tags { display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);min-width:0; }
.untyped-access-tag { height:auto;min-height:var(--badge-height);max-width:100%;white-space:normal;overflow-wrap:anywhere; }
</style>
