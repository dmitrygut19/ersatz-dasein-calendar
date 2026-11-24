declare module 'lino-ui/nslice' {
  export function mountCut(element: HTMLElement, baked: unknown): () => void;
}
declare module 'lino-ui' {
  export function cut(kind: 'plate' | 'tag' | 'chip' | 'rule'): (element: HTMLElement) => () => void;
}
declare module 'lino-ui/icon' {
  export function icon(name:string, className?:string):string;
  export function registerIcons(icons:Record<string,unknown>):void;
}
declare module 'lino-ui/rough';
declare module 'lino-ui/sounds' {
  export const SOUNDS:string[];
  export function enableInterfaceSounds():void;
  export function playSound(name:string):void;
  export function isMuted():boolean;
  export function setMuted(value:boolean):void;
}
