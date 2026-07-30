import React from 'react';
import { cn } from '@/lib/utils';
import { MobileAppNavigation } from '@/components/navigation/MobileAppNavigation';
import { useMobileShellChrome } from '@/contexts/MobileShellChromeContext';
import { RequireModuleView } from '@/components/RequireModuleView';

/** Coluna principal: `main` + bottom nav. */
export const AppShellMainColumn = React.memo(function AppShellMainColumn({
  children,
}: {
  children: React.ReactNode;
}) {
  const { suppressMobileBottomNav, showMobileGlobalHeader } = useMobileShellChrome();
  return (
    <>
      <main
        className={cn(
          /* Sem overflow-x no main: clip/hidden força containing block e quebra position:sticky no documento. */
          'flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-28 md:mx-auto md:w-full md:max-w-7xl md:px-6 md:pb-6',
          suppressMobileBottomNav && 'max-md:!pb-4',
          showMobileGlobalHeader
            ? 'pt-4 md:pt-6'
            : 'max-md:pt-[max(1rem,env(safe-area-inset-top,0px))] md:pt-6',
        )}
      >
        <RequireModuleView>{children}</RequireModuleView>
      </main>
      {!suppressMobileBottomNav ? <MobileAppNavigation /> : null}
    </>
  );
});
