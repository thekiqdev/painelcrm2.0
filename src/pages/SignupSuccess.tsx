import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadPublicTrackingSettings } from '@/hooks/useMetaPixelTracking';
import { initMetaPixel, trackMetaCompleteRegistration, trackMetaLead } from '@/lib/metaPixel';

const SESSION_COMPLETE_KEY = 'meta_complete_registration_fired';
const SESSION_LEAD_KEY = 'meta_lead_fired';

export default function SignupSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const nextPath =
    (location.state as { next?: string } | null)?.next?.trim() || '/dashboard';

  useEffect(() => {
    let cancelled = false;
    void loadPublicTrackingSettings().then((settings) => {
      if (cancelled || !settings?.meta_pixel_enabled || !settings.meta_pixel_id) return;
      initMetaPixel(settings.meta_pixel_id);
      if (settings.meta_track_lead && sessionStorage.getItem(SESSION_LEAD_KEY) !== 'true') {
        trackMetaLead();
        sessionStorage.setItem(SESSION_LEAD_KEY, 'true');
      }
      if (
        settings.meta_track_complete_registration &&
        sessionStorage.getItem(SESSION_COMPLETE_KEY) !== 'true'
      ) {
        trackMetaCompleteRegistration();
        sessionStorage.setItem(SESSION_COMPLETE_KEY, 'true');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      navigate(nextPath, { replace: true });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [navigate, nextPath]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-lg border-border bg-card">
        <CardHeader>
          <CardTitle>Conta criada com sucesso</CardTitle>
          <CardDescription>Estamos preparando seu painel…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Em instantes você será redirecionado automaticamente.
          </p>
          <Button className="w-full" onClick={() => navigate(nextPath, { replace: true })}>
            Ir para o dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
