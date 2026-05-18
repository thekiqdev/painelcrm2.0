/** Rotas de criação com contexto de cliente/lead (sem ir para listagens). */

export function newInvoiceForClientUrl(clientId: string): string {
  return `/customer-invoices/new?client_id=${encodeURIComponent(clientId)}`;
}

export function newTicketForClientUrl(clientId: string): string {
  return `/support/tickets/new?client_id=${encodeURIComponent(clientId)}`;
}

export function newTicketForLeadUrl(leadId: string): string {
  return `/support/tickets/new?lead_id=${encodeURIComponent(leadId)}`;
}

export function newContractForClientUrl(clientId: string): string {
  return `/contracts/new?clientId=${encodeURIComponent(clientId)}`;
}

export function newProjectForClientUrl(clientId: string): string {
  return `/projects/new?client_id=${encodeURIComponent(clientId)}`;
}

export function newProposalForClientUrl(clientId: string): string {
  return `/proposals/new?clientId=${encodeURIComponent(clientId)}&from=client`;
}
