<script setup lang="ts">
import {ref} from 'vue';
import {useAdminLino} from '../../lib/admin-ui';
import Classic from './FigmaFieldClassic.vue';
import Modern from './LinoFieldModern.vue';
const props=withDefaults(defineProps<{id:string;label:string;modelValue:string|number|null;type?:'text'|'password'|'number'|'select';disabled?:boolean;error?:string;maxLength?:number;required?:boolean;hiddenLabel?:boolean;helper?:string;placeholder?:string;leadingIcon?:boolean;trailingIcon?:boolean;colorSwatch?:string;options?:{label:string;value:string|null}[];suggestions?:string[]}>(),{type:'text'});
const emit=defineEmits<{'update:modelValue':[value:string|number|null]}>();
const modern=useAdminLino(),control=ref<{focus:()=>void}|null>(null);
function update(value:string|number|null){if(!modern){emit('update:modelValue',value);return;}const option=props.type==='select'?props.options?.find(option=>String(option.value??'')===String(value)):undefined;emit('update:modelValue',props.type==='number'?(value===''?null:Number(value)):option?option.value:value);}
defineExpose({focus:()=>control.value?.focus()});
</script>
<template><component :is="modern?Modern:Classic" ref="control" v-bind="props" :helper="undefined" :native-select="false" @update:model-value="update"/></template>
