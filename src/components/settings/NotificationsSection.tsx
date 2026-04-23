import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
  fetchNeCatalogWithState,
  fetchNeDeliveriesSearch,
  fetchNeTemplateBundle,
  postNePreview,
  putNeTenantOverride,
  putNeTenantPreference,
  type NeBootstrap,
  type NeCatalogItem,
  type NeDeliveryRow,
  type NePreviewResponse,
  type NeTemplateBundle,
} from "@/services/notificationsEngineTenant";
import { SettingsSectionProps } from "./types";

const LOCALE = "pt-BR";

const MODULE_LABEL_PT: Record<string, string> = {
  proposals: "Propostas",
  contracts: "Contratos",
  invoices: "Faturas",
};

const EVENT_FALLBACK_TITLE: Record<string, string> = {
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

function moduleLabel(m: string): string {
  return MODULE_LABEL_PT[m] ?? m;
}

function channelLabel(ch: string): string {
  if (ch === "whatsapp") return "WhatsApp";
  return ch;
}

function statusBadgeVariant(
  s: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (s === "sent") return "default";
  if (s === "failed" || s === "failed_transient") return "destructive";
  if (s === "skipped" || s === "cancelled") return "secondary";
  return "outline";
}

export const NotificationsSection: React.FC<SettingsSectionProps> = () => {
  const { canEdit, loading: permLoading } = useModulePermissions();
  const canEditSettings = canEdit("settings");

  const [bootstrap, setBootstrap] = useState<NeBootstrap | null>(null);
  const [catalog, setCatalog] = useState<NeCatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [deliveries, setDeliveries] = useState<NeDeliveryRow[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("__all__");
  const [filterEvent, setFilterEvent] = useState<string>("__all__");
  const [filterHours, setFilterHours] = useState<string>("72");

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

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError(null);
    const res = await fetchNeCatalogWithState(LOCALE);
    if (res.error) {
      setCatalog([]);
      setCatalogError(res.error);
      setLoadingCatalog(false);
      return;
    }
    if (res.data?.items) setCatalog(res.data.items);
    setLoadingCatalog(false);
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (bootstrap?.engine_enabled) void loadCatalog();
  }, [bootstrap?.engine_enabled, loadCatalog]);

  const loadDeliveries = useCallback(async () => {
    setDeliveriesLoading(true);
    const hours = parseInt(filterHours, 10) || 72;
    const res = await fetchNeDeliveriesSearch({
      hours,
      limit: 80,
      status: filterStatus === "__all__" ? undefined : filterStatus,
      event_key: filterEvent === "__all__" ? undefined : filterEvent,
    });
    if (res.error) {
      toast.error(res.error);
      setDeliveries([]);
    } else if (res.data?.deliveries) {
      setDeliveries(res.data.deliveries);
    }
    setDeliveriesLoading(false);
  }, [filterHours, filterStatus, filterEvent]);

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
    void loadCatalog();
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
    void loadCatalog();
  };

  const onToggleEnabled = async (row: NeCatalogItem, enabled: boolean) => {
    const res = await putNeTenantPreference(row.event_key, { enabled });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(enabled ? "Notificação ativada." : "Notificação desativada.");
    setCatalog((prev) =>
      prev.map((r) => (r.event_key === row.event_key ? { ...r, tenant_enabled: enabled } : r)),
    );
  };

  const showSubject =
    bundle &&
    (bundle.system.subject_template != null ||
      bundle.override?.subject_template != null ||
      (subjectDraft != null && subjectDraft.length > 0));

  const engineOff = bootstrap && !bootstrap.engine_enabled;
  const eventOptions = useMemo(() => catalog.map((c) => c.event_key), [catalog]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notificações</CardTitle>
          <CardDescription>
            Preferências gerais e motor transacional (MVP WhatsApp) para propostas, contratos e faturas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {engineOff && (
            <Alert className="mb-4 border-amber-500/50 bg-amber-500/10">
              <AlertTitle>Motor desligado na plataforma</AlertTitle>
              <AlertDescription>
                O motor transacional está desativado ao nível global (Super Admin → Motor de notificações, ou kill
                switch <code className="text-xs">NOTIFICATIONS_ENGINE_ENABLED=false</code> no ambiente). As preferências
                por evento abaixo não são aplicadas até o motor estar ativo.
              </AlertDescription>
            </Alert>
          )}

          {bootstrap?.engine_enabled === true && bootstrap.business_events_enabled === false && (
            <Alert className="mb-4">
              <AlertTitle>Publicação automática desativada globalmente</AlertTitle>
              <AlertDescription>
                O Super Admin desativou a publicação de eventos de negócio. Criação de entregas a partir de faturas /
                propostas / contratos pode não ocorrer mesmo com preferências do tenant ativas.
              </AlertDescription>
            </Alert>
          )}

          {bootstrap?.engine_enabled === true && bootstrap.whatsapp_send_enabled === false && (
            <Alert className="mb-4">
              <AlertTitle>Envio real por WhatsApp desativado globalmente</AlertTitle>
              <AlertDescription>
                As mensagens podem ser preparadas, mas o envio ao gateway está desligado ao nível da plataforma.
              </AlertDescription>
            </Alert>
          )}

          {!permLoading && !canEditSettings && (
            <Alert className="mb-4">
              <AlertTitle>Só leitura</AlertTitle>
              <AlertDescription>
                O seu perfil pode ver esta página, mas apenas utilizadores com permissão de edição em
                Configurações podem alterar notificações ou modelos.
              </AlertDescription>
            </Alert>
          )}

          {catalogError && bootstrap?.engine_enabled && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Erro ao carregar o catálogo</AlertTitle>
              <AlertDescription>{catalogError}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="transactional">
            <TabsList className="mb-4">
              <TabsTrigger value="transactional">Motor transacional</TabsTrigger>
              <TabsTrigger value="history">Histórico de envios</TabsTrigger>
            </TabsList>

            <TabsContent value="transactional" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cada evento envia mensagem pelo canal indicado (neste MVP: <strong>WhatsApp</strong>), usando o
                modelo padrão ou o seu texto personalizado.
              </p>
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Módulo</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Ativo</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingCatalog && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground">
                          A carregar…
                        </TableCell>
                      </TableRow>
                    )}
                    {!loadingCatalog && catalog.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground">
                          {bootstrap?.engine_enabled
                            ? "Sem eventos disponíveis."
                            : "Motor inativo — lista indisponível."}
                        </TableCell>
                      </TableRow>
                    )}
                    {catalog.map((row) => (
                      <TableRow key={row.event_key}>
                        <TableCell className="font-medium">{moduleLabel(row.module)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span>{readableEventTitle(row)}</span>
                            <span className="text-xs text-muted-foreground">{row.event_key}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{channelLabel(row.effective_channel)}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={row.tenant_enabled}
                              disabled={
                                !bootstrap?.engine_enabled || !canEditSettings || permLoading
                              }
                              onCheckedChange={(v) => void onToggleEnabled(row, v)}
                            />
                            <span className="text-sm text-muted-foreground">
                              {row.tenant_enabled ? "Sim" : "Não"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.has_override ? (
                            <Badge>Personalizado</Badge>
                          ) : (
                            <Badge variant="secondary">Padrão</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!bootstrap?.engine_enabled}
                            onClick={() => void openEditor(row)}
                          >
                            Editar modelo
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1">
                  <Label>Estado</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="queued">Em fila</SelectItem>
                      <SelectItem value="processing">A processar</SelectItem>
                      <SelectItem value="sent">Enviado</SelectItem>
                      <SelectItem value="failed">Falhou</SelectItem>
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
                          {EVENT_FALLBACK_TITLE[ek] ?? ek}
                        </SelectItem>
                      ))}
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

              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Entidade</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveriesLoading && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-muted-foreground">
                          A carregar…
                        </TableCell>
                      </TableRow>
                    )}
                    {!deliveriesLoading && deliveries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-muted-foreground">
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
                          {EVENT_FALLBACK_TITLE[d.event_key] ?? d.event_key}
                        </TableCell>
                        <TableCell>{channelLabel(d.channel ?? "")}</TableCell>
                        <TableCell className="max-w-[140px] truncate text-sm">
                          {d.recipient_address ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(d.status)}>{d.status}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                          {d.entity_type ? `${d.entity_type}${d.entity_id ? ` · ${d.entity_id.slice(0, 8)}…` : ""}` : "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-destructive">
                          {d.error_message ?? ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>

          <Separator className="my-6" />
          <p className="text-sm text-muted-foreground">
            Notificações por e-mail, SMS ou dentro da aplicação poderão ser acrescentadas em fases futuras; neste MVP
            apenas mensagens transacionais via WhatsApp estão cobertas pelo motor central.
          </p>
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
    </div>
  );
};
