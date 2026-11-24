import type { ObjectDirective } from 'vue';
import { mountCut } from 'lino-ui/nslice';
import { cut } from 'lino-ui';
import surfaces from './lino-surfaces-baked.json';

const stops = new WeakMap<HTMLElement, () => void>();
const edges = new WeakMap<HTMLElement, HTMLSpanElement>();
type Surface = boolean | {kind?:'plate'|'tag'|'day'|'chip';seed?:number};
function attach(el:HTMLElement,value:Surface) {
  if (!value) return;
  const {kind='plate',seed=0} = typeof value === 'object' ? value : {};
  el.classList.add('lino-plate');
  const stop = kind === 'chip' ? cut('chip')(el) : mountCut(el, surfaces[(kind + Math.abs(seed % 3)) as keyof typeof surfaces]);
  if(kind !== 'day'){stops.set(el,stop);return;}
  // Keep the very same n-slice edge above photographs. Both contours come from
  // the mounted kit surface; evenodd subtracts the inner fill without a new cut.
  const edge=document.createElement('span');edge.className='lino-surface-edge';edge.setAttribute('aria-hidden','true');
  Object.assign(edge.style,{position:'absolute',inset:'calc(-1 * var(--cut-bleed, 0px))',background:'var(--surface-border)',zIndex:'3',pointerEvents:'none',clipPath:'inset(50%)'});
  function paintEdge(){
    const path=(name:string)=>el.style.getPropertyValue(name).trim().match(/^path\((?:evenodd,\s*)?(['"])(.*)\1\)$/)?.[2];
    const outer=path('--cut-0'),inner=path('--cut-1');
    edge.style.clipPath=outer&&inner?`path(evenodd, '${outer} ${inner}')`:'inset(50%)';
  }
  el.append(edge);edges.set(el,edge);paintEdge();
  const observer=new MutationObserver(paintEdge);observer.observe(el,{attributes:true,attributeFilter:['style']});
  stops.set(el,()=>{observer.disconnect();edge.remove();edges.delete(el);stop();});
}
export const linoSurface: ObjectDirective<HTMLElement, Surface> = {
  mounted(el, { value }) {
    attach(el,value);
  },
  updated(el, {value}) {
    if (!value) {
      // A disabled calendar directive does not own a cut attached by adminMaterial.
      if (!stops.has(el)) return;
      stops.get(el)?.();stops.delete(el);el.classList.remove('lino-plate');
      for(const property of ['--cut-0','--cut-1','--cut-bleed']) el.style.removeProperty(property);
      return;
    }
    // Vue replaces bound class lists when a day becomes selected or gains events.
    if (value) el.classList.add('lino-plate');
    const edge=edges.get(el);if(edge&&edge.parentElement!==el)el.append(edge);
    // A populated day becoming empty clears Vue's entire inline style attribute.
    // Re-observe once so the kit repaints the cuts even if its size did not change.
    if (value && !el.style.getPropertyValue('--cut-0')) {
      stops.get(el)?.();
      attach(el,value);
    }
  },
  unmounted(el) {
    stops.get(el)?.();
    stops.delete(el);
  },
};
