import { createContext, useContext, useState, type RefObject } from 'react';

type GlobalSearchSlotContextValue = {
  slotRef: RefObject<HTMLDivElement | null>;
  overlayReady: boolean;
  setOverlayReady: (ready: boolean) => void;
  openCommandOnMount: boolean;
  requestOpenCommand: () => void;
  clearOpenCommandOnMount: () => void;
};

const GlobalSearchSlotContext = createContext<GlobalSearchSlotContextValue | null>(null);

export function GlobalSearchSlotProvider({
  slotRef,
  children,
}: {
  slotRef: RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const [overlayReady, setOverlayReady] = useState(false);
  const [openCommandOnMount, setOpenCommandOnMount] = useState(false);

  const requestOpenCommand = () => setOpenCommandOnMount(true);
  const clearOpenCommandOnMount = () => setOpenCommandOnMount(false);

  return (
    <GlobalSearchSlotContext.Provider
      value={{
        slotRef,
        overlayReady,
        setOverlayReady,
        openCommandOnMount,
        requestOpenCommand,
        clearOpenCommandOnMount,
      }}
    >
      {children}
    </GlobalSearchSlotContext.Provider>
  );
}

export function useGlobalSearchSlot(): GlobalSearchSlotContextValue {
  const ctx = useContext(GlobalSearchSlotContext);
  if (!ctx) {
    throw new Error('useGlobalSearchSlot must be used within GlobalSearchSlotProvider');
  }
  return ctx;
}
