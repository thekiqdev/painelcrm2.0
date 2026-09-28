import { isPlatformNotificationsVerboseLog } from '../../config/platformNotificationsEnv.js';

export function pnLogInfo(event: string, data: Record<string, unknown>): void {
  if (!isPlatformNotificationsVerboseLog()) return;
  console.log(`[platform-notifications] ${event}`, JSON.stringify(data));
}

export function pnLogWarn(event: string, data: Record<string, unknown>): void {
  console.warn(`[platform-notifications] ${event}`, JSON.stringify(data));
}
