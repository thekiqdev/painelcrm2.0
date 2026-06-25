import { useEffect } from 'react';
import { HeaderRealtimeBridge } from '@/components/layout/HeaderRealtimeBridge';
import { logDevMount } from '@/lib/devMountTiming';

/** Bridges realtime globais — separados do chrome visual. */
export default function AppShellRealtime() {
  useEffect(() => {
    logDevMount('AppShellRealtime');
  }, []);

  return <HeaderRealtimeBridge />;
}
