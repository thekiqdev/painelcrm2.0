import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { toast } from "@/components/ui/sonner";
import {
  deleteNeTenantOverride,
  fetchNeBootstrap,
  fetchNeDeliveriesSearch,
  fetchNeDeliveryAttempts,
  fetchNeTenantPreferences,
  fetchNeTenantSummary,
  fetchNeTemplateBundle,
  patchNeTenantPreference,
  postNePreview,
  putNeTenantOverride,
  type NeBootstrap,
  type NeCatalogItem,
  type NeDeliveryAttemptRow,
  type NeDeliveryRow,
  type NePreferenceEvent,
  type NePreferenceModule,
  type NePreviewResponse,
  type NeTemplateBundle,
  type NeTenantSummaryResponse,
} from "@/services/notificationsEngineTenant";
import { SettingsSectionProps } from "./types";

const LOCALE = "pt-BR";

const EVENT_FALLBACK_TITLE: Record<string, string> = {
  "appointment.invited": "Convite de compromisso ao cliente",
  "appointment.reminder": "Lembrete de compromisso ao cliente",
  "appointment.completed": "Resumo pós-compromisso ao cliente",
  "appointment.confirmation_request": "Solicitação de confirmação",
  "proposal.sent": "Proposta enviada ao cliente",
  "proposal.accepted": "Proposta aceita",
  "proposal.rejected": "Proposta recusada",
  "contract.sent": "Contrato enviado para assinatura",
  "contract.signed": "Contrato assinado",
  "invoice.created": "Fatura criada",
  "invoice.due_soon": "Fatura a vencer",
  "invoice.overdue": "Fatura vencida",
  "invoice.paid": "Fatura paga",
};

function readableEventTitle(row: NeCatalogItem): string {
  const d = row.description?.trim();
  if (d) return d;
  return EVENT_FALLBACK_TITLE[row.event_key] ?? row.event_key;
}

function preferenceToCatalogItem(mod: NePreferenceModule, ev: NePreferenceEvent): NeCatalogItem {
  return {
    event_key: ev.event_key,
    module: mod.module,
    description: ev.description,
    default_channel: ev.channel,
    effective_channel: ev.channel,
    merge_fields: [],
    tenant_enabled: ev.enabled,
    has_override: ev.has_override,
    template_exists: ev.template_exists,
  };
}

function channelLabel(ch: string): string {
  if (ch === "whatsapp") return "WhatsApp";
  return ch;
}

function deliveryStatusLabelPt(status: string): string {
  const m: Record<string, string> = {
    sent: "Enviado",
    queued: "Pendente",
    processing: "Processando",
    failed: "Falhou",
    failed_transient: "Falhou (temporário)",
    skipped: "Ignorado",
    cancelled: "Cancelado",
    success: "Sucesso",
  };
  return m[status] ?? status;
}

function moduleLabelFromCatalogDb(db: string | null | undefined): string {
  if (!db) return "—";
  const labels: Record<string, string> = {
    invoices: "Faturas",
    proposals: "Propostas",
    contracts: "Contratos",
    agenda: "Agenda",
  };
  return labels[db] ?? "Outros";
}

function findPreferenceByEventKey(
  modules: NePreferenceModule[],
  eventKey: string,
): { mod: NePreferenceModule; ev: NePreferenceEvent } | null {
  for (const mod of modules) {
    const ev = mod.events.find((e) => e.event_key === eventKey);
    if (ev) return { mod, ev };
  }
  return null;
}

function statusBadgeVariant(
  s: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (s === "sent" || s === "success") return "default";
  if (s === "failed" || s === "failed_transient") return "destructive";
  if (s === "skipped" || s === "cancelled") return "secondary";
  return "outline";
}

export const NotificationsSection: React.FC<SettingsSectionProps> = () => {
  const { canEdit, loading: permLoading } = useModulePermissions();
  const canEditSettings = canEdit("settings");

  const [bootstrap, setBootstrap] = useState<NeBootstrap | null>(null);
  const [summary, setSummary] = useState<NeTenantSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [autoModules, setAutoModules] = useState<NePreferenceModule[]>([]);
  const [autoPrefsError, setAutoPrefsError] = useState<string | null>(null);
  const [loadingAutoPrefs, setLoadingAutoPrefs] = useState(false);

  const [deliveries, setDeliveries] = useState<NeDeliveryRow[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("__all__");
  const [filterEvent, setFilterEvent] = useState<string>("__all__");
  const [filterModule, setFilterModule] = useState<string>("__all__");
  const [filterChannel, setFilterChannel] = useState<string>("__all__");
  const [filterHours, setFilterHours] = useState<string>("72");

  const [templatePick, setTemplatePick] = useState<string>("");

  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [detailDelivery, setDetailDelivery] = useState<NeDeliveryRow | null>(null);
  const [detailAttempts, setDetailAttempts] = useState<NeDeliveryAttemptRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<NeCatalogItem | null>(null);
  const [bundle, setBundle] = useState<NeTemplateBundle | null>(null);
  const [bodyDraft, setBodyDraft] = useState("");
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<NePreviewResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const loadBootstrap = useCallback(async () => {
    const res = await fetchNeBootstrap();
    if (res.error || !res.data) {
      setBootstrap({ ok: false, engine_enabled: false, default_locale: LOCALE });
      return;
    }
    setBootstrap(res.data);
  }, []);

  const loadAutoPreferences = useCallback(async () => {
    setLoadingAutoPrefs(true);
    setAutoPrefsError(null);
    const res = await fetchNeTenantPreferences(LOCALE);
    if (res.error) {
      setAutoModules([]);
      setAutoPrefsError(res.error);
      setLoadingAutoPrefs(false);
      return;
    }
    if (res.data?.modules) setAutoModules(res.data.modules);
    setLoadingAutoPrefs(false);
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (bootstrap?.engine_enabled) void loadAutoPreferences();
  }, [bootstrap?.engine_enabled, loadAutoPreferences]);

  const loadSummary = useCallback(async () => {
    if (!bootstrap?.engine_enabled) {
      setSummary(null);
      return;
    }
    setSummaryLoading(true);
    const res = await fetchNeTenantSummary();
    setSummaryLoading(false);
    if (res.error || !res.data?.ok) {
      setSummary(null);
      return;
    }
    setSummary(res.data);
  }, [bootstrap?.engine_enabled]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const keys = autoModules.flatMap((m) => m.events.map((e) => e.event_key));
    if (keys.length === 0) return;
    if (!templatePick || !keys.includes(templatePick)) {
      setTemplatePick(keys[0]!);
    }
  }, [autoModules, templatePick]);

  const loadDeliveries = useCallback(async () => {
    setDeliveriesLoading(true);
    const hours = parseInt(filterHours, 10) || 72;
    const res = await fetchNeDeliveriesSearch({
      hours,
      limit: 80,
      status: filterStatus === "__all__" ? undefined : filterStatus,
      event_key: filterEvent === "__all__" ? undefined : filterEvent,
      module: filterModule === "__all__" ? undefined : filterModule,
      channel: filterChannel === "__all__" ? undefined : filterChannel,
    });
    if (res.error) {
      toast.error(res.error);
      setDeliveries([]);
    } else if (res.data?.deliveries) {
      setDeliveries(res.data.deliveries);
    }
    setDeliveriesLoading(false);
  }, [filterHours, filterStatus, filterEvent, filterModule, filterChannel]);

  useEffect(() => {
    if (bootstrap?.engine_enabled) void loadDeliveries();
  }, [bootstrap?.engine_enabled, loadDeliveries]);

  const openEditor = async (row: NeCatalogItem) => {
    setEditing(row);
    setPreview(null);
    setBundle(null);
    setSheetOpen(true);
    const res = await fetchNeTemplateBundle(row.event_key, LOCALE, row.effective_channel);
    if (res.error || !res.data?.ok) {
      toast.error(res.error ?? "Não foi possível carregar o modelo.");
      setSheetOpen(false);
      return;
    }
    const b = res.data;
    setBundle(b);
    const startBody = b.override?.body_template ?? b.system.body_template;
    const startSubject = b.override?.subject_template ?? b.system.subject_template;
    setBodyDraft(startBody);
    setSubjectDraft(startSubject);
  };

  const runPreview = async () => {
    if (!editing) return;
    const res = await postNePreview({
      event_key: editing.event_key,
      body_template: bodyDraft,
      subject_template: subjectDraft,
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setPreview(res.data as NePreviewResponse);
  };

  const saveOverride = async () => {
    if (!editing || !bundle) return;
    setSaving(true);
    const res = await putNeTenantOverride(
      editing.event_key,
      { body_template: bodyDraft, subject_template: subjectDraft },
      LOCALE,
      bundle.effective_channel,
    );
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Modelo personalizado guardado.");
    setSheetOpen(false);
    void loadAutoPreferences();
    void loadSummary();
  };

  const restoreDefault = async () => {
    if (!editing || !bundle) return;
    setSaving(true);
    const res = await deleteNeTenantOverride(editing.event_key, LOCALE, bundle.effective_channel);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Restaurado o modelo padrão do sistema.");
    setSheetOpen(false);
    void loadAutoPreferences();
    void loadSummary();
  };

  const onTogglePreference = async (ev: NePreferenceEvent, enabled: boolean) => {
    const channel =
      ev.channel === "whatsapp" || ev.channel === "email" || ev.channel === "sms"
        ? ev.channel
        : undefined;
    const res = await patchNeTenantPreference(ev.event_key, {
      enabled,
      ...(channel ? { channel } : {}),
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(enabled ? "Notificação ativada." : "Notificação desativada.");
    setAutoModules((prev) =>
      prev.map((m) => ({
        ...m,
        events: m.events.map((e) =>
          e.event_key === ev.event_key ? { ...e, enabled } : e,
        ),
      })),
    );
    void loadSummary();
  };

  const openDeliveryDetail = async (d: NeDeliveryRow) => {
    setDetailDelivery(d);
    setDetailAttempts([]);
    setDetailSheetOpen(true);
    setDetailLoading(true);
    const res = await fetchNeDeliveryAttempts(d.id);
    setDetailLoading(false);
    if (res.error) {
      toast.error(res.error);
      setDetailAttempts([]);
      return;
    }
    setDetailAttempts(res.data?.attempts ?? []);
  };

  const showSubject =
    bundle &&
    (bundle.system.subject_template != null ||
      bundle.override?.subject_template != null ||
      (subjectDraft != null && subjectDraft.length > 0));

  const engineOff = bootstrap && !bootstrap.engine_enabled;
  const eventOptions = useMemo(
    () => autoModules.flatMap((m) => m.events.map((e) => e.event_key)),
    [autoModules],
  );

  const eventLabelByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const mod of autoModules) {
      for (const ev of mod.events) {
        m[ev.event_key] = ev.label;
      }
    }
    return m;
  }, [autoModules]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notificações automáticas</CardTitle>
          <CardDescription>
            Painel da empresa: eventos do motor, modelos WhatsApp e histórico de entregas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {engineOff && (
            <Alert className="mb-4 border-amber-500/50 bg-amber-500/10">
              <AlertTitle>Motor desligado</AlertTitle>
              <AlertDescription className="text-sm">
                O painel pode ter dados limitados. Veja a aba <strong>Configurações</strong> para o estado global do
                motor ou contacte o administrador da plataforma.
              </AlertDescription>
            </Alert>
          )}

          {autoPrefsError && bootstrap?.engine_enabled && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Erro ao carregar preferências automáticas</AlertTitle>
              <AlertDescription>{autoPrefsError}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="overview">
            <TabsList className="mb-4 flex h-auto min-h-10 flex-wrap justify-start gap-1 bg-muted/40 p-1">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="events">Eventos automáticos</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="history">Histórico de envios</TabsTrigger>
              <TabsTrigger value="config">Configurações</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Resumo dos envios e preferências da sua empresa nos últimos 7 dias.
              </p>
              {summaryLoading ? (
                <p className="text-sm text-muted-foreground">A carregar resumo…</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Notificações ativas
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">{summary?.active_events_count ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">Eventos ligados no catálogo</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Enviadas (7 dias)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">{summary?.sent_last_7_days ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">Entregas com estado enviado</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Falhas (7 dias)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold text-destructive">
                        {summary?.failures_last_7_days ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">Falha definitiva ou temporária</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Eventos desativados
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">{summary?.disabled_events_count ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">Desligados pela empresa</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="events" className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold tracking-tight">Eventos automáticos</h3>
                <p className="text-sm text-muted-foreground">
                  Escolha quais mensagens automáticas a sua empresa envia aos clientes. Cada evento corresponde a uma
                  mensagem do motor (neste MVP: WhatsApp).
                </p>
              </div>

              {loadingAutoPrefs && (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              )}

              {!loadingAutoPrefs &&
                bootstrap?.engine_enabled &&
                autoModules.flatMap((m) => m.events).length === 0 && (
                  <p className="text-sm text-muted-foreground">Sem eventos disponíveis.</p>
                )}

              {!loadingAutoPrefs &&
                autoModules.map((mod) => (
                  <div key={mod.module} className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">{mod.label}</p>
                    <div className="divide-y divide-border rounded-md border border-border bg-card/30">
                      {mod.events.map((ev) => (
                        <div
                          key={ev.event_key}
                          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={ev.enabled ? "default" : "secondary"}>
                                {ev.enabled ? "Ativo" : "Desativado"}
                              </Badge>
                              <span className="font-medium leading-snug" title={ev.event_key}>
                                {ev.label}
                              </span>
                            </div>
                            {ev.description?.trim() ? (
                              <p className="text-sm text-muted-foreground">{ev.description.trim()}</p>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                              Canal: <strong>{channelLabel(ev.channel)}</strong>
                            </p>
                            {ev.last_delivery_at ? (
                              <p className="text-xs text-muted-foreground">
                                Último envio:{" "}
                                {format(new Date(ev.last_delivery_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} —{" "}
                                {deliveryStatusLabelPt(ev.last_delivery_status ?? "")}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">Ainda sem envios registados neste evento.</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {ev.has_override ? (
                                <Badge variant="outline" className="text-xs">
                                  Modelo personalizado
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  Modelo padrão
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
                            <div className="flex items-center justify-between gap-3 sm:justify-end">
                              <span className="text-sm text-muted-foreground sm:hidden">Ligar</span>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={ev.enabled}
                                  disabled={
                                    !bootstrap?.engine_enabled || !canEditSettings || permLoading
                                  }
                                  onCheckedChange={(v) => void onTogglePreference(ev, v)}
                                />
                              </div>
                            </div>
                            {ev.template_exists ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full sm:w-auto"
                                disabled={!bootstrap?.engine_enabled}
                                onClick={() => void openEditor(preferenceToCatalogItem(mod, ev))}
                              >
                                Editar mensagem
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </TabsContent>

            <TabsContent value="templates" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Personalize o texto das mensagens por evento. O modelo padrão do sistema não é alterado — apenas a sua
                versão (override). Use pré-visualização com dados de exemplo antes de guardar.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="space-y-1 min-w-[260px] flex-1">
                  <Label>Evento</Label>
                  <Select value={templatePick} onValueChange={setTemplatePick}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um evento" />
                    </SelectTrigger>
                    <SelectContent>
                      {autoModules.flatMap((m) =>
                        m.events.map((ev) => (
                          <SelectItem key={ev.event_key} value={ev.event_key}>
                            {m.label}: {ev.label}
                          </SelectItem>
                        )),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="default"
                  disabled={!templatePick || !bootstrap?.engine_enabled}
                  onClick={() => {
                    const f = findPreferenceByEventKey(autoModules, templatePick);
                    if (f?.ev.template_exists) void openEditor(preferenceToCatalogItem(f.mod, f.ev));
                    else toast.error("Este evento não tem modelo do sistema para editar.");
                  }}
                >
                  Abrir editor de mensagem
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Entregas registadas pelo motor para a sua empresa. Use os filtros para localizar falhas ou confirmar
                envios.
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1">
                  <Label>Módulo</Label>
                  <Select value={filterModule} onValueChange={setFilterModule}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Módulo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="billing">Faturas</SelectItem>
                      <SelectItem value="proposals">Propostas</SelectItem>
                      <SelectItem value="contracts">Contratos</SelectItem>
                      <SelectItem value="agenda">Agenda</SelectItem>
                      <SelectItem value="other">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Estado</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="queued">Pendente</SelectItem>
                      <SelectItem value="processing">Processando</SelectItem>
                      <SelectItem value="sent">Enviado</SelectItem>
                      <SelectItem value="failed">Falhou</SelectItem>
                      <SelectItem value="failed_transient">Falhou (temp.)</SelectItem>
                      <SelectItem value="skipped">Ignorado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Evento</Label>
                  <Select value={filterEvent} onValueChange={setFilterEvent}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Evento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {eventOptions.map((ek) => (
                        <SelectItem key={ek} value={ek}>
                          {eventLabelByKey[ek] ?? EVENT_FALLBACK_TITLE[ek] ?? ek}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Canal</Label>
                  <Select value={filterChannel} onValueChange={setFilterChannel}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Canal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Período</Label>
                  <Select value={filterHours} onValueChange={setFilterHours}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Horas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">Últimas 24 h</SelectItem>
                      <SelectItem value="72">Últimas 72 h</SelectItem>
                      <SelectItem value="168">Últimos 7 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!bootstrap?.engine_enabled || deliveriesLoading}
                    onClick={() => void loadDeliveries()}
                  >
                    Atualizar
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Módulo</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead>Erro</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveriesLoading && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-muted-foreground">
                          A carregar…
                        </TableCell>
                      </TableRow>
                    )}
                    {!deliveriesLoading && deliveries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-muted-foreground">
                          Sem registos no período.
                        </TableCell>
                      </TableRow>
                    )}
                    {deliveries.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(d.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {moduleLabelFromCatalogDb(d.module)}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px]">
                          <span className="line-clamp-2">
                            {eventLabelByKey[d.event_key] ?? EVENT_FALLBACK_TITLE[d.event_key] ?? d.event_key}
                          </span>
                        </TableCell>
                        <TableCell>{channelLabel(d.channel ?? "")}</TableCell>
                        <TableCell className="max-w-[120px] truncate text-sm">
                          {d.recipient_address ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(d.status)}>
                            {deliveryStatusLabelPt(d.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {d.retry_count != null ? d.retry_count : "—"}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs text-destructive">
                          {d.error_message ?? ""}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void openDeliveryDetail(d)}
                          >
                            Ver detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="config" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Estado global do motor e permissões. Estas opções podem ser definidas pelo administrador da plataforma.
              </p>

              {bootstrap?.engine_enabled === true && bootstrap.business_events_enabled === false && (
                <Alert>
                  <AlertTitle>Publicação automática desativada globalmente</AlertTitle>
                  <AlertDescription>
                    O Super Admin desativou a publicação de eventos de negócio. As entregas automáticas podem não ser
                    criadas mesmo com eventos ativos na empresa.
                  </AlertDescription>
                </Alert>
              )}

              {bootstrap?.engine_enabled === true && bootstrap.whatsapp_send_enabled === false && (
                <Alert>
                  <AlertTitle>Envio real por WhatsApp desativado globalmente</AlertTitle>
                  <AlertDescription>
                    As mensagens podem ser preparadas, mas o envio ao gateway está desligado ao nível da plataforma.
                  </AlertDescription>
                </Alert>
              )}

              {!permLoading && !canEditSettings && (
                <Alert>
                  <AlertTitle>Só leitura</AlertTitle>
                  <AlertDescription>
                    O seu perfil pode ver este painel, mas apenas utilizadores com permissão de edição em Configurações
                    podem alterar preferências ou modelos.
                  </AlertDescription>
                </Alert>
              )}

              <p className="text-sm text-muted-foreground">
                Notificações por e-mail, SMS ou dentro da aplicação poderão ser acrescentadas em fases futuras; neste
                MVP apenas mensagens transacionais via WhatsApp estão cobertas pelo motor central. O envio manual pelo
                Chat não é alterado aqui.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto border-border bg-background">
          <SheetHeader>
            <SheetTitle>Editar mensagem</SheetTitle>
            <SheetDescription>
              {editing ? (
                <>
                  {readableEventTitle(editing)} — o modelo <strong>padrão do sistema</strong> não é alterado; apenas o
                  seu override.
                </>
              ) : null}
            </SheetDescription>
          </SheetHeader>

          {bundle && editing && (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Canal: {channelLabel(bundle.effective_channel)}</Badge>
                {bundle.override ? <Badge>Com personalização</Badge> : <Badge variant="secondary">A usar padrão</Badge>}
              </div>

              <div>
                <Label className="text-sm font-medium">Campos disponíveis (merge)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Use a sintaxe <code className="rounded bg-muted px-1">{"{{chave}}"}</code> — apenas estes campos são
                  permitidos para este evento.
                </p>
                <div className="flex flex-wrap gap-1">
                  {bundle.merge_fields.map((k) => (
                    <Badge key={k} variant="outline" className="font-mono text-xs">
                      {`{{${k}}}`}
                    </Badge>
                  ))}
                </div>
              </div>

              {showSubject && (
                <div className="space-y-2">
                  <Label htmlFor="ne-subject">Assunto (opcional)</Label>
                  <Textarea
                    id="ne-subject"
                    value={subjectDraft ?? ""}
                    onChange={(e) => setSubjectDraft(e.target.value || null)}
                    rows={2}
                    disabled={!canEditSettings}
                    className="bg-background"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="ne-body">Corpo da mensagem</Label>
                <Textarea
                  id="ne-body"
                  value={bodyDraft}
                  onChange={(e) => setBodyDraft(e.target.value)}
                  rows={12}
                  disabled={!canEditSettings}
                  className="font-mono text-sm bg-background"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void runPreview()}>
                  Pré-visualizar
                </Button>
                <Button type="button" onClick={() => void saveOverride()} disabled={!canEditSettings || saving}>
                  Guardar personalização
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void restoreDefault()}
                  disabled={!canEditSettings || saving || !bundle.override}
                >
                  Restaurar padrão
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSheetOpen(false)}>
                  Fechar
                </Button>
              </div>

              {preview && preview.ok && preview.render_ok && (
                <Alert>
                  <AlertTitle>Pré-visualização (dados de exemplo)</AlertTitle>
                  <AlertDescription>
                    <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm">
                      {preview.rendered_body}
                    </pre>
                  </AlertDescription>
                </Alert>
              )}

              {preview && preview.ok && !preview.render_ok && (
                <Alert variant="destructive">
                  <AlertTitle>Modelo inválido no modo strict</AlertTitle>
                  <AlertDescription>
                    <p>{preview.error}</p>
                    {preview.disallowed_placeholders && preview.disallowed_placeholders.length > 0 && (
                      <p className="mt-2 text-xs">
                        Placeholders não permitidos: {preview.disallowed_placeholders.join(", ")}
                      </p>
                    )}
                    {preview.missing_keys && preview.missing_keys.length > 0 && (
                      <p className="mt-2 text-xs">Chaves em falta no contexto de exemplo: {preview.missing_keys.join(", ")}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto border-border bg-background"
        >
          <SheetHeader>
            <SheetTitle>Detalhe da entrega</SheetTitle>
            <SheetDescription>
              {detailDelivery ? (
                <>
                  {eventLabelByKey[detailDelivery.event_key] ??
                    EVENT_FALLBACK_TITLE[detailDelivery.event_key] ??
                    detailDelivery.event_key}{" "}
                  · {format(new Date(detailDelivery.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          {detailDelivery && (
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid gap-2">
                <p>
                  <span className="text-muted-foreground">Estado:</span>{" "}
                  <Badge variant={statusBadgeVariant(detailDelivery.status)}>
                    {deliveryStatusLabelPt(detailDelivery.status)}
                  </Badge>
                </p>
                <p>
                  <span className="text-muted-foreground">Módulo:</span>{" "}
                  {moduleLabelFromCatalogDb(detailDelivery.module)}
                </p>
                <p>
                  <span className="text-muted-foreground">Canal:</span>{" "}
                  {channelLabel(detailDelivery.channel ?? "")}
                </p>
                <p>
                  <span className="text-muted-foreground">Destino:</span>{" "}
                  {detailDelivery.recipient_address ?? "—"}
                </p>
                <p className="break-all text-xs text-muted-foreground font-mono">
                  Chave do evento: {detailDelivery.event_key}
                </p>
                {detailDelivery.error_message ? (
                  <Alert variant="destructive">
                    <AlertTitle>Erro</AlertTitle>
                    <AlertDescription className="whitespace-pre-wrap text-xs">
                      {detailDelivery.error_message}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
              <div>
                <p className="mb-2 font-medium">Tentativas de envio</p>
                {detailLoading ? (
                  <p className="text-muted-foreground">A carregar…</p>
                ) : detailAttempts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sem tentativas registadas (por exemplo, entrega ainda em fila).
                  </p>
                ) : (
                  <div className="divide-y divide-border rounded-md border border-border">
                    {detailAttempts.map((a) => (
                      <div key={a.id} className="space-y-1 p-3 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">Tentativa #{a.attempt_number}</span>
                          <Badge variant="outline">{deliveryStatusLabelPt(a.status)}</Badge>
                        </div>
                        <p className="text-muted-foreground">
                          {format(new Date(a.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                          {a.duration_ms != null ? ` · ${a.duration_ms} ms` : ""}
                        </p>
                        {a.error_message ? (
                          <p className="whitespace-pre-wrap text-destructive">{a.error_message}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
