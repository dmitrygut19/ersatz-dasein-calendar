<script setup lang="ts">
// Vue adapter to lino's published DropdownMenu rows and cut surfaces.
import {nextTick,onBeforeUnmount,onMounted,ref,useId} from 'vue';
import {linoCut as vLinoCut} from '../../lib/admin-material';
import LinoIcon from './LinoIcon.vue';
defineProps<{nick:string;degree:string;initials:string;canLeave:boolean}>();
const emit=defineEmits<{leave:[]}>();
const root=ref<HTMLElement|null>(null),trigger=ref<HTMLButtonElement|null>(null),open=ref(false),id=useId();
async function show(){open.value=true;await nextTick();root.value?.querySelector<HTMLElement>('[role=menuitem]')?.focus();}
function close(){open.value=false;trigger.value?.focus();}
function key(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if(e.key==='Tab')open.value=false;else if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();root.value?.querySelector<HTMLElement>('[role=menuitem]')?.focus();}}
function outside(e:PointerEvent){if(!root.value?.contains(e.target as Node))open.value=false;}
onMounted(()=>document.addEventListener('pointerdown',outside));onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside));
</script>
<template>
 <div ref="root" class="profile-menu">
  <button ref="trigger" v-lino-cut="'plate'" type="button" class="profile-trigger" aria-label="Меню профиля" aria-haspopup="menu" :aria-expanded="open" :aria-controls="open?id:undefined" @click="open?close():show()" @keydown.down.prevent="show">
   <span class="profile-avatar">{{ initials }}</span><span class="profile-nick">{{ nick }}</span><span class="profile-degree">{{ degree }}</span><LinoIcon name="chevron"/>
  </button>
  <div v-if="open" :id="id" v-lino-cut="'plate'" data-slot="dropdown-menu-content" class="profile-options" role="menu" aria-label="Профиль" @keydown="key">
   <button v-if="canLeave" type="button" data-slot="dropdown-menu-item" role="menuitem" @click="close();emit('leave')">Выйти из просмотра</button>
   <span v-else role="menuitem" aria-disabled="true" tabindex="0">Градус {{ degree }}</span>
  </div>
 </div>
</template>
<style scoped>
.profile-menu{position:relative;min-width:0;width:100%;max-width:100%;}
.profile-trigger{display:flex;align-items:center;gap:var(--space-2);width:100%;min-height:var(--control-default);padding:var(--space-2);background:none;border:0;color:var(--color-text);font:500 var(--text-sm)/1.25 var(--font-display);--surface-bg:var(--color-surface);--surface-border:var(--color-border);cursor:pointer;}
.profile-avatar{display:grid;place-items:center;flex:none;width:var(--space-8);height:var(--space-8);}
.profile-nick{flex:1;min-width:0;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.profile-degree{flex:none;}
.profile-options{position:absolute;inset-inline-end:0;top:calc(100% + var(--space-1));z-index:30;max-width:100%;width:max-content;}
.profile-options button{border:0;background:none;color:inherit;cursor:pointer;}
.profile-trigger:focus-visible,.profile-options :focus-visible{outline:var(--focus-ring);outline-offset:var(--focus-offset);}
</style>
