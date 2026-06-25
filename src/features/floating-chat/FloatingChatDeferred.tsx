import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { scheduleIdleTask } from '@/lib/scheduleIdleTask';
import { FloatingChatContext } from './floatingChatContext';
import { createFloatingChatStub } from './floatingChatStub';
import { flushFloatingChatPending } from './floatingChatPending';
import { useFloatingChat } from './floatingChatContext';

const FloatingChatBundle = lazy(() => import('./FloatingChatBundle'));

type FloatingChatDeferredProps = {
  children: React.ReactNode;
};

function FloatingChatPendingFlusher() {
  const ctx = useFloatingChat();
  useEffect(() => {
    void flushFloatingChatPending(
      ctx.openChatForClient,
      ctx.openChatForLead,
      ctx.openOrFocusConversation,
    );
    // Flush único na montagem do provider real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function FloatingChatLoaded({ children }: { children: React.ReactNode }) {
  return (
    <FloatingChatBundle>
      <FloatingChatPendingFlusher />
      {children}
    </FloatingChatBundle>
  );
}

function StubShell({
  stubValue,
  children,
}: {
  stubValue: ReturnType<typeof createFloatingChatStub>;
  children: React.ReactNode;
}) {
  return (
    <FloatingChatContext.Provider value={stubValue}>{children}</FloatingChatContext.Provider>
  );
}

/**
 * Adia o bundle do chat flutuante até idle ou primeira interação,
 * mantendo stub de contexto para o header e busca global.
 */
export function FloatingChatDeferred({ children }: FloatingChatDeferredProps) {
  const [loaded, setLoaded] = useState(false);
  const armLoad = useCallback(() => setLoaded(true), []);

  const stubValue = useMemo(() => createFloatingChatStub(armLoad), [armLoad]);

  useEffect(() => {
    const cancelIdle = scheduleIdleTask(armLoad, { timeout: 5000, fallbackDelay: 2500 });
    const onInteraction = () => armLoad();
    const opts: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener('pointerdown', onInteraction, opts);
    window.addEventListener('keydown', onInteraction, opts);
    return () => {
      cancelIdle();
      window.removeEventListener('pointerdown', onInteraction);
      window.removeEventListener('keydown', onInteraction);
    };
  }, [armLoad]);

  if (!loaded) {
    return <StubShell stubValue={stubValue}>{children}</StubShell>;
  }

  return (
    <Suspense fallback={<StubShell stubValue={stubValue}>{children}</StubShell>}>
      <FloatingChatLoaded>{children}</FloatingChatLoaded>
    </Suspense>
  );
}
