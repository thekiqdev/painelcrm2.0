/**
 * S28.1 — helpers para sessão webhook sem conversation_id (órfã).
 */
import {
  CONVERSATION_BINDING_NODE_TYPE,
  NODES_REQUIRING_CONVERSATION,
  findWebhookConversationPathGaps,
  type ChatbotFlowGraph,
} from './graphValidation.js';

export { CONVERSATION_BINDING_NODE_TYPE, NODES_REQUIRING_CONVERSATION, findWebhookConversationPathGaps };

export const CONVERSATION_REQUIRED_ERROR = 'conversation_required';

/** Ações do runner que precisam de conversation_id (WhatsApp / CRM). */
const ACTIONS_REQUIRING_CONVERSATION = new Set([
  'send_text',
  'send_media',
  'send_menu',
  'transfer_human',
  'conversation_note',
  'update_contact',
  'resolve_conversation',
  'add_tag',
  'assign_agent',
  'move_kanban',
  'kanban_add_card',
  'webhook_out',
  'lookup_invoice',
  'lookup_ticket',
  'ticket_assist_bootstrap',
  'resolve_crm_link',
  'crm_convert',
  'create_ticket',
]);

export function runtimeActionRequiresConversation(actionType: string): boolean {
  return ACTIONS_REQUIRING_CONVERSATION.has(actionType);
}

/**
 * Graph ok para POST sem conversation_id: tem webhook_in e (idealmente) ensure no caminho.
 * Em S28.1 ainda permitimos órfã mesmo sem ensure — o runner bloqueia send.
 * Esta flag documenta o critério D28.4 para S29+.
 */
export function webhookGraphSupportsOrphanSession(graph: ChatbotFlowGraph): boolean {
  const gaps = findWebhookConversationPathGaps(graph);
  return gaps.hasWebhookIn;
}
