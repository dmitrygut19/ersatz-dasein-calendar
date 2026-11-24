<script setup lang="ts">
import {onBeforeUnmount,onMounted,ref} from 'vue';
import {useAdminLino} from '../../lib/admin-ui';
import {linoCut as vLinoCut} from '../../lib/admin-material';
import {linoSurface as vLinoSurface} from '../../lib/lino-card-frame';
const props=defineProps<{label:string;classes:Record<string,boolean>;textured?:boolean}>();
const emit=defineEmits<{close:[]}>();const modern=useAdminLino(),dialog=ref<HTMLDialogElement|null>(null);
onMounted(()=>{if(modern)dialog.value?.showModal();});
onBeforeUnmount(()=>dialog.value?.close());
function backdrop(event:MouseEvent){const element=dialog.value;if(!element||event.target!==element)return;const rect=element.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)emit('close');}
</script>
<template>
  <dialog v-if="modern" ref="dialog" v-lino-cut="'plate'" class="admin-overlay lino-dialog" :class="classes" :aria-label="label" data-state="open" @cancel.prevent="emit('close')" @keydown.esc.stop.prevent="emit('close')" @click="backdrop"><div class="admin-dialog-scroll"><slot/></div></dialog>
  <div v-else class="modal-backdrop" @click.self="emit('close')"><div v-lino-surface="Boolean(textured)" class="admin-overlay" :class="classes" role="dialog" aria-modal="true" :aria-label="label" tabindex="-1"><slot/></div></div>
</template>
