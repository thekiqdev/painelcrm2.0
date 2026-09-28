import { isNotificationsEngineVerboseLog } from '../../config/notificationsEngineEnv.js';

export function neLogInfo(event: string, data: Record<string, unknown>): void {
  if (!isNotificationsEngineVerboseLog()) return;
  console.log(`[notifications-engine] ${event}`, JSON.stringify(data));
}

export function neLogWarn(event: string, data: Record<string, unknown>): void {
  console.warn(`[notifications-engine] ${event}`, JSON.stringify(data));
}

export function neLogError(event: string, data: Record<string, unknown>, err?: unknown): void {
  if (err) {
    console.error(`[notifications-engine] ${event}`, JSON.stringify(data), err);
  } else {
    console.error(`[notifications-engine] ${event}`, JSON.stringify(data));
  }
}
