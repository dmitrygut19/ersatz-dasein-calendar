import { inject, type InjectionKey } from 'vue';
export const ADMIN_LINO: InjectionKey<boolean> = Symbol('admin-lino');
export const useAdminLino = () => inject(ADMIN_LINO, false);
