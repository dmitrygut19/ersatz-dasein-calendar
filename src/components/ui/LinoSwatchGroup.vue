<script setup lang="ts">
const props=defineProps<{modelValue:string;options:{value:string;label:string;color:string}[];label:string}>();
const emit=defineEmits<{'update:modelValue':[value:string]}>();
function key(event:KeyboardEvent,index:number){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?props.options.length-1:(index+(event.key==='ArrowRight'?1:-1)+props.options.length)%props.options.length;emit('update:modelValue',props.options[next].value);(event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();}
</script>
<template><div class="lino-swatches" role="radiogroup" :aria-label="label"><button v-for="(option,index) in options" :key="option.value" class="lino-swatch is-color" type="button" role="radio" :aria-label="option.label" :aria-checked="modelValue===option.value" :data-state="modelValue===option.value?'checked':'unchecked'" :tabindex="modelValue===option.value?0:-1" :style="{'--c':option.color}" @click="emit('update:modelValue',option.value)" @keydown="key($event,index)"><span class="lino-face"/></button></div></template>
