import { useMetaPixelTracking } from '@/hooks/useMetaPixelTracking';

export function MetaPixelTrackingBridge() {
  useMetaPixelTracking();
  return null;
}
