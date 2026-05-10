import type { Location, NavigateFunction } from 'react-router-dom';

/** Estado ao abrir o perfil a partir do chat (complementar à query na URL). */
export type ClientProfileFromChatState = {
  from: 'chat';
  conversationId: string;
  externalChatId: string;
  instanceId: string;
};

/** Estado ao voltar do perfil para o chat com contexto de restauração. */
export type ChatOpenConversationState = {
  openConversationId?: string;
  openExternalChatId?: string;
  openInstanceId?: string;
};

export type ChatConversationRestoreKeys = {
  id: string;
  external_chat_id: string;
  instance_id: string;
};

export function buildClientProfileToFromChat(clientId: string, ctx: ChatConversationRestoreKeys) {
  const search = new URLSearchParams({
    from: 'chat',
    conversation: ctx.id,
    chatExternal: ctx.external_chat_id,
    chatInstance: ctx.instance_id,
  });
  return {
    pathname: `/clients/${clientId}` as const,
    search: `?${search.toString()}`,
  };
}

/** Mesmo contexto de retorno ao chat que o resumo do cliente, mas abre o hub Financeiro do CRM. */
export function buildClientFinanceHubFromChat(clientId: string, ctx: ChatConversationRestoreKeys) {
  const search = new URLSearchParams({
    from: 'chat',
    conversation: ctx.id,
    chatExternal: ctx.external_chat_id,
    chatInstance: ctx.instance_id,
  });
  return {
    pathname: `/clients/${clientId}/finance` as const,
    search: `?${search.toString()}`,
  };
}

export function buildClientProfileStateFromChat(ctx: ChatConversationRestoreKeys): ClientProfileFromChatState {
  return {
    from: 'chat',
    conversationId: ctx.id,
    externalChatId: ctx.external_chat_id,
    instanceId: ctx.instance_id,
  };
}

export type ClientProfileReturnContext = {
  fromChat: boolean;
  conversationId: string | undefined;
  externalChatId: string | undefined;
  instanceId: string | undefined;
};

export function getClientProfileReturnContext(loc: Pick<Location, 'state' | 'search'>): ClientProfileReturnContext {
  const st = loc.state as Partial<ClientProfileFromChatState> | null;
  const params = new URLSearchParams(loc.search);
  const fromChat = st?.from === 'chat' || params.get('from') === 'chat';
  const conversationId = st?.conversationId || params.get('conversation') || undefined;
  const externalChatId = st?.externalChatId || params.get('chatExternal') || undefined;
  const instanceId = st?.instanceId || params.get('chatInstance') || undefined;
  return { fromChat, conversationId, externalChatId, instanceId };
}

/**
 * Resolve qual linha da lista corresponde ao contexto salvo ao sair do chat.
 * Cobre deduplicação por external_chat_id que pode trocar o UUID interno entre loads.
 */
export function resolveRestoreConversationId(
  conversations: ChatConversationRestoreKeys[],
  pending: {
    internalId?: string;
    externalChatId?: string;
    instanceId?: string;
  }
): string | null {
  if (pending.internalId && conversations.some((c) => c.id === pending.internalId)) {
    return pending.internalId;
  }
  if (pending.externalChatId && pending.instanceId) {
    const hit = conversations.find(
      (c) => c.external_chat_id === pending.externalChatId && c.instance_id === pending.instanceId
    );
    if (hit) return hit.id;
  }
  if (pending.externalChatId) {
    const hits = conversations.filter((c) => c.external_chat_id === pending.externalChatId);
    if (hits.length === 1) return hits[0].id;
    if (hits.length > 1 && pending.instanceId) {
      const hit = hits.find((c) => c.instance_id === pending.instanceId);
      if (hit) return hit.id;
    }
    if (hits.length > 0) return hits[0].id;
  }
  return null;
}

export function navigateBackFromClientProfile(
  navigate: NavigateFunction,
  loc: Pick<Location, 'state' | 'search'>
) {
  const { fromChat, conversationId, externalChatId, instanceId } = getClientProfileReturnContext(loc);
  if (fromChat) {
    if (conversationId || externalChatId) {
      navigate('/chat', {
        state: {
          openConversationId: conversationId,
          openExternalChatId: externalChatId,
          openInstanceId: instanceId,
        } satisfies ChatOpenConversationState,
      });
    } else {
      navigate('/chat');
    }
    return;
  }
  navigate('/clients');
}
