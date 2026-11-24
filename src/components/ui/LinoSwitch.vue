<script setup lang="ts">
import {useAdminLino} from '../../lib/admin-ui';
const props=defineProps<{id:string;modelValue:boolean;label:string;disabled?:boolean}>();
const emit=defineEmits<{'update:modelValue':[value:boolean]}>();const modern=useAdminLino();
</script>
<template><div v-if="modern" class="admin-switch-field"><button :id="id" class="lino-switch" data-slot="switch" type="button" role="switch" :data-state="modelValue?'checked':'unchecked'" :aria-checked="modelValue" :aria-label="label" :disabled="disabled" @click="emit('update:modelValue',!modelValue)"><span class="lino-switch-thumb" data-slot="switch-thumb" :data-state="modelValue?'checked':'unchecked'"/></button><label class="lino-field-label admin-switch-label" :for="id">{{ label }}</label></div><label v-else><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="emit('update:modelValue',($event.target as HTMLInputElement).checked)"/> {{ label }}</label></template>
