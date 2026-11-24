import type { ObjectDirective } from 'vue';
import { cut } from 'lino-ui';

const cleanups=new WeakMap<HTMLElement,()=>void>();
// The same published cut attachment used by the Svelte kit, hosted by Vue.
export const linoCut: ObjectDirective<HTMLElement,'plate'|'chip'|'tag'|'rule'> = {
  mounted(el,{value}) { cleanups.set(el,cut(value || 'plate')(el)); },
  unmounted(el) { cleanups.get(el)?.();cleanups.delete(el); },
};

let tooltipSequence=0;
export const adminMaterial: ObjectDirective<HTMLElement,boolean> = {
  mounted(root,{value}) {
    if(!value)return;
    void import('lino-ui/rough');
    const surfaces=new Map<HTMLElement,()=>void>();
    const tooltips=new Map<HTMLElement,()=>void>();
    const mountTooltip=(el:HTMLElement)=>{
      if(tooltips.has(el))return;
      let popup:HTMLElement|null=null,stop:(()=>void)|undefined;
      const id='admin-tooltip-'+(++tooltipSequence);
      const previous=el.getAttribute('aria-describedby');
      const hide=()=>{stop?.();stop=undefined;popup?.remove();popup=null;if(previous)el.setAttribute('aria-describedby',previous);else el.removeAttribute('aria-describedby');};
      const show=()=>{
        if(popup||el.matches(':disabled'))return;
        popup=document.createElement('div');popup.className='admin-ui--lino admin-tooltip-host';
        const content=document.createElement('div');content.dataset.slot='tooltip-content';content.setAttribute('role','tooltip');content.id=id;
        content.textContent=el.getAttribute('aria-label')||el.getAttribute('title')||'';popup.append(content);
        // Keep the tooltip inside a native modal's top layer when one is open.
        (el.closest('dialog') ?? document.body).append(popup);
        stop=cut('chip')(content);el.setAttribute('aria-describedby',[previous,id].filter(Boolean).join(' '));
        const rect=el.getBoundingClientRect();const bounds=content.getBoundingClientRect();
        popup.style.left=Math.max(8,Math.min(innerWidth-bounds.width-8,rect.left+(rect.width-bounds.width)/2))+'px';
        popup.style.top=(rect.bottom+bounds.height+12<innerHeight?rect.bottom+8:Math.max(8,rect.top-bounds.height-8))+'px';
      };
      el.addEventListener('pointerenter',show);el.addEventListener('pointerleave',hide);el.addEventListener('focus',show);el.addEventListener('blur',hide);
      const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&popup){event.preventDefault();event.stopPropagation();hide();}};el.addEventListener('keydown',key);
      tooltips.set(el,()=>{hide();el.removeEventListener('pointerenter',show);el.removeEventListener('pointerleave',hide);el.removeEventListener('focus',show);el.removeEventListener('blur',hide);el.removeEventListener('keydown',key);});
    };
    const scan=()=>{
      for(const [el,stop] of surfaces)if(!root.contains(el)){stop();surfaces.delete(el);}
      for(const [el,stop] of tooltips)if(!root.contains(el)){stop();tooltips.delete(el);}
      const selectors='.admin-panel,.types-panel,.type-editor,.event-card-row,.degree-badge,.repeat-settings';
      for(const el of root.querySelectorAll<HTMLElement>(selectors)){
        if(surfaces.has(el)||el.classList.contains('lino-plate')||el.closest('.user-calendar')||el.closest('[data-admin-plain]')||(el.classList.contains('admin-panel')&&el.closest('dialog')))continue;
        const degree=el.classList.contains('degree-badge');
        el.classList.add('admin-material-surface');
        if(degree){el.classList.add('lino-tag');el.dataset.tier=String(Math.max(0,['I','II','III'].indexOf(el.dataset.degree||'')));}
        surfaces.set(el,cut(degree?'tag':'plate')(el));
      }
      for(const el of root.querySelectorAll<HTMLElement>('button[aria-label]')){
        if(el.closest('.user-calendar')||el.classList.contains('mobile-row-trigger'))continue;
        if(!el.textContent?.trim()||el.classList.contains('action-icon-button')||el.classList.contains('close-button'))mountTooltip(el);
      }
    };
    const observer=new MutationObserver(scan);observer.observe(root,{childList:true,subtree:true});scan();
    cleanups.set(root,()=>{observer.disconnect();for(const stop of surfaces.values())stop();for(const stop of tooltips.values())stop();});
  },
  unmounted(root){cleanups.get(root)?.();cleanups.delete(root);},
};
