/**
 * F4b — flags por superfície da API agregada.
 * Leitura exclusiva via Chat Migration Flag Manager.
 */
import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';
import {
  CHAT_AGGREGATED_SURFACE_TO_FLAG,
  type ChatAggregatedSurface,
} from '@/lib/chatMigrationFlags/catalog';

export type { ChatAggregatedSurface } from '@/lib/chatMigrationFlags/catalog';

export function isChatAggregatedSurfaceEnabled(surface: ChatAggregatedSurface): boolean {
  return isChatMigrationFlagEnabled(CHAT_AGGREGATED_SURFACE_TO_FLAG[surface]);
}

export function getChatAggregatedSurfaceFlags(): Readonly<Record<ChatAggregatedSurface, boolean>> {
  return {
    float: isChatAggregatedSurfaceEnabled('float'),
    lead: isChatAggregatedSurfaceEnabled('lead'),
    sidebar: isChatAggregatedSurfaceEnabled('sidebar'),
    chat: isChatAggregatedSurfaceEnabled('chat'),
  };
}
