import { useEffect, useState } from 'react';
import { scheduleIdleTask } from '@/lib/scheduleIdleTask';
import { useMetaPixelTracking } from '@/hooks/useMetaPixelTracking';

function MetaPixelTrackingActive() {
  useMetaPixelTracking();
  return null;
}

/** Meta Pixel fora do bootstrap crítico — inicia após idle. */
export function MetaPixelTrackingBridge() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    return scheduleIdleTask(() => setActive(true), { timeout: 6000, fallbackDelay: 2000 });
  }, []);

  if (!active) return null;
  return <MetaPixelTrackingActive />;
}
