<script setup lang="ts">
import { nextTick,onBeforeUnmount,onMounted,ref,watch } from 'vue';
import { linoCut as vLinoCut } from '../../lib/admin-material';
const props=defineProps<{modelValue:string;options:{value:string;label:string}[];label:string;disabled?:boolean;fluid?:boolean}>();
const emit=defineEmits<{'update:modelValue':[value:string]}>();
const root=ref<HTMLElement|null>(null), thumb=ref<HTMLElement|null>(null);let observer:ResizeObserver|undefined;
function place(){const item=root.value?.querySelector<HTMLElement>('[data-state=on]');if(!thumb.value)return;thumb.value.hidden=!item;if(item)Object.assign(thumb.value.style,{transform:`translate(${item.offsetLeft}px,${item.offsetTop}px)`,width:item.offsetWidth+'px',height:item.offsetHeight+'px'});}
watch(()=>props.modelValue,()=>nextTick(place));
onMounted(()=>{observer=new ResizeObserver(place);if(root.value){observer.observe(root.value);for(const child of root.value.children)if(child!==thumb.value)observer.observe(child);}place();});
onBeforeUnmount(()=>observer?.disconnect());
function key(event:KeyboardEvent,index:number){let next=index;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%props.options.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index-1+props.options.length)%props.options.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=props.options.length-1;else return;event.preventDefault();emit('update:modelValue',props.options[next].value);root.value?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();}
</script>
<template><div ref="root" v-lino-cut="'chip'" class="lino-toggles admin-toggle-group" :class="{'admin-toggle-fluid':fluid}" data-slot="toggle-group" data-variant="track" data-size="sm" role="group" :aria-label="label"><span class="lino-thumb-viewport" aria-hidden="true"><span ref="thumb" class="lino-thumb"/></span><button v-for="(option,index) in options" :key="option.value" type="button" class="lino-toggle" :data-state="modelValue===option.value?'on':'off'" :aria-pressed="modelValue===option.value" :disabled="disabled" @click="emit('update:modelValue',option.value)" @keydown="key($event,index)"><span class="lino-face">{{ option.label }}</span></button></div></template>
<style scoped>.admin-toggle-group{max-width:100%;flex-wrap:wrap;}.admin-toggle-fluid{width:100%;}.admin-toggle-group .lino-toggle{min-width:0;white-space:normal;overflow-wrap:anywhere;}
/* Clip only the animated fill during wrapping/resizing; focus rings stay whole. */
.lino-thumb-viewport{position:absolute;inset:0;overflow:clip;pointer-events:none;z-index:-1;}
</style>
