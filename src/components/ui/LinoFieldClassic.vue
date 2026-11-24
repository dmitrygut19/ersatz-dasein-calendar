<script setup lang="ts">
import { linoSurface as vLinoSurface } from '../../lib/lino-card-frame';
const props = withDefaults(defineProps<{id:string;modelValue?:string|number|null;label:string;type?:string;options?:{label:string;value:string|number|null}[];disabled?:boolean;readonly?:boolean;required?:boolean;maxLength?:number;helper?:string}>(),{type:'text'});
const emit=defineEmits<{'update:modelValue':[value:string]}>();
function update(event:Event) { emit('update:modelValue',(event.target as HTMLInputElement).value); }
</script>
<template>
  <div class="field lino-field">
    <label :for="id">{{ label }}</label>
    <div v-lino-surface="true" class="admin-event-lino lino-field-control" :class="{'lino-field-disabled':disabled}">
      <select v-if="type === 'select'" :id="id" :value="modelValue ?? ''" :disabled="disabled" :required="required" @change="update"><option v-for="option in options" :key="String(option.value)" :value="option.value ?? ''">{{ option.label }}</option></select>
      <textarea v-else-if="type === 'textarea'" :id="id" :value="modelValue ?? ''" :disabled="disabled" :readonly="readonly" :maxlength="maxLength" rows="3" @input="update"/>
      <input v-else autocomplete="off" :id="id" :value="modelValue ?? ''" :type="type" :disabled="disabled" :readonly="readonly" :required="required" :maxlength="maxLength" @input="update"/>
    </div>
    <p v-if="helper" class="field-helper">{{ helper }}</p>
  </div>
</template>
<style scoped>
.lino-field-control { display:flex; --surface-bg:var(--bg-surface); --surface-border:var(--border-texture); }
.lino-field-control:focus-within { --surface-border:var(--accent); }
.lino-field-control > :is(input,select,textarea) { width:100%; min-width:0; min-height:var(--control-default); padding:var(--space-3) var(--space-4); border:0; background:transparent; color:var(--text-primary); font:inherit; }
.lino-field-control > textarea { resize:vertical; }
.lino-field-disabled > :is(input,select,textarea) { color:var(--text-disabled); }
</style>
