import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

// Popovers escape clipping/stacking contexts while remaining descendants of the
// active native dialog. Public-calendar menus do not opt into this adapter.
export function useAdminDropdown(anchor:Ref<HTMLElement|null>,menu:Ref<HTMLElement|null>,open:Ref<boolean>,enabled:boolean,ready:()=>void) {
  const target=ref<HTMLElement|string>('body');
  function close(restore=false){open.value=false;if(restore)anchor.value?.focus();}
  function position(){
    if(!enabled||!open.value||!anchor.value||!menu.value)return;
    const rect=anchor.value.getBoundingClientRect(),el=menu.value;
    const tokens=getComputedStyle(anchor.value),pad=parseFloat(tokens.getPropertyValue('--space-2'))||8,gap=parseFloat(tokens.getPropertyValue('--space-1'))||4;
    const viewport=window.visualViewport,top=viewport?.offsetTop??0,left=viewport?.offsetLeft??0,width=viewport?.width??innerWidth,height=viewport?.height??innerHeight;
    if(rect.bottom<top||rect.top>top+height){close();return;}
    const menuWidth=Math.min(rect.width,width-2*pad);
    el.style.width=menuWidth+'px';
    const below=top+height-rect.bottom-pad-gap,above=rect.top-top-pad-gap;
    const desired=Math.min(el.scrollHeight,height-2*pad);
    const up=below<desired&&above>below,available=Math.max(0,up?above:below);
    el.style.maxHeight=available+'px';
    el.style.left=Math.max(left+pad,Math.min(rect.left,left+width-pad-menuWidth))+'px';
    el.style.top=(up?Math.max(top+pad,rect.top-gap-Math.min(desired,available)):rect.bottom+gap)+'px';
    el.dataset.side=up?'top':'bottom';
  }
  function outside(event:PointerEvent){if(open.value&&!anchor.value?.contains(event.target as Node)&&!menu.value?.contains(event.target as Node))close();}
  function key(event:KeyboardEvent){if(!open.value)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}else if(event.key==='Tab')close(true);}
  function other(event:Event){if(open.value&&(event as CustomEvent).detail!==menu.value)close();}
  function modal(event:Event){if(event.target instanceof HTMLDialogElement&&event.target.open&&!event.target.contains(anchor.value))close();}
  let observer:ResizeObserver|undefined;
  watch(open,async value=>{
    if(!enabled)return;
    if(value){
      target.value=anchor.value?.closest<HTMLElement>('dialog[open]')??anchor.value?.closest<HTMLElement>('.admin-shell')??document.body;
      await nextTick();if(!open.value||!menu.value)return;
      document.dispatchEvent(new CustomEvent('admin-menu-open',{detail:menu.value}));
      menu.value.showPopover();position();ready();
      observer=new ResizeObserver(position);if(anchor.value)observer.observe(anchor.value);
    }else{observer?.disconnect();menu.value?.hidePopover();}
  },{flush:'post'});
  onMounted(()=>{if(!enabled)return;document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);document.addEventListener('admin-menu-open',other);document.addEventListener('toggle',modal,true);window.addEventListener('scroll',position,true);window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);});
  onBeforeUnmount(()=>{observer?.disconnect();if(!enabled)return;document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);document.removeEventListener('admin-menu-open',other);document.removeEventListener('toggle',modal,true);window.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);window.visualViewport?.removeEventListener('resize',position);window.visualViewport?.removeEventListener('scroll',position);});
  return {target,position};
}
