import { Suspense, lazy } from 'react';
import { scheduleIdleTask } from '@/lib/scheduleIdleTask';
import { useEffect, useState } from 'react';
import { useGlobalSearchSlot } from './overlays/GlobalSearchSlotContext';

const AppShellOverlaysInner = lazy(() => import('./AppShellOverlaysInner'));

function AppShellOverlaysArmer({ onArm }: { onArm: () => void }) {
  const { requestOpenCommand } = useGlobalSearchSlot();

  useEffect(() => {
    const cancelIdle = scheduleIdleTask(onArm, { timeout: 4000, fallbackDelay: 1500 });
    const onPointer = () => onArm();
    const onKey = (e: KeyboardEvent) => {
      onArm();
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        requestOpenCommand();
      }
    };
    const opts: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener('pointerdown', onPointer, opts);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelIdle();
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onArm, requestOpenCommand]);

  return null;
}

/**
 * Overlays globais (busca, chat) — chunk separado, zero impacto no primeiro paint do shell.
 */
export default function AppShellOverlays() {
  const [armed, setArmed] = useState(false);

  return (
    <>
      {!armed ? <AppShellOverlaysArmer onArm={() => setArmed(true)} /> : null}
      {armed ? (
        <Suspense fallback={null}>
          <AppShellOverlaysInner />
        </Suspense>
      ) : null}
    </>
  );
}
