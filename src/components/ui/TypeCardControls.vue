<script setup lang="ts">
import FigmaField from './FigmaField.vue';
import MentorSecondaryButton from './MentorSecondaryButton.vue';
const props = defineProps<{ id: string; modelValue: string | null; options: {label:string;value:string}[] }>();
const emit=defineEmits<{ 'update:modelValue':[value:string|null]; create:[] }>();
</script>
<template>
  <FigmaField :id="id" :model-value="modelValue" label="Участники" hidden-label type="select" :options="options" @update:model-value="emit('update:modelValue', $event === null ? null : String($event))"/>
  <MentorSecondaryButton class="type-card-create" @click="emit('create')">Создать тип</MentorSecondaryButton>
</template>
<style>
.type-card-controls > .field { flex: 0 1 527px; }
.type-card-create { flex: 1; min-width: 0; min-height: var(--control-default); white-space: nowrap; }
.type-card[data-size='mobile'] .type-card-controls { margin-top: -5px; }
.type-card[data-size='mobile'] .type-card-controls > .field { flex: none; }
.type-card[data-size='mobile'] .type-card-controls .field-control, .type-card[data-size='mobile'] .type-card-controls input, .type-card[data-size='mobile'] .type-card-controls select { height: 42px; }
.type-card[data-size='mobile'] .field-chevron { display: none; }
.type-card[data-size='mobile'] .has-chevron select { padding-right: var(--space-4); }
.type-card[data-size='mobile'] .type-card-create { flex: none; min-height: var(--control-compact); width: calc(100% - 2px); }
@container (max-width: 600px) {
 .type-card[data-size='responsive'] .type-card-controls { margin-top: -5px; }
 .type-card[data-size='responsive'] .type-card-controls > .field { flex: none; }
 .type-card[data-size='responsive'] .type-card-controls .field-control, .type-card[data-size='responsive'] .type-card-controls input, .type-card[data-size='responsive'] .type-card-controls select { height: 42px; }
 .type-card[data-size='responsive'] .field-chevron { display: none; }
 .type-card[data-size='responsive'] .has-chevron select { padding-right: var(--space-4); }
 .type-card[data-size='responsive'] .type-card-create { flex: none; min-height: var(--control-compact); width: calc(100% - 2px); }
}
</style>
