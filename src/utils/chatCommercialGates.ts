import type { PermissionCatalogKey } from '@/permissions/permissionCatalog';

export const CHAT_COMMERCIAL_PERM_DENIED = 'Seu perfil não tem permissão para esta ação.';

/** Combinações usadas no Chat / Floating para CTAs comerciais (alinhado ao catálogo granular). */
export function chatCommercialGates(hasPermissionKey: (key: PermissionCatalogKey) => boolean) {
  return {
    permDenied: CHAT_COMMERCIAL_PERM_DENIED,
    canConvertLeadToClient:
      hasPermissionKey('leads.convert_to_client') && hasPermissionKey('clients.create'),
    canCreateClientFromChat: hasPermissionKey('clients.create'),
    canCreateLeadFromChat: hasPermissionKey('leads.create'),
    canViewClientNav: hasPermissionKey('clients.view'),
    canViewLeadNav: hasPermissionKey('leads.view'),
    canCreateProposalFromChatFull:
      hasPermissionKey('chat.create_proposal_from_chat') && hasPermissionKey('proposals.create'),
    canCreateContractFromChatFull:
      hasPermissionKey('chat.create_contract_from_chat') && hasPermissionKey('contracts.create'),
    canCreateInvoiceFromChatFull:
      hasPermissionKey('chat.create_invoice_from_chat') && hasPermissionKey('billing.create_invoice'),
  };
}
