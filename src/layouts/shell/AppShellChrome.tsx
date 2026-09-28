import React, { useEffect } from 'react';
import { AppShellSidebar } from './AppShellSidebar';
import { logDevMount } from '@/lib/devMountTiming';

/** Chrome persistente: sidebar desktop (header é irmão na coluna principal). */
export const AppShellChromeSidebar = React.memo(function AppShellChromeSidebar() {
  useEffect(() => {
    logDevMount('Sidebar');
  }, []);

  return (
    <div className="hidden md:block">
      <AppShellSidebar />
    </div>
  );
});
