import { Suspense, lazy, useEffect, useRef } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TenantBrandProvider } from '@/contexts/TenantBrandContext';
import { MobileShellChromeProvider } from '@/contexts/MobileShellChromeContext';
import { FloatingChatDeferred } from '@/features/floating-chat';
import { markShellReady } from '@/lib/devPerfMarks';
import { ChatNavUnreadScope } from './ChatNavUnreadScope';
import { AppShellChromeSidebar } from './AppShellChrome';
import { AppShellHeader } from './AppShellHeader';
import { AppShellMainColumn } from './AppShellMainColumn';
import AppShellOverlays from './AppShellOverlays';
import { SIDEBAR_PROVIDER_STYLE } from './shellConstants';
import { GlobalSearchSlotProvider } from './overlays/GlobalSearchSlotContext';

const AppShellRealtime = lazy(() => import('./AppShellRealtime'));

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Shell estrutural do CRM — layout, chrome, outlet.
 * Overlays e realtime pesados ficam fora do critical path.
 */
export default function AppShell({ children }: AppShellProps) {
  const searchSlotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    markShellReady('AppShell');
  }, []);

  return (
    <FloatingChatDeferred>
      <TenantBrandProvider>
        <GlobalSearchSlotProvider slotRef={searchSlotRef}>
          <ChatNavUnreadScope>
            <SidebarProvider className="min-w-0" style={SIDEBAR_PROVIDER_STYLE}>
              <div className="flex min-h-[100dvh] min-h-screen w-full min-w-0">
                <AppShellChromeSidebar />
                <MobileShellChromeProvider>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <AppShellHeader />
                    <AppShellMainColumn>{children}</AppShellMainColumn>
                  </div>
                </MobileShellChromeProvider>
              </div>
              <Suspense fallback={null}>
                <AppShellRealtime />
              </Suspense>
              <AppShellOverlays />
            </SidebarProvider>
          </ChatNavUnreadScope>
        </GlobalSearchSlotProvider>
      </TenantBrandProvider>
    </FloatingChatDeferred>
  );
}
