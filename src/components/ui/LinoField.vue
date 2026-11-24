<script setup lang="ts">
import {useAdminLino} from '../../lib/admin-ui';
import Classic from './LinoFieldClassic.vue';
import Modern from './LinoFieldModern.vue';
const props=defineProps<{id:string;modelValue?:string|number|null;label:string;type?:string;options?:{label:string;value:string|number|null}[];disabled?:boolean;readonly?:boolean;required?:boolean;maxLength?:number;helper?:string}>();
const emit=defineEmits<{'update:modelValue':[value:string]}>();
const modern=useAdminLino();
</script>
<template><component :is="modern ? Modern : Classic" v-bind="props" :helper="undefined" @update:model-value="emit('update:modelValue',$event)"/></template>
