/**
 * Sprint 4 / Phase 10H — CRM detail é projeção; vínculo SoT = Conversation.leadId/client_id.
 */

export type CrmLinkKind = 'none' | 'client' | 'lead';

export type CrmDetailEntity = { id?: string | null } | null | undefined;

export type ReconcileCrmDetailInput = {
  conversationClientId: string | null | undefined;
  conversationLeadId: string | null | undefined;
  currentClient: CrmDetailEntity;
  currentLead: CrmDetailEntity;
};

export type ReconcileCrmDetailResult = {
  linkKind: CrmLinkKind;
  /** Projeção alinhada ao SoT (mismatches zeraos). */
  nextClient: CrmDetailEntity;
  nextLead: CrmDetailEntity;
  shouldFetchProfile: boolean;
  clearedMismatch: boolean;
};

export function resolveCrmLinkKind(
  clientId: string | null | undefined,
  leadId: string | null | undefined,
): CrmLinkKind {
  if (clientId) return 'client';
  if (leadId) return 'lead';
  return 'none';
}

/**
 * Alinha detalhe local/RQ ao vínculo da Conversation Store.
 * Nunca inventa vínculo — só limpa projeção incompatível com SoT.
 */
export function reconcileCrmDetailWithConversationLink(
  input: ReconcileCrmDetailInput,
): ReconcileCrmDetailResult {
  const clientId = input.conversationClientId ?? null;
  const leadId = input.conversationLeadId ?? null;
  const linkKind = resolveCrmLinkKind(clientId, leadId);

  if (linkKind === 'none') {
    const cleared = Boolean(input.currentClient || input.currentLead);
    return {
      linkKind,
      nextClient: null,
      nextLead: null,
      shouldFetchProfile: false,
      clearedMismatch: cleared,
    };
  }

  let nextClient = input.currentClient ?? null;
  let nextLead = input.currentLead ?? null;
  let clearedMismatch = false;

  if (linkKind === 'client') {
    if (nextLead) {
      nextLead = null;
      clearedMismatch = true;
    }
    const id = nextClient && typeof nextClient === 'object' ? String(nextClient.id ?? '') : '';
    if (id && clientId && id !== clientId) {
      nextClient = null;
      clearedMismatch = true;
    }
  } else {
    if (nextClient) {
      nextClient = null;
      clearedMismatch = true;
    }
    const id = nextLead && typeof nextLead === 'object' ? String(nextLead.id ?? '') : '';
    if (id && leadId && id !== leadId) {
      nextLead = null;
      clearedMismatch = true;
    }
  }

  return {
    linkKind,
    nextClient,
    nextLead,
    shouldFetchProfile: true,
    clearedMismatch,
  };
}

/** Query key compartilhada Chat Float — muda quando o SoT de vínculo muda. */
export function conversationCrmProfileQueryKey(
  conversationId: string,
  clientId: string | null | undefined,
  leadId: string | null | undefined,
): readonly [
  'floating-chat',
  'conversation-crm-profile',
  string,
  string | null,
  string | null,
] {
  return [
    'floating-chat',
    'conversation-crm-profile',
    conversationId,
    clientId ?? null,
    leadId ?? null,
  ];
}
