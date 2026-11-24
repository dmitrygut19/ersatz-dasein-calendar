<script setup lang="ts">
// Vue bridge to lino's DropdownMenu checkbox rows and cut attachments. Like the
// existing LinoField bridge, it reuses published styles without adding Svelte.
import {computed,nextTick,onBeforeUnmount,onMounted,ref,useId} from 'vue';
import {linoCut as vLinoCut} from '../../lib/admin-material';
import LinoIcon from './LinoIcon.vue';
import {useAdminLino} from '../../lib/admin-ui';
import {useAdminDropdown} from '../../lib/admin-dropdown';
type Option = {value:string;label:string;iconUrl?:string|null;iconName?:string};
const props=defineProps<{modelValue:string[]; options:Option[];label:string;summary:string;single?:boolean;controlId?:string;hideLabel?:boolean;disabled?:boolean;invalid?:boolean;describedBy?:string;adminMenu?:boolean}>();
const emit=defineEmits<{'update:modelValue':[value:string[]]}>();
const root=ref<HTMLElement|null>(null), trigger=ref<HTMLButtonElement|null>(null),menu=ref<HTMLElement|null>(null),open=ref(false),id=useId();
const admin=useAdminLino()||props.adminMenu===true;
const {target}=useAdminDropdown(trigger,menu,open,admin,focusMenu);
const rows=computed<Option[]>(()=>props.single?props.options:[{value:'',label:'Все'},...props.options]);
const failedIcons=ref(new Set<string>());
function iconFailed(url:string){failedIcons.value.add(url);}
const selectedOption=computed(()=>props.modelValue.length===1?props.options.find(row=>row.value===props.modelValue[0]):undefined);
const selectedOptions=computed(()=>props.options.filter(row=>props.modelValue.includes(row.value)));
const selectedIconOptions=computed(()=>selectedOptions.value.filter(row=>row.iconUrl||row.iconName));
const selectedNames=computed(()=>selectedOptions.value.map(row=>row.label).join(', '));
const iconStrip=ref<HTMLElement|null>(null);
function scrollIcons(event:KeyboardEvent){if(props.modelValue.length>1&&iconStrip.value){event.preventDefault();const strip=iconStrip.value;strip.scrollBy({left:(event.key==='ArrowRight'?1:-1)*((strip.firstElementChild as HTMLElement)?.offsetWidth+parseFloat(getComputedStyle(strip).gap))});}}
function focusMenu(){const buttons=menu.value?.querySelectorAll<HTMLButtonElement>('[role=option],[role=menuitemcheckbox]');const selected=menu.value?.querySelector<HTMLButtonElement>('[aria-selected=true]');(selected??buttons?.[0])?.focus();}
async function show(){if(props.disabled)return;open.value=true;await nextTick();if(!admin)focusMenu();}
function choose(value:string){if(props.single){emit('update:modelValue',[value]);open.value=false;trigger.value?.focus();return;}emit('update:modelValue',!value?[]:props.modelValue.includes(value)?props.modelValue.filter(id=>id!==value):[...props.modelValue,value]);}
function key(event:KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();open.value=false;trigger.value?.focus();return;}
  if(event.key==='Tab'){open.value=false;trigger.value?.focus();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=[...menu.value?.querySelectorAll<HTMLButtonElement>('[role=menuitemcheckbox],[role=option]')??[]];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  const button=buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length];button?.focus();button?.scrollIntoView({block:'nearest'});
}
function outside(event:PointerEvent){if(!admin&&root.value&&!root.value.contains(event.target as Node))open.value=false;}
onMounted(()=>document.addEventListener('pointerdown',outside));onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside));
defineExpose({focus:()=>trigger.value?.focus()});
</script>
<template>
  <div ref="root" class="lino-multi-select">
    <span :id="id+'-label'" class="lino-field-label" :class="{'lino-visually-hidden':hideLabel}">{{ label }}</span>
    <div v-lino-cut="'chip'" class="lino-input">
      <button :id="controlId" ref="trigger" type="button" class="lino-select-trigger" :disabled="disabled" :aria-invalid="Boolean(invalid)" :aria-describedby="describedBy" :aria-labelledby="id+'-label '+id+'-summary'" :aria-haspopup="single?'listbox':'menu'" :aria-expanded="open" :aria-controls="open?id:undefined" @click="open?open=false:show()" @keydown.down.prevent="show" @keydown.up.prevent="show" @keydown.left="scrollIcons" @keydown.right="scrollIcons">
        <template v-if="!single && modelValue.length>1">
          <span :id="id+'-summary'" class="lino-visually-hidden">{{ selectedNames }}</span>
          <span ref="iconStrip" class="lino-selected-icons" aria-hidden="true">
            <span v-for="option in selectedIconOptions" :key="option.value" class="lino-option-icon" :title="option.label"><img v-if="option.iconUrl && !failedIcons.has(option.iconUrl)" :src="option.iconUrl" alt="" @error="iconFailed(option.iconUrl)"/><LinoIcon v-else-if="!option.iconUrl && option.iconName" :name="option.iconName"/></span>
          </span>
        </template>
        <template v-else>
          <span v-if="selectedOption?.iconUrl || selectedOption?.iconName" class="lino-option-icon" aria-hidden="true"><img v-if="selectedOption.iconUrl && !failedIcons.has(selectedOption.iconUrl)" :src="selectedOption.iconUrl" alt="" @error="iconFailed(selectedOption.iconUrl)"/><LinoIcon v-else-if="!selectedOption.iconUrl && selectedOption.iconName" :name="selectedOption.iconName"/></span><span :id="id+'-summary'" class="lino-option-label">{{ summary }}</span>
        </template>
        <LinoIcon name="chevron" class="lino-select-chevron"/>
      </button>
    </div>
    <Teleport :to="target" :disabled="!admin">
    <div v-if="open" :id="id" ref="menu" v-lino-cut="'plate'" :popover="admin?'manual':undefined" data-slot="dropdown-menu-content" class="lino-multi-menu" :class="{'admin-menu-popover':admin,'admin-ui--lino':admin}" :role="single?'listbox':'menu'" :aria-labelledby="id+'-label'" @keydown="key">
      <button v-for="option in rows" :key="option.value" type="button" :role="single?'option':'menuitemcheckbox'" :data-slot="single?'dropdown-menu-radio-item':'dropdown-menu-checkbox-item'" :aria-selected="single?modelValue.includes(option.value):undefined" :aria-checked="!single?(option.value?modelValue.includes(option.value):!modelValue.length):undefined" :data-state="(single?modelValue.includes(option.value):option.value?modelValue.includes(option.value):!modelValue.length)?'checked':'unchecked'" @pointerenter="($event.currentTarget as HTMLElement).setAttribute('data-highlighted','')" @pointerleave="($event.currentTarget as HTMLElement).removeAttribute('data-highlighted')" @focus="($event.currentTarget as HTMLElement).setAttribute('data-highlighted','')" @blur="($event.currentTarget as HTMLElement).removeAttribute('data-highlighted')" @click="choose(option.value)"><input type="checkbox" tabindex="-1" aria-hidden="true" :checked="single?modelValue.includes(option.value):option.value?modelValue.includes(option.value):!modelValue.length"/><span v-if="!single||option.iconUrl||option.iconName" class="lino-option-icon" aria-hidden="true"><img v-if="option.iconUrl && !failedIcons.has(option.iconUrl)" :src="option.iconUrl" alt="" @error="iconFailed(option.iconUrl)"/><LinoIcon v-else-if="!option.iconUrl && option.iconName" :name="option.iconName"/></span><span class="lino-option-label">{{ option.label }}</span></button>
    </div>
    </Teleport>
  </div>
</template>
<style scoped>
.lino-multi-select{position:relative;display:flex;flex-direction:column;gap:var(--space-2);min-width:0;width:100%;}
.lino-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:var(--space-2);width:100%;min-height:var(--control-height);padding:0 var(--space-3);background:none;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer;}
.lino-select-trigger .lino-option-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lino-multi-menu{position:absolute;top:calc(100% + var(--space-1));left:0;z-index:30;width:max-content;min-width:100%;max-width:100%;max-height:60vh;overflow-x:hidden;overflow-y:auto;scrollbar-width:none;}
.lino-multi-menu::-webkit-scrollbar{display:none;}
.lino-multi-menu button{width:100%;border:0;text-align:left;white-space:normal;overflow-wrap:anywhere;padding-block:var(--space-2);}
.lino-multi-menu button[data-state=checked]{--surface-bg:var(--color-divider);--_edge:var(--color-divider);color:var(--color-text);}
.lino-multi-menu button[data-state=checked][data-highlighted]{--surface-bg:color-mix(in srgb,var(--color-text) 10%,var(--color-surface));--_edge:var(--surface-bg);}
.lino-select-chevron{rotate:-90deg;}
.lino-multi-menu button:focus-visible{outline:var(--focus-ring);outline-offset:calc(-1 * var(--space-1));}
.lino-multi-menu input{pointer-events:none;accent-color:var(--color-text);flex:none;}
.lino-option-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--space-8);height:var(--space-8);--icon-size:var(--space-5);}
.lino-option-icon img{width:100%;height:100%;object-fit:contain;}
.lino-option-label{flex:1;min-width:0;}
.lino-selected-icons{display:flex;align-items:center;gap:var(--space-2);flex:1;min-width:0;overflow-x:auto;scrollbar-width:none;touch-action:pan-x;}
.lino-selected-icons::-webkit-scrollbar{display:none;}
.lino-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0;}
.lino-select-trigger:focus-visible{outline:var(--focus-ring);outline-offset:var(--focus-offset);}
.admin-menu-popover.lino-multi-menu { position:fixed;inset:auto;margin:0;min-width:0;max-width:none;box-sizing:border-box;border:0;background:var(--color-surface);padding:var(--space-1);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none; }
.admin-menu-popover::backdrop { background:transparent; }
.admin-menu-popover button { flex-shrink:0; }
</style>
