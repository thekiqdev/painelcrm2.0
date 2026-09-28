type PendingClient = {
  type: 'client';
  clientId: string;
  resolve: (id: string | null) => void;
};

type PendingLead = {
  type: 'lead';
  leadId: string;
  options?: { createIfMissing?: boolean };
  resolve: (id: string | null) => void;
};

type PendingOpen = {
  type: 'conversation';
  conversationId: string;
};

type PendingItem = PendingClient | PendingLead | PendingOpen;

const queue: PendingItem[] = [];

export function enqueueFloatingChatClient(clientId: string): Promise<string | null> {
  return new Promise((resolve) => {
    queue.push({ type: 'client', clientId, resolve });
  });
}

export function enqueueFloatingChatLead(
  leadId: string,
  options?: { createIfMissing?: boolean },
): Promise<string | null> {
  return new Promise((resolve) => {
    queue.push({ type: 'lead', leadId, options, resolve });
  });
}

export function enqueueFloatingConversation(conversationId: string): void {
  queue.push({ type: 'conversation', conversationId });
}

export async function flushFloatingChatPending(
  openChatForClient: (clientId: string) => Promise<string | null>,
  openChatForLead: (
    leadId: string,
    options?: { createIfMissing?: boolean },
  ) => Promise<string | null>,
  openOrFocusConversation: (conversationId: string) => void,
): Promise<void> {
  const items = queue.splice(0, queue.length);
  for (const item of items) {
    if (item.type === 'client') {
      item.resolve(await openChatForClient(item.clientId));
    } else if (item.type === 'lead') {
      item.resolve(await openChatForLead(item.leadId, item.options));
    } else {
      openOrFocusConversation(item.conversationId);
    }
  }
}
