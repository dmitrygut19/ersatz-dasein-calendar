import { publicDemoEnabled } from './public-demo';
import { AsyncLocalStorage } from 'node:async_hooks';
const context = new AsyncLocalStorage<boolean>();
export const sharedCalendarConfigured = () => publicDemoEnabled() && process.env.CALENDAR_SHARED_CALENDAR === '1';
export const sharedCalendarEnabled = () => sharedCalendarConfigured() && context.getStore() === true;
export const withSharedCalendar = <T>(action: () => T): T => context.run(true, action);
