import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { Building2, History, MessageCircle, Pencil, RefreshCw, Save, Sparkles } from 'lucide-react';
import SuperAdminPlatformWhatsAppPanel from './SuperAdminPlatformWhatsAppPanel';

const LOCALE = 'pt-BR';
const CHANNEL = 'whatsapp';

type CatalogEvent = {
  id: string;
  event_key: string;
  module: string;
  description: string | null;
  default_channel: string;
  merge_field_list: string[];
  is_active: boolean;
  has_override: boolean;
};

type EventDetail = {
  event: CatalogEvent;
  system: { body_template: string; subject_template: string | null; version: number; send_whatsapp_pix_copy_paste_button?: boolean };
  override: {
    body_template: string;
    subject_template: string | null;
    send_whatsapp_pix_copy_paste_button?: boolean;
  } | null;
  effective_source: 'override' | 'system';
};

type PlatformGlobalSettings = {
  ok?: boolean;
  platform_notifications_enabled: boolean;
  platform_notifications_whatsapp_send_enabled: boolean;
  platform_notifications_verbose_log: boolean;
  platform_notifications_business_events_enabled: boolean;
  platform_notifications_pilot_target_tenant_ids: string | null;
  platform_notifications_dispatch_tenant_id: string | null;
  platform_notifications_dispatch_sender_user_id: string | null;
  platform_notifications_whatsapp_chat_instance_id: string | null;
};

type DeliveryRow = {
  id: string;
  target_tenant_id: string;
  event_key: string;
  status: string;
  channel: string;
  recipient_address: string | null;
  recipient_type: string | null;
  error_message: string | null;
  entity_type?: string;
  entity_id?: string | null;
  created_at: string;
};

const MODULE_LABELS: Record<string, string> = {
  account: 'Conta e acesso',
  billing: 'Cobrança e pagamento',
  plan: 'Plano e assinatura',
  subscription: 'Plano e assinatura',
};

const EVENT_TITLES: Record<string, string> = {
  'platform.account.created': 'Conta criada na plataforma',
  'platform.plan.activated': 'Plano ativado',
  'platform.billing.charge.created': 'Cobrança criada (SaaS)',
  'platform.billing.payment_confirmed': 'Pagamento confirmado (SaaS)',
  'platform.auth.login_link.issued': 'Link de login emitido',
};

function moduleLabel(m: string) {
  return MODULE_LABELS[m] ?? m;
}

function eventTitle(key: string) {
  return EVENT_TITLES[key] ?? key;
}

function channelLabel(ch: string) {
  if (ch === 'whatsapp') return 'WhatsApp';
  return ch;
}

function buildSampleMergeContext(fields: string[]): Record<string, string> {
  const samples: Record<string, string> = {
    tenant_name: 'Empresa Exemplo Lda',
    tenant_id: '00000000-0000-4000-8000-000000000001',
    user_name: 'Maria Silva',
    user_email: 'admin@exemplo.pt',
    plan_name: 'Plano Profissional',
    amount_display: '29,90 €',
    charge_id: 'chg_demo_001',
    payment_id: 'pay_demo_001',
    invoice_number: 'FAT-2026-001',
  };
  const o: Record<string, string> = {};
  for (const f of fields) {
    o[f] = samples[f] ?? `[exemplo: ${f}]`;
  }
  return o;
}

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
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Notificações transacionais (MVP)</CardTitle>
              <CardDescription>
                Conta, plano e cobrança SaaS. Canal atual: <strong>WhatsApp</strong>. Ative ou desative por evento;
                edite apenas <em>override</em> — o template padrão do sistema é imutável neste painel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {catalogLoading ? (
                <p className="text-sm text-muted-foreground">A carregar catálogo…</p>
              ) : (
                <div className="rounded-md border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Módulo</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Canal</TableHead>
                        <TableHead>Modelo</TableHead>
                        <TableHead className="text-center">Ativo</TableHead>
                        <TableHead className="w-[100px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((ev) => (
                        <TableRow key={ev.event_key}>
                          <TableCell className="text-sm text-foreground">{moduleLabel(ev.module)}</TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">{eventTitle(ev.event_key)}</div>
                            <div className="text-xs text-muted-foreground font-mono">{ev.event_key}</div>
                            {ev.description ? (
                              <div className="text-xs text-muted-foreground mt-0.5">{ev.description}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">{channelLabel(ev.default_channel)}</TableCell>
                          <TableCell>
                            {ev.has_override ? (
                              <Badge variant="secondary">Override</Badge>
                            ) : (
                              <Badge variant="outline">Padrão da plataforma</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={ev.is_active}
                              disabled={togglingKey === ev.event_key}
                              onCheckedChange={(v) => void setEventActive(ev.event_key, v)}
                              aria-label={`Ativar ${ev.event_key}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => void openEditor(ev.event_key)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="global" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Toggles globais do motor da plataforma</CardTitle>
              <CardDescription>
                Persistidos em <code className="text-xs">superadmin_settings</code> (chaves{' '}
                <code className="text-xs">platform_notifications_*</code>), independentes do motor do tenant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {globalLoading ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-base">Motor da plataforma ativo</Label>
                      <p className="text-sm text-muted-foreground">
                        Liga o processamento de notificações transacionais da plataforma (fila, worker, envio).
                      </p>
                    </div>
                    <Switch checked={gMotor} onCheckedChange={setGMotor} />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-base">Eventos de negócio da plataforma</Label>
                      <p className="text-sm text-muted-foreground">
                        Permite publicar eventos <code className="text-xs">platform.*</code> para o motor (cadastro,
                        billing, etc.).
                      </p>
                    </div>
                    <Switch checked={gBusiness} onCheckedChange={setGBusiness} />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-base">Envio WhatsApp da plataforma</Label>
                      <p className="text-sm text-muted-foreground">
                        Quando desligado, o motor pode continuar a registar entregas em fila sem despachar ao provedor.
                      </p>
                    </div>
                    <Switch checked={gWhatsapp} onCheckedChange={setGWhatsapp} />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-base">Log verboso (diagnóstico)</Label>
                      <p className="text-sm text-muted-foreground">Mais detalhe nos logs do servidor; uso operacional.</p>
                    </div>
                    <Switch checked={gVerbose} onCheckedChange={setGVerbose} />
                  </div>
                  <Button onClick={() => void saveGlobal()} disabled={globalSaving} className="gap-2">
                    <Save className="h-4 w-4" />
                    {globalSaving ? 'A guardar…' : 'Guardar configuração'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <History className="h-5 w-5" />
                Histórico de entregas (plataforma)
              </CardTitle>
              <CardDescription>
                Registos em <code className="text-xs">platform_notification_deliveries</code> — útil para ver envios e
                falhas recentes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label>Estado</Label>
                  <Select value={histStatus} onValueChange={setHistStatus}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="sent">sent</SelectItem>
                      <SelectItem value="queued">queued</SelectItem>
                      <SelectItem value="failed">failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Evento</Label>
                  <Select value={histEvent} onValueChange={setHistEvent}>
                    <SelectTrigger className="w-[260px]">
                      <SelectValue placeholder="Evento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {eventOptions.map((k) => (
                        <SelectItem key={k} value={k}>
                          {eventTitle(k)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Período</Label>
                  <Select value={histHours} onValueChange={setHistHours}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">Últimas 24 h</SelectItem>
                      <SelectItem value="72">Últimas 72 h</SelectItem>
                      <SelectItem value="168">Últimos 7 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="secondary" onClick={() => void loadHistory()} disabled={historyLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${historyLoading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>

              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Data</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Entidade</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
                          {historyLoading ? 'A carregar…' : 'Sem registos no período.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      deliveries.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {new Date(d.created_at).toLocaleString('pt-PT')}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{eventTitle(d.event_key)}</div>
                            <div className="text-xs text-muted-foreground font-mono">{d.event_key}</div>
                          </TableCell>
                          <TableCell className="text-sm">{channelLabel(d.channel)}</TableCell>
                          <TableCell className="text-sm max-w-[180px] truncate" title={d.recipient_address ?? ''}>
                            {d.recipient_address ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={d.status === 'failed' ? 'destructive' : 'secondary'}>{d.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate">
                            {d.entity_type ? (
                              <span title={`${d.entity_type} ${d.entity_id ?? ''}`}>
                                {d.entity_type}
                                {d.entity_id ? ` · ${d.entity_id.slice(0, 8)}…` : ''}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-destructive max-w-[200px] truncate" title={d.error_message ?? ''}>
                            {d.error_message ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editorOpen} onOpenChange={(o) => !o && closeEditor()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Editar override — {editorKey ? eventTitle(editorKey) : ''}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Template padrão do sistema é apenas leitura implícita; aqui grava-se só o override operacional. Canal{' '}
              {channelLabel(CHANNEL)} · locale {LOCALE}.
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <p className="text-sm text-muted-foreground">A carregar modelo…</p>
          ) : detail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm text-muted-foreground">Fonte efetiva:</span>
                {detail.effective_source === 'override' ? (
                  <Badge>Override do Super Admin</Badge>
                ) : (
                  <Badge variant="outline">Template padrão da plataforma</Badge>
                )}
              </div>

              <div>
                <Label className="text-sm">Merge fields permitidos (política strict)</Label>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(detail.event.merge_field_list ?? []).length ? (
                    detail.event.merge_field_list.map((f) => (
                      <Badge key={f} variant="secondary" className="font-mono text-xs">
                        {`{{${f}}}`}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Nenhum campo listado para este evento.</span>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="pn-override-subj">Assunto (opcional)</Label>
                <Textarea
                  id="pn-override-subj"
                  className="mt-1 min-h-[64px] font-mono text-sm"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  placeholder="Vazio se o canal não usar assunto"
                />
              </div>
              <div>
                <Label htmlFor="pn-override-body">Corpo da mensagem</Label>
                <Textarea
                  id="pn-override-body"
                  className="mt-1 min-h-[160px] font-mono text-sm"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                />
              </div>

              {editorKey === 'platform.billing.charge.created' ? (
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="pn-send-pix" className="text-base">
                        Enviar botão PIX copia e cola
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        O texto do modelo continua a ser enviado como hoje. Se ativar, o WhatsApp recebe também o
                        botão nativo com o código PIX da cobrança (quando existir na fatura). O link da fatura na
                        plataforma mantém-se no texto do template.
                      </p>
                    </div>
                    <Switch id="pn-send-pix" checked={draftSendPix} onCheckedChange={setDraftSendPix} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Se não houver PIX disponível no gateway, apenas o texto é enviado — a notificação não falha por
                    causa do botão.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void runPreview()} disabled={previewLoading}>
                  {previewLoading ? 'A gerar…' : 'Pré-visualizar (dados de exemplo)'}
                </Button>
                <span className="text-xs text-muted-foreground self-center">
                  Não envia mensagem real; apenas renderização strict no servidor.
                </span>
              </div>

              {previewError ? (
                <Alert variant="destructive">
                  <AlertTitle>Preview inválido</AlertTitle>
                  <AlertDescription>{previewError}</AlertDescription>
                  {previewInvalid?.length ? (
                    <ul className="list-disc text-sm mt-2 ml-4">
                      {previewInvalid.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  ) : null}
                </Alert>
              ) : null}

              {previewBody != null ? (
                <div className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">Resultado do preview</p>
                  {previewSubject ? (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Assunto:</span> {previewSubject}
                    </p>
                  ) : null}
                  <p className="text-sm whitespace-pre-wrap text-foreground">{previewBody}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeEditor}>
              Cancelar
            </Button>
            {detail?.effective_source === 'override' ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void restoreDefault()}
                disabled={overrideSaving || detailLoading}
              >
                Restaurar padrão
              </Button>
            ) : null}
            <Button type="button" onClick={() => void saveOverride()} disabled={overrideSaving || detailLoading}>
              {overrideSaving ? 'A guardar…' : 'Guardar override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
