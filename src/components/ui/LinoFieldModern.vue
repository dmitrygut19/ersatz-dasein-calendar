<script setup lang="ts">
import { computed, ref } from 'vue';
import { linoCut as vLinoCut } from '../../lib/admin-material';
import LinoIcon from './LinoIcon.vue';
import LinoMultiSelect from './LinoMultiSelect.vue';
const props=withDefaults(defineProps<{id:string;label:string;modelValue?:string|number|null;type?:string;options?:{label:string;value:string|number|null}[];nativeSelect?:boolean;disabled?:boolean;readonly?:boolean;required?:boolean;maxLength?:number;helper?:string;error?:string;hiddenLabel?:boolean;placeholder?:string;colorSwatch?:string;leadingIcon?:boolean;suggestions?:string[]}>(),{type:'text',nativeSelect:true});
const emit=defineEmits<{'update:modelValue':[value:string]}>();
const control=ref<HTMLElement|null>(null), picker=ref<HTMLInputElement|null>(null);
const selected=computed(()=>props.options?.find(option=>String(option.value??'')===String(props.modelValue??'')));
const helper=computed(()=>props.error||props.helper);
const swatch=computed(()=>/^#[0-9a-f]{6}$/i.test(String(props.modelValue))?String(props.modelValue):props.colorSwatch);
const read=(event:Event)=>emit('update:modelValue',(event.target as HTMLInputElement).value);
defineExpose({focus:()=>control.value?.focus()});
</script>
<template>
  <div class="field lino-field-modern" :data-state="disabled?'disabled':error?'error':'default'">
    <label :id="id+'-label'" class="lino-field-label" :class="{'sr-only':hiddenLabel}" :for="id">{{ label }}</label>
    <LinoMultiSelect v-if="type==='select'" ref="control" :control-id="id" :model-value="[String(modelValue??'')]" :options="(options??[]).map(option=>({value:String(option.value??''),label:option.label}))" :label="label" :summary="selected?.label ?? placeholder ?? ''" :disabled="disabled||readonly" :invalid="Boolean(error)" :described-by="helper?id+'-helper':undefined" single hide-label admin-menu @update:model-value="emit('update:modelValue',$event[0]??'')"/>
    <div v-else v-lino-cut="'chip'" class="lino-input" :class="{'lino-multiline':type==='textarea','has-color-swatch':Boolean(colorSwatch)}">
      <LinoIcon v-if="leadingIcon" name="calendar-calendar"/>
      <template v-if="colorSwatch"><button type="button" class="field-color-swatch" :style="{backgroundColor:swatch}" :disabled="disabled" :aria-label="'Палитра: '+label" @click="picker?.click()"/><input ref="picker" class="field-color-picker" type="color" :value="swatch" tabindex="-1" aria-hidden="true" @input="emit('update:modelValue',($event.target as HTMLInputElement).value.toUpperCase())"/></template>
      <textarea v-if="type==='textarea'" :id="id" ref="control" :value="modelValue??''" :readonly="readonly" :disabled="disabled" :maxlength="maxLength" rows="3" :aria-invalid="Boolean(error)" :aria-describedby="helper?id+'-helper':undefined" @input="read"/>
      <input v-else autocomplete="off" :id="id" ref="control" :type="type" :value="modelValue??''" :disabled="disabled" :readonly="readonly" :required="required" :maxlength="maxLength" :placeholder="placeholder" :list="suggestions?id+'-options':undefined" :min="type==='number'?0:undefined" :step="type==='number'?1:undefined" :aria-invalid="Boolean(error)" :aria-describedby="helper?id+'-helper':undefined" @input="read"/>
    </div>
    <datalist v-if="suggestions" :id="id+'-options'"><option v-for="value in suggestions" :key="value" :value="value"/></datalist>
    <p v-if="helper" :id="id+'-helper'" class="field-helper" :class="{'field-error':error}" :role="error?'alert':undefined">{{ helper }}</p>
  </div>
</template>
