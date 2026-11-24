import type {ObjectDirective} from 'vue';
import {cut} from 'lino-ui';
const cleanups=new WeakMap<HTMLElement,()=>void>();
export const linoCut:ObjectDirective<HTMLElement,'plate'|'chip'|'tag'|'rule'>={
 mounted(el,{value}){cleanups.set(el,cut(value||'plate')(el));},
 unmounted(el){cleanups.get(el)?.();cleanups.delete(el);}
};
