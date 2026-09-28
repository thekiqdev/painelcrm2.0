/**
 * Liga o cartão do Kanban (coluna com modelo) à criação de proposta no Chat.
 * Evita estado React frágil entre navegações.
 */
const STORAGE_KEY = 'painelcrm_kanban_proposal_col_ctx_v1';

export type KanbanProposalColumnContextPayload = {
  conversationId: string;
  boardId: string;
  columnId: string;
  /** Se true, o Chat abre o painel lateral de proposta após selecionar a conversa. */
  autoOpenProposal?: boolean;
};

export function setKanbanProposalColumnContext(payload: KanbanProposalColumnContextPayload): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, t: Date.now() }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function peekKanbanProposalColumnContext(): KanbanProposalColumnContextPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as KanbanProposalColumnContextPayload & { t?: number };
    if (!o?.conversationId || !o.boardId || !o.columnId) return null;
    return {
      conversationId: o.conversationId,
      boardId: o.boardId,
      columnId: o.columnId,
      autoOpenProposal: o.autoOpenProposal === true,
    };
  } catch {
    return null;
  }
}

/**
 * Lê e remove o contexto se o `conversationId` coincidir (uso único).
 */
export function consumeKanbanProposalColumnContextIfMatch(conversationId: string): KanbanProposalColumnContextPayload | null {
  const peeked = peekKanbanProposalColumnContext();
  if (!peeked || peeked.conversationId !== conversationId) return null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return peeked;
}
