import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useMobileShellChrome } from '@/contexts/MobileShellChromeContext';
import { AppShellHeaderActions } from './AppShellHeaderActions';
import { useGlobalSearchSlot } from './overlays/GlobalSearchSlotContext';
import { GlobalSearchBarPlaceholder } from './overlays/GlobalSearchBarPlaceholder';
import { logDevMount } from '@/lib/devMountTiming';

export const AppShellHeader = React.memo(function AppShellHeader() {
  const { showMobileGlobalHeader } = useMobileShellChrome();
  const { slotRef, overlayReady } = useGlobalSearchSlot();

  useEffect(() => {
    logDevMount('Header');
  }, []);

  return (
    <header
      className={cn(
        'relative z-[5] flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-background/95 px-4 pt-[env(safe-area-inset-top,0px)] shadow-sm backdrop-blur-sm',
        !showMobileGlobalHeader && 'max-md:hidden',
      )}
    >
      <div
        ref={slotRef}
        className="relative flex min-w-0 max-w-2xl flex-1 items-center lg:max-w-xl"
      >
        {!overlayReady ? <GlobalSearchBarPlaceholder /> : null}
      </div>
      <AppShellHeaderActions />
    </header>
  );
});
