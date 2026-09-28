import type { ChatInstance } from '@/services/chat';

export function isChatInstanceEnabledInChat(instance: ChatInstance): boolean {
  return (instance.metadata as Record<string, unknown> | null | undefined)?.enabled_in_chat !== false;
}

export function isChatInstanceConnected(instance: ChatInstance): boolean {
  const status = String(instance.status || '').toLowerCase();
  return status === 'connected' || status === 'open';
}

export function filterEnabledChatInstanceIds(instances: readonly ChatInstance[]): string[] {
  return instances.filter(isChatInstanceEnabledInChat).map((i) => i.id);
}

export function filterConnectedChatInstances(instances: readonly ChatInstance[]): ChatInstance[] {
  return instances.filter((inst) => isChatInstanceEnabledInChat(inst) && isChatInstanceConnected(inst));
}
