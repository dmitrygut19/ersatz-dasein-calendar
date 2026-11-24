<script setup lang="ts">
import { computed,nextTick,onMounted,ref } from 'vue';
import {repeatMenuOptions} from '../../lib/repeat-menu-options';
import {useAdminLino} from '../../lib/admin-ui';
import {linoCut as vLinoCut} from '../../lib/admin-material';
const modern=useAdminLino(),menu=ref<HTMLElement|null>(null);
const props = defineProps<{ date: string; selected: string }>();
const emit = defineEmits<{ select: [value: string]; close: [] }>();
const options = computed(() => repeatMenuOptions(props.date));
onMounted(()=>{if(modern)nextTick(()=>menu.value?.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus());});
function key(event:KeyboardEvent){if(event.key==='Escape'){event.stopPropagation();emit('close');return;}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const all=[...menu.value?.querySelectorAll<HTMLButtonElement>('button')??[]];const current=all.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==='Home'?0:event.key==='End'?all.length-1:(current+(event.key==='ArrowDown'?1:-1)+all.length)%all.length;all[next]?.focus();}
</script>
<template>
  <div v-if="modern" ref="menu" v-lino-cut="'plate'" class="repeat-menu" data-slot="dropdown-menu-content" role="listbox" aria-label="Варианты повтора" @keydown="key"><button v-for="option in options" :key="option" type="button" role="option" data-slot="dropdown-menu-radio-item" :data-state="selected===option?'checked':'unchecked'" :aria-selected="selected===option" @click="emit('select',option)">{{ option }}</button></div>
  <div v-else class="repeat-menu" role="listbox" aria-label="Варианты повтора" @keydown.esc="emit('close')">
    <button v-for="(option,index) in options" :key="option" class="repeat-option" :class="{ 'is-current': selected === option || (index === 0 && selected === 'Не повторять'), 'is-custom': index === 6 }" type="button" role="option" :aria-selected="selected === option" @click="emit('select',option)">{{ option }}</button>
  </div>
</template>
<style scoped>
.repeat-menu { display: flex; flex-direction: column; width: 376px; max-width: 100%; border: 2px solid var(--border-texture); background: var(--bg-surface); box-shadow: 0 8px 24px rgb(0 0 0 / .12); }
.repeat-option { display: flex; align-items: center; width: 100%; height: 43px; border: 0; padding: 0 16px; background: var(--bg-surface); color: var(--text-primary); font-family: var(--font-body-family); font-size: 16px; line-height: 19px; font-weight: 400; text-align: left; cursor: pointer; }
.repeat-option:nth-child(4) { height: 39px; }
.repeat-option.is-current, .repeat-option:hover { background: var(--bg-canvas); }
.repeat-option.is-custom { height: 44px; border-top: 1px solid var(--bg-canvas); font-weight: 700; }
</style>
