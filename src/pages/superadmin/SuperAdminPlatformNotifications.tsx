import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { Building2, MessageCircle, Sparkles } from 'lucide-react';
import { PlatformNotificationTemplateOverrideDialog } from '@/components/superadmin/platform-notifications/PlatformNotificationTemplateOverrideDialog';
import { PlatformNotificationsCatalogTab } from '@/components/superadmin/platform-notifications/PlatformNotificationsCatalogTab';
import { PlatformNotificationsGlobalTab } from '@/components/superadmin/platform-notifications/PlatformNotificationsGlobalTab';
import { PlatformNotificationsHistoryTab } from '@/components/superadmin/platform-notifications/PlatformNotificationsHistoryTab';
import {
  CHANNEL,
  LOCALE,
  buildSampleMergeContext,
  channelLabel,
  eventTitle,
  moduleLabel,
  type CatalogEvent,
  type DeliveryRow,
  type EventDetail,
  type PlatformGlobalSettings,
} from '@/components/superadmin/platform-notifications/platformNotificationsUtils';
import SuperAdminPlatformWhatsAppPanel from './SuperAdminPlatformWhatsAppPanel';

export default function SuperAdminPlatformNotifications() {
  const [tab, setTab] = useState('whatsapp');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const [globalLoading, setGlobalLoading] = useState(true);
  const [globalSaving, setGlobalSaving] = useState(false);
  const [gMotor, setGMotor] = useState(true);
  const [gBusiness, setGBusiness] = useState(true);
  const [gWhatsapp, setGWhatsapp] = useState(true);
  const [gVerbose, setGVerbose] = useState(false);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [histStatus, setHistStatus] = useState<string>('__all__');
  const [histEvent, setHistEvent] = useState<string>('__all__');
  const [histHours, setHistHours] = useState<string>('72');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [draftBody, setDraftBody] = useState('');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftSendPix, setDraftSendPix] = useState(false);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewInvalid, setPreviewInvalid] = useState<string[] | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    const res = await apiClient.get<{ ok?: boolean; events?: CatalogEvent[] }>(
      '/api/superadmin/platform-notifications/catalog/events',
    );
    setCatalogLoading(false);
    if (res.error || !res.data?.events) {
      toast.error(res.error ?? 'Não foi possível carregar o catálogo da plataforma.');
      return;
    }
    setEvents(res.data.events);
  }, []);

  const loadGlobal = useCallback(async () => {
    setGlobalLoading(true);
    const res = await apiClient.get<PlatformGlobalSettings>(
      '/api/superadmin/platform-notifications/global-settings',
    );
    setGlobalLoading(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível carregar a configuração global.');
      return;
    }
    const d = res.data;
    setGMotor(d.platform_notifications_enabled !== false);
    setGBusiness(d.platform_notifications_business_events_enabled !== false);
    setGWhatsapp(d.platform_notifications_whatsapp_send_enabled !== false);
    setGVerbose(d.platform_notifications_verbose_log === true);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const q = new URLSearchParams();
    q.set('limit', '200');
    q.set('hours', histHours);
    if (histStatus !== '__all__') q.set('status', histStatus);
    if (histEvent !== '__all__') q.set('event_key', histEvent);
    const res = await apiClient.get<{ ok?: boolean; deliveries?: DeliveryRow[] }>(
      `/api/superadmin/platform-notifications/deliveries?${q.toString()}`,
    );
    setHistoryLoading(false);
    if (res.error || !res.data?.deliveries) {
      toast.error(res.error ?? 'Não foi possível carregar o histórico.');
      return;
    }
    setDeliveries(res.data.deliveries);
  }, [histHours, histStatus, histEvent]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadGlobal();
  }, [loadGlobal]);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [tab, loadHistory]);

  const eventOptions = useMemo(() => events.map((e) => e.event_key).sort(), [events]);

  const setEventActive = async (eventKey: string, isActive: boolean) => {
    setTogglingKey(eventKey);
    const res = await apiClient.patch<{ ok?: boolean }>(
      `/api/superadmin/platform-notifications/catalog/events/${encodeURIComponent(eventKey)}/active`,
      { is_active: isActive },
    );
    setTogglingKey(null);
    if (res.error) {
      toast.error(res.error);
      void loadCatalog();
      return;
    }
    toast.success(isActive ? 'Notificação ativada.' : 'Notificação desativada.');
    setEvents((prev) => prev.map((e) => (e.event_key === eventKey ? { ...e, is_active: isActive } : e)));
  };

  const saveGlobal = async () => {
    setGlobalSaving(true);
    const res = await apiClient.put<PlatformGlobalSettings>(
      '/api/superadmin/platform-notifications/global-settings',
      {
        platform_notifications_enabled: gMotor,
        platform_notifications_business_events_enabled: gBusiness,
        platform_notifications_whatsapp_send_enabled: gWhatsapp,
        platform_notifications_verbose_log: gVerbose,
      },
    );
    setGlobalSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Configuração global da plataforma guardada.');
    void loadGlobal();
  };

  const openEditor = async (eventKey: string) => {
    setEditorKey(eventKey);
    setEditorOpen(true);
    setDetail(null);
    setPreviewBody(null);
    setPreviewSubject(null);
    setPreviewError(null);
    setPreviewInvalid(null);
    setDetailLoading(true);
    const res = await apiClient.get<EventDetail & { ok?: boolean }>(
      `/api/superadmin/platform-notifications/catalog/events/${encodeURIComponent(eventKey)}?locale=${encodeURIComponent(LOCALE)}&channel=${encodeURIComponent(CHANNEL)}`,
    );
    setDetailLoading(false);
    if (res.error || !res.data || !res.data.event) {
      toast.error(res.error ?? 'Não foi possível carregar o modelo.');
      setEditorOpen(false);
      return;
    }
    const d = res.data;
    setDetail(d);
    const bodySrc = d.override?.body_template ?? d.system.body_template;
    const subjSrc = d.override?.subject_template ?? d.system.subject_template;
    setDraftBody(bodySrc);
    setDraftSubject(subjSrc ?? '');
    if (eventKey === 'platform.billing.charge.created') {
      setDraftSendPix(
        Boolean(d.override?.send_whatsapp_pix_copy_paste_button ?? d.system.send_whatsapp_pix_copy_paste_button),
      );
    } else {
      setDraftSendPix(false);
    }
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditorKey(null);
    setDetail(null);
  };

  const saveOverride = async () => {
    if (!editorKey) return;
    setOverrideSaving(true);
    const res = await apiClient.put<{ ok?: boolean }>('/api/superadmin/platform-notifications/template-overrides', {
      event_key: editorKey,
      channel: CHANNEL,
      locale: LOCALE,
      body_template: draftBody,
      subject_template: draftSubject.trim() === '' ? null : draftSubject,
      send_whatsapp_pix_copy_paste_button:
        editorKey === 'platform.billing.charge.created' ? draftSendPix : false,
    });
    setOverrideSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Override guardado. O template padrão do sistema não foi alterado.');
    closeEditor();
    void loadCatalog();
  };

  const restoreDefault = async () => {
    if (!editorKey) return;
    const q = new URLSearchParams({
      event_key: editorKey,
      channel: CHANNEL,
      locale: LOCALE,
    });
    setOverrideSaving(true);
    const res = await apiClient.delete<{ ok?: boolean }>(
      `/api/superadmin/platform-notifications/template-overrides?${q.toString()}`,
    );
    setOverrideSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Override removido. Volta a usar o template padrão da plataforma.');
    closeEditor();
    void loadCatalog();
  };

  const runPreview = async () => {
    if (!editorKey || !detail) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewInvalid(null);
    setPreviewBody(null);
    setPreviewSubject(null);
    const merge_context = buildSampleMergeContext(detail.event.merge_field_list ?? []);
    const res = await apiClient.post<{
      ok?: boolean;
      rendered_body?: string;
      rendered_subject?: string | null;
      error?: string;
      disallowed_placeholders?: string[];
      missing_keys?: string[];
    }>('/api/superadmin/platform-notifications/preview', {
      event_key: editorKey,
      locale: LOCALE,
      channel: CHANNEL,
      merge_context,
    });
    setPreviewLoading(false);
    if (res.error) {
      const det = res.details as
        | { disallowed_placeholders?: string[]; missing_keys?: string[] }
        | undefined;
      setPreviewError(res.error);
      const bad = [
        ...(det?.disallowed_placeholders ?? []),
        ...(det?.missing_keys?.map((k) => `falta: ${k}`) ?? []),
      ];
      setPreviewInvalid(bad.length ? bad : null);
      setPreviewBody(null);
      setPreviewSubject(null);
      return;
    }
    const data = res.data;
    if (!data?.ok) {
      setPreviewError(data?.error ?? 'Preview inválido.');
      return;
    }
    setPreviewBody(data.rendered_body ?? '');
    setPreviewSubject(data.rendered_subject ?? null);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Super Admin / <span className="text-foreground font-medium">Plataforma</span>
        </p>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="h-7 w-7 text-crm-primary shrink-0" />
          Notificações da plataforma
        </h1>
        <p className="text-muted-foreground">
          Motor transacional da <strong className="text-foreground font-medium">plataforma</strong> (eventos{' '}
          <code className="text-xs">platform.*</code>), separado do motor do tenant (CRM).
        </p>
      </div>

      <Alert className="border-border bg-card">
        <Sparkles className="h-4 w-4" />
        <AlertTitle>Domínio exclusivo da plataforma</AlertTitle>
        <AlertDescription className="text-sm">
          Estas notificações pertencem ao motor da plataforma e usam tabelas{' '}
          <code className="text-xs">platform_notification_*</code>. Não confundir com modelos legados de WhatsApp,
          templates do tenant ou o item <strong className="text-foreground">Motor de notificações</strong> no menu
          (esse controlo é o motor transacional dos <em>tenants</em>).
        </AlertDescription>
      </Alert>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-muted/80">
          <TabsTrigger value="whatsapp" className="gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="catalog">Catálogo</TabsTrigger>
          <TabsTrigger value="global">Configuração global</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp" className="space-y-4">
          <SuperAdminPlatformWhatsAppPanel />
        </TabsContent>

        <TabsContent value="catalog" className="space-y-4">
          <PlatformNotificationsCatalogTab
            events={events}
            catalogLoading={catalogLoading}
            togglingKey={togglingKey}
            onToggleEventActive={setEventActive}
            onEditEvent={openEditor}
            moduleLabel={moduleLabel}
            eventTitle={eventTitle}
            channelLabel={channelLabel}
          />
        </TabsContent>

        <TabsContent value="global" className="space-y-4">
          <PlatformNotificationsGlobalTab
            globalLoading={globalLoading}
            globalSaving={globalSaving}
            gMotor={gMotor}
            gBusiness={gBusiness}
            gWhatsapp={gWhatsapp}
            gVerbose={gVerbose}
            setGMotor={setGMotor}
            setGBusiness={setGBusiness}
            setGWhatsapp={setGWhatsapp}
            setGVerbose={setGVerbose}
            onSave={saveGlobal}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <PlatformNotificationsHistoryTab
            historyLoading={historyLoading}
            deliveries={deliveries}
            histStatus={histStatus}
            histEvent={histEvent}
            histHours={histHours}
            setHistStatus={setHistStatus}
            setHistEvent={setHistEvent}
            setHistHours={setHistHours}
            eventOptions={eventOptions}
            onRefresh={loadHistory}
            eventTitle={eventTitle}
            channelLabel={channelLabel}
          />
        </TabsContent>
      </Tabs>

      <PlatformNotificationTemplateOverrideDialog
        editorOpen={editorOpen}
        editorKey={editorKey}
        detailLoading={detailLoading}
        detail={detail}
        draftBody={draftBody}
        draftSubject={draftSubject}
        draftSendPix={draftSendPix}
        setDraftBody={setDraftBody}
        setDraftSubject={setDraftSubject}
        setDraftSendPix={setDraftSendPix}
        previewLoading={previewLoading}
        previewBody={previewBody}
        previewSubject={previewSubject}
        previewError={previewError}
        previewInvalid={previewInvalid}
        overrideSaving={overrideSaving}
        eventTitle={eventTitle}
        onClose={closeEditor}
        onSave={saveOverride}
        onRestoreDefault={restoreDefault}
        onPreview={runPreview}
      />
    </div>
  );
}
