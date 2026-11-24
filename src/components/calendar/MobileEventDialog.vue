<script setup lang="ts">
import {nextTick,onBeforeUnmount,onMounted,onUpdated,ref,watch} from 'vue';
const props=defineProps<{active:boolean;controlsId:string;contentKey?:string}>();
const emit=defineEmits<{close:[]}>();
const dialog=ref<HTMLDialogElement|null>(null);
const expanded=ref(false);
let startHeight=0,startOffset=0,maxHeight=0,moveThreshold=0,snapThreshold=0;
let captureTarget:HTMLElement|null=null;
let pointerId:number|null=null,startY=0,moved=false,suppressClick=false,disposed=false;
let closeAnimation:Animation|undefined;
const historyKey='calendarEventDialog';
let token='',closing=false,returnFocus:HTMLElement|null=null;
let scrollRestoration:ScrollRestoration='auto';
let savedScroll={x:0,y:0},restoreBody:(()=>void)|undefined;
function ownsHistory(){return token && history.state?.[historyKey]===token;}
function restore(){
  releasePointer();
  dialog.value?.close();
  restoreBody?.();restoreBody=undefined;
  returnFocus?.focus({preventScroll:true});
  returnFocus=null;
}
function requestClose(){
  if(closing)return;
  if(ownsHistory()){closing=true;history.back();}
  else emit('close');
}
defineExpose({requestClose});
async function onPopState(){
  if(!token)return;
  token='';closing=true;
  await animateClose();
  if(disposed)return;
  restore();emit('close');
  closing=false;
  finishNavigation();
}
async function animateClose(){
  const element=dialog.value;
  if(!element?.open || window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const duration=getComputedStyle(element).getPropertyValue('--dur').trim();
  const milliseconds=parseFloat(duration)*(duration.endsWith('ms')?1:1000);
  const transform=getComputedStyle(element).transform;
  releasePointer();
  closeAnimation=element.animate([{transform},{transform:'translateY(100%)'}],
    {duration:Number.isFinite(milliseconds)?milliseconds:0,easing:getComputedStyle(element).getPropertyValue('--ease-out').trim()||'ease-out',fill:'forwards'});
  await closeAnimation.finished.catch(()=>{});
}
function releasePointer(){
  const id=pointerId,target=captureTarget;
  pointerId=null;captureTarget=null;
  if(id!==null && target?.hasPointerCapture(id))target.releasePointerCapture(id);
}
function settle(value=expanded.value){
  const element=dialog.value;
  if(!element)return;
  // Commit the dragged geometry before enabling the release transition.
  void element.offsetHeight;
  expanded.value=value;
  element.classList.toggle('uc-sheet-expanded',value);
  element.classList.remove('uc-sheet-dragging');
  element.style.removeProperty('height');
  element.style.removeProperty('transform');
}
function setExpanded(value:boolean){if(!closing && pointerId===null)settle(value);}
function startDrag(event:PointerEvent){
  const element=dialog.value;
  if(!element || closing || pointerId!==null || !event.isPrimary || event.button!==0)return;
  const bounds=element.getBoundingClientRect(),style=getComputedStyle(element);
  startHeight=bounds.height;
  startOffset=new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform).m42;
  moveThreshold=parseFloat(style.getPropertyValue('--space-1'));
  snapThreshold=parseFloat(style.getPropertyValue('--space-12'));
  // Freeze the rendered position, including an interrupted opening/settling animation.
  element.classList.add('uc-sheet-dragging');
  element.style.animation='none';
  element.style.height='100dvh';
  maxHeight=element.getBoundingClientRect().height;
  element.style.height=`${startHeight}px`;
  element.style.transform=`translateY(${startOffset}px)`;
  pointerId=event.pointerId;startY=event.clientY;moved=false;suppressClick=false;
  captureTarget=event.currentTarget as HTMLElement;
  captureTarget.setPointerCapture(event.pointerId);
}
function moveDrag(event:PointerEvent){
  if(event.pointerId!==pointerId || !dialog.value)return;
  const delta=event.clientY-startY;
  if(Math.abs(delta)>moveThreshold)moved=true;
  // No Vue render or layout/style reads on pointermove. Content scrolling stays native.
  const offset=startOffset+delta;
  dialog.value.style.height=`${Math.min(maxHeight,startHeight-Math.min(0,offset))}px`;
  dialog.value.style.transform=`translateY(${Math.max(0,offset)}px)`;
}
function endDrag(event:PointerEvent,cancelled=false){
  if(event.pointerId!==pointerId)return;
  if(!cancelled)moveDrag(event);
  const delta=event.clientY-startY;
  releasePointer();suppressClick=moved;
  if(!cancelled && delta < -snapThreshold)settle(true);
  else if(!cancelled && delta > snapThreshold){if(expanded.value)settle(false);else requestClose();}
  else settle();
}
function onHandleClick(){suppressClick=false;}
function onDialogClick(event:MouseEvent){
  // Releasing over content after the handle moved can retarget click to dialog.
  if(event.target!==dialog.value)return;
  if(!suppressClick)requestClose();
  suppressClick=false;
}
function finishNavigation(){
  // Browsers restore an entry's scroll after dispatching popstate.
  // Keep restoration manual until that navigation has completed.
  setTimeout(()=>{window.scrollTo(savedScroll.x,savedScroll.y);history.scrollRestoration=scrollRestoration;},0);
}
function trapTab(event:KeyboardEvent){
  if(event.key!=='Tab')return;
  const controls=Array.from(dialog.value?.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]')??[])
    .filter(element=>element.tabIndex>=0&&!element.matches(':disabled')&&!element.closest('[inert]')&&element.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(!first){event.preventDefault();dialog.value?.focus();return;}
  if(event.shiftKey && (document.activeElement===first || !controls.includes(document.activeElement as HTMLElement))){event.preventDefault();last?.focus();}
  else if(!event.shiftKey && (document.activeElement===last || !controls.includes(document.activeElement as HTMLElement))){event.preventDefault();first.focus();}
}
async function open(){
  await nextTick();
  if(!props.active || !dialog.value || dialog.value.open)return;
  expanded.value=false;closeAnimation?.cancel();
  releasePointer();
  dialog.value.classList.remove('uc-sheet-dragging');
  dialog.value.style.removeProperty('height');dialog.value.style.removeProperty('transform');dialog.value.style.removeProperty('animation');
  returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  savedScroll={x:window.scrollX,y:window.scrollY};
  const body=document.body;
  const properties=['position','top','left','width','overflow'] as const;
  const previous=properties.map(name=>[name,body.style.getPropertyValue(name),body.style.getPropertyPriority(name)]);
  body.style.position='fixed';body.style.top=`-${savedScroll.y}px`;body.style.left=`-${savedScroll.x}px`;body.style.width='100%';body.style.overflow='hidden';
  restoreBody=()=>{
    for(const [name,value,priority] of previous) value?body.style.setProperty(name,value,priority):body.style.removeProperty(name);
    window.scrollTo(savedScroll.x,savedScroll.y);
  };
  token=crypto.randomUUID();closing=false;
  scrollRestoration=history.scrollRestoration;history.scrollRestoration='manual';
  history.pushState({...history.state,[historyKey]:token},'');
  dialog.value.showModal();
  dialog.value.querySelector<HTMLElement>('.uc-sheet-handle')?.focus({preventScroll:true});
}
watch(()=>props.active,active=>{
  if(active)void open();
  else {if(ownsHistory())requestClose();restore();}
});
watch(()=>props.contentKey,async()=>{
  await nextTick();
  const scroll=dialog.value?.querySelector('.uc-mobile-dialog-scroll');
  if(scroll)scroll.scrollTop=0;
});
onMounted(()=>{window.addEventListener('popstate',onPopState);if(props.active)void open();});
onUpdated(()=>{
  // Switching the day's event replaces the keyed card and its focused pager.
  const element=dialog.value;
  if(element?.open && !closing && !element.contains(document.activeElement))element.querySelector<HTMLElement>('.uc-sheet-handle')?.focus({preventScroll:true});
});
onBeforeUnmount(()=>{
  disposed=true;closeAnimation?.cancel();
  window.removeEventListener('popstate',onPopState);
  if(ownsHistory()){
    window.addEventListener('popstate',finishNavigation,{once:true});
    if(!closing)history.back();
  }else if(token || restoreBody)history.scrollRestoration=scrollRestoration;
  token='';restore();
});
</script>
<template>
 <dialog ref="dialog" class="uc-mobile-dialog" :class="{'uc-sheet-expanded':expanded}" aria-label="Карточка события" @cancel.prevent="requestClose" @keydown.esc.stop.prevent="requestClose" @keydown="trapTab" @click="onDialogClick">
  <header :id="controlsId" class="uc-sheet-header">
   <button type="button" class="uc-sheet-handle" :aria-expanded="expanded" aria-label="Перетащить карточку" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag($event,true)" @lostpointercapture="endDrag($event,true)" @click="onHandleClick" @keydown.up.prevent="setExpanded(true)" @keydown.down.prevent="setExpanded(false)"><span aria-hidden="true"/></button>
  </header>
  <div v-if="$slots.navigation" class="uc-sheet-navigation"><slot name="navigation"/></div>
  <div class="uc-mobile-dialog-scroll"><slot :close="requestClose"/></div>
 </dialog>
</template>
<style scoped>
.uc-mobile-dialog{position:fixed;inset:auto 0 0;box-sizing:border-box;width:100%;max-width:none;height:auto;max-height:calc(100dvh - max(var(--space-6),env(safe-area-inset-top)));margin:0;border:0;border-radius:0;padding:0;background:var(--bg-canvas);color:var(--text-primary);overflow:hidden;transform:translateY(var(--sheet-drag,0px));transition:height var(--dur) var(--ease-out),transform var(--dur) var(--ease-out);}
.uc-mobile-dialog[open]{display:flex;flex-direction:column;animation:uc-sheet-in var(--dur) var(--ease-out);}
.uc-mobile-dialog::backdrop{background:rgb(0 0 0 / .4);}
.uc-mobile-dialog{height:min(calc(100dvh - max(var(--space-6),env(safe-area-inset-top))),calc(var(--event-detail-height) + 2 * var(--control-compact) + var(--space-2) + max(var(--space-2),env(safe-area-inset-bottom))));}
.uc-sheet-expanded{height:calc(100dvh - max(var(--space-6),env(safe-area-inset-top)));max-height:calc(100dvh - max(var(--space-6),env(safe-area-inset-top)));}
.uc-sheet-navigation{flex:none;}
.uc-sheet-dragging{transition:none;}
.uc-sheet-header{position:relative;box-sizing:border-box;flex:none;min-height:var(--control-compact);margin:0;padding:0;}
.uc-sheet-handle{display:grid;place-items:center;width:100%;height:var(--control-compact);padding:0 var(--space-12);border:0;background:none;touch-action:none;user-select:none;cursor:ns-resize;}
.uc-sheet-handle span{width:var(--space-8);height:var(--space-1);background:var(--text-secondary);}
.uc-sheet-handle:focus-visible{outline:var(--focus-ring);outline-offset:calc(-1 * var(--focus-offset));}
.uc-mobile-dialog-scroll{box-sizing:border-box;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 max(var(--space-2),env(safe-area-inset-right)) max(var(--space-2),env(safe-area-inset-bottom)) max(var(--space-2),env(safe-area-inset-left));overflow-wrap:anywhere;}
.uc-mobile-dialog :deep(.uc-card){width:100%;}
.uc-mobile-dialog-scroll{scrollbar-width:none;}
.uc-mobile-dialog-scroll::-webkit-scrollbar{display:none;}
@keyframes uc-sheet-in{from{transform:translateY(100%);}to{transform:translateY(0);}}
@media(prefers-reduced-motion:reduce){.uc-mobile-dialog,.uc-mobile-dialog[open]{animation:none;transition:none;}}
</style>
