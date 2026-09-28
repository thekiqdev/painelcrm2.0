/**
 * @deprecated Utilizar `services/chatMigrationFlags/service.js` — flags via painel Super Admin.
 * Re-export para compatibilidade dos imports existentes em F4a.
 */
export {
  isChatAggregatedConversationsEnabled,
  isChatAggregatedApiShadowEnabled,
  isChatAggregatedDevLogEnabled,
  logChatAggregatedDev,
} from '../chatMigrationFlags/service.js';
