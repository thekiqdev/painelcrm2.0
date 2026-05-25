import { useEffect } from 'react';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { useAuth } from '@/contexts/AuthContext';
import { registerChatCacheSession, queryClient } from '@/lib/queryClient';
import {
  buildChatPersistBuster,
  CHAT_PERSIST_MAX_AGE_MS,
  createChatPersister,
  isChatPersistCacheEnabled,
  registerActiveChatPersistSession,
  shouldPersistChatQueryKey,
} from '@/lib/chatPersistentCache';
import { chatRouteMarkIndexedDbRestoreDone } from '@/lib/chatRouteTiming';

/**
 * Hidrata/persiste cache React Query do chat (IndexedDB) por tenant+user.
 * Não bloqueia render — restore em background (CACHE → REVALIDATE).
 */
export function ChatQueryPersistBridge() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    const tenantId = user.tenant_id ?? '__owner__';
    registerChatCacheSession(tenantId, user.id);
  }, [user?.tenant_id, user?.id]);

  useEffect(() => {
    if (!isChatPersistCacheEnabled() || !user?.id) return;

    const tenantId = user.tenant_id ?? '__owner__';
    const userId = user.id;
    registerActiveChatPersistSession(tenantId, userId);

    const persister = createChatPersister(tenantId, userId);
    const [unsubscribe, restorePromise] = persistQueryClient({
      queryClient,
      persister,
      maxAge: CHAT_PERSIST_MAX_AGE_MS,
      buster: buildChatPersistBuster(tenantId, userId),
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => {
          if (query.state.status !== 'success') return false;
          return shouldPersistChatQueryKey(query.queryKey);
        },
      },
    });

    void restorePromise
      .then(() => {
        chatRouteMarkIndexedDbRestoreDone();
      })
      .catch(() => {
        /* restore falhou — app segue com fetch normal */
      });

    return () => {
      unsubscribe();
    };
  }, [user?.tenant_id, user?.id]);

  return null;
}
