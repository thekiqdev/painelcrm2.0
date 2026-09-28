import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { apiClient } from '@/integrations/api/client';
import { captureMarketingAttributionFromLocation } from '@/lib/marketingAttribution';
import { initMetaPixel, trackMetaPageView } from '@/lib/metaPixel';
import { isPublicMarketingPath } from '@/lib/metaPixelPublicPaths';

export type PublicTrackingSettings = {
  meta_pixel_enabled: boolean;
  meta_pixel_id: string | null;
  meta_track_page_view: boolean;
  meta_track_lead: boolean;
  meta_track_complete_registration: boolean;
};

let cachedSettings: PublicTrackingSettings | null = null;
let settingsPromise: Promise<PublicTrackingSettings | null> | null = null;

export async function loadPublicTrackingSettings(force = false): Promise<PublicTrackingSettings | null> {
  if (!force && cachedSettings) return cachedSettings;
  if (!force && settingsPromise) return settingsPromise;
  settingsPromise = apiClient
    .get<PublicTrackingSettings>('/api/public/tracking-settings')
    .then((res) => {
      if (res.error || !res.data) return null;
      cachedSettings = res.data;
      return res.data;
    })
    .catch(() => null);
  return settingsPromise;
}

export function useMetaPixelTracking(): void {
  const location = useLocation();
  const lastTrackedRef = useRef<string | null>(null);

  useEffect(() => {
    captureMarketingAttributionFromLocation(location.pathname, location.search);
  }, [location.pathname, location.search]);

  useEffect(() => {
    let cancelled = false;
    const routeKey = `${location.pathname}${location.search}`;
    if (!isPublicMarketingPath(location.pathname)) return;

    void loadPublicTrackingSettings().then((settings) => {
      if (cancelled || !settings?.meta_pixel_enabled || !settings.meta_pixel_id) return;
      initMetaPixel(settings.meta_pixel_id);
      if (!settings.meta_track_page_view) return;
      if (lastTrackedRef.current === routeKey) return;
      lastTrackedRef.current = routeKey;
      trackMetaPageView();
    });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);
}
