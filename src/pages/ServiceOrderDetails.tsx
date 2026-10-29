import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  Loader2,
  Pencil,
  Receipt,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ServiceOrderForm } from "@/components/service-orders/ServiceOrderForm";
import { ServiceOrderA4Preview } from "@/components/service-orders/ServiceOrderA4Preview";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { formatAppMoney } from "@/lib/i18n/formatApp";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { serviceOrdersService } from "@/services/serviceOrders";
import { clientsService } from "@/services/clients";
import { retryAppointmentSync } from "@/services/appointments";
import { resolveProfileAvatarUrl } from "@/utils/chatIdentityDisplay";
import type { ServiceOrder, ServiceOrderStatus, UpdateServiceOrderInput } from "@/types/serviceOrders";
import { normalizeServiceOrderEquipmentList } from "@/types/serviceOrders";

function defaultDueDatePlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToLocalDatetimeValue(iso: string | null | undefined): string {
  if (!iso) return toLocalDatetimeValue(new Date());
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return toLocalDatetimeValue(new Date());
  return toLocalDatetimeValue(d);
}

function defaultVisitWindow(): { start: string; end: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: toLocalDatetimeValue(start), end: toLocalDatetimeValue(end) };
}

function localDatetimeToIso(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) throw new Error("Data/hora inválida");
  return d.toISOString();
}

function syncStatusLabel(s: string): string {
  switch (s) {
    case "synced":
      return "Sincronizado com Google";
    case "error":
      return "Erro no Google";
    case "cancelled":
      return "Cancelado no Google";
    default:
      return "Somente no CRM";
  }
}

const SENDABLE = new Set<ServiceOrderStatus>([
  "draft",
  "scheduled",
  "in_progress",
  "awaiting_signature",
  "signed",
]);

const STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  in_progress: "Em execução",
  awaiting_signature: "Aguardando assinatura",
  signed: "Assinada",
  invoiced: "Faturada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

const EDITABLE = new Set<ServiceOrderStatus>(["draft", "scheduled", "in_progress"]);

function fmtDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd/MM/yyyy HH:mm");
}

export default function ServiceOrderDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    canView,
    canEdit,
    canEditRecord,
    canDelete,
    canDeleteRecord,
    canCreate,
    hasPermissionKey,
  } = useModulePermissions();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewKey, setPreviewKey] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [signBusy, setSignBusy] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [dueDate, setDueDate] = useState(() => defaultDueDatePlus(14));
  const [converting, setConverting] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitMode, setVisitMode] = useState<"schedule" | "reschedule">("schedule");
  const [visitBusy, setVisitBusy] = useState(false);
  const [visitStart, setVisitStart] = useState(() => defaultVisitWindow().start);
  const [visitEnd, setVisitEnd] = useState(() => defaultVisitWindow().end);
  const [visitTitle, setVisitTitle] = useState("");
  const [createGoogle, setCreateGoogle] = useState(false);
  const [createMeet, setCreateMeet] = useState(false);
  const [lastSignLinks, setLastSignLinks] = useState<{
    view?: string;
    invites: Array<{
      signer_id?: string;
      name: string;
      role: string;
      url?: string;
      already_active?: boolean;
    }>;
  } | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [clientAvatarUrl, setClientAvatarUrl] = useState<string | null>(null);
  const [techEditOpen, setTechEditOpen] = useState(false);
  const [techEditSignerId, setTechEditSignerId] = useState<string | null>(null);
  const [techEditName, setTechEditName] = useState("");
  const [techEditBusy, setTechEditBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const row = await serviceOrdersService.getById(id);
      setOrder(row);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar OS");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const clientId = order?.client_id;
      if (!clientId) {
        setClientAvatarUrl(null);
        return;
      }
      try {
        const c = await clientsService.getClientById(clientId);
        if (cancelled) return;
        const resolved = resolveProfileAvatarUrl(c, c?.whatsapp_avatar_url ?? null);
        setClientAvatarUrl(resolved.src);
      } catch {
        if (!cancelled) setClientAvatarUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.client_id]);

  const currentUserId = user?.id ?? null;

  const hasEditPermission = useMemo(() => {
    if (!order) return false;
    if (!canEdit("service_orders")) return false;
    return canEditRecord("service_orders", order.created_by, currentUserId);
  }, [order, canEdit, canEditRecord, currentUserId]);

  const canEditThis = useMemo(() => {
    if (!order || !hasEditPermission) return false;
    return EDITABLE.has(order.status);
  }, [order, hasEditPermission]);

  const canDeleteThis = useMemo(() => {
    if (!order) return false;
    if (order.status !== "draft" && order.status !== "cancelled") return false;
    if (!canDelete("service_orders")) return false;
    return canDeleteRecord("service_orders", order.created_by, currentUserId);
  }, [order, canDelete, canDeleteRecord, currentUserId]);

  const canCancelThis = useMemo(() => {
    if (!order) return false;
    if (order.status === "cancelled" || order.status === "invoiced" || order.status === "completed") {
      return false;
    }
    if (!hasPermissionKey("service_orders.cancel")) return false;
    if (!canEdit("service_orders")) return false;
    return canEditRecord("service_orders", order.created_by, currentUserId);
  }, [order, hasPermissionKey, canEdit, canEditRecord, currentUserId]);

  const canSendSignature = useMemo(() => {
    if (!order) return false;
    if (!SENDABLE.has(order.status)) return false;
    if (!canEdit("service_orders")) return false;
    if (!hasPermissionKey("service_orders.request_signature")) return false;
    if (!hasPermissionKey("service_orders.send")) return false;
    return canEditRecord("service_orders", order.created_by, currentUserId);
  }, [order, canEdit, canEditRecord, hasPermissionKey, currentUserId]);

  const canConvertToInvoice = useMemo(() => {
    if (!order) return false;
    if (order.status !== "signed" && order.status !== "completed") return false;
    if (order.converted_invoice_id) return false;
    if (!order.client_id) return false;
    if (order.billing_mode === "none") return false;
    if (!hasPermissionKey("billing.create_invoice")) return false;
    if (!hasPermissionKey("service_orders.generate_invoice")) return false;
    if (!canEdit("service_orders")) return false;
    return canEditRecord("service_orders", order.created_by, currentUserId);
  }, [order, hasPermissionKey, canEdit, canEditRecord, currentUserId]);

  const canScheduleVisit = useMemo(() => {
    if (!order) return false;
    if (order.status === "cancelled") return false;
    if (order.appointment_id) return false;
    if (!canEdit("service_orders")) return false;
    if (!canCreate("agenda")) return false;
    return canEditRecord("service_orders", order.created_by, currentUserId);
  }, [order, canEdit, canCreate, canEditRecord, currentUserId]);

  const canRescheduleVisit = useMemo(() => {
    if (!order) return false;
    if (order.status === "cancelled") return false;
    if (!order.appointment_id) return false;
    if (order.appointment?.status === "cancelled") return false;
    if (!canEdit("service_orders")) return false;
    if (!canEdit("agenda")) return false;
    return canEditRecord("service_orders", order.created_by, currentUserId);
  }, [order, canEdit, canEditRecord, currentUserId]);

  const toAbsUrl = (pathOrUrl: string) =>
    pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${window.location.origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

  const copyAbs = async (pathOrUrl: string) => {
    await navigator.clipboard.writeText(toAbsUrl(pathOrUrl));
    toast.success("Link copiado");
  };

  const openAbs = (pathOrUrl: string) => {
    window.open(toAbsUrl(pathOrUrl), "_blank", "noopener,noreferrer");
  };

  const resolveSignerInviteUrl = (s: { id: string; name: string; role: string }) => {
    const byId = lastSignLinks?.invites.find((i) => i.signer_id === s.id && i.url);
    if (byId?.url) return byId.url;
    const byName = lastSignLinks?.invites.find(
      (i) => i.name === s.name && i.role === s.role && i.url,
    );
    return byName?.url;
  };

  if (!canView("service_orders")) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Sem permissão para ver ordens de serviço.</div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Ordem de serviço não encontrada.</p>
        <Button className="mt-3" variant="outline" onClick={() => navigate("/service-orders")}>
          Voltar
        </Button>
      </div>
    );
  }

  const services = (order.items ?? []).filter((i) => i.kind === "service");
  const products = (order.items ?? []).filter((i) => i.kind === "product");
  const snap = order.client_snapshot ?? {};
  const addr = (order.execution_address ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-4 sm:px-6 lg:px-8 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={() => navigate("/service-orders")} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              Ordem de serviço Nº {order.service_order_number}
            </h1>
            <p className="text-sm text-muted-foreground">
              {STATUS_LABELS[order.status]} · criada em {fmtDt(order.created_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <Button
              type="button"
              variant="default"
              disabled={pdfLoading}
              onClick={async () => {
                setPdfLoading(true);
                try {
                  await serviceOrdersService.downloadPdf(order.id);
                  toast.success("PDF gerado");
                  void load();
                  setPreviewKey((k) => k + 1);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF");
                } finally {
                  setPdfLoading(false);
                }
              }}
            >
              {pdfLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Baixar PDF
            </Button>
          ) : null}
          {!editing ? (
            <Button type="button" variant="outline" onClick={() => setShowPreview((v) => !v)}>
              <FileText className="mr-2 h-4 w-4" />
              {showPreview ? "Ocultar preview" : "Ver documento A4"}
            </Button>
          ) : null}
          {canScheduleVisit && !editing ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const w = defaultVisitWindow();
                setVisitMode("schedule");
                setVisitStart(w.start);
                setVisitEnd(w.end);
                setVisitTitle(`Visita técnica — OS Nº ${order.service_order_number}`);
                setCreateGoogle(false);
                setCreateMeet(false);
                setVisitOpen(true);
              }}
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              Marcar visita técnica
            </Button>
          ) : null}
          {canRescheduleVisit && !editing ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setVisitMode("reschedule");
                setVisitStart(isoToLocalDatetimeValue(order.appointment?.starts_at));
                setVisitEnd(isoToLocalDatetimeValue(order.appointment?.ends_at));
                setVisitTitle(
                  order.appointment?.title ||
                    `Visita técnica — OS Nº ${order.service_order_number}`,
                );
                setCreateGoogle(Boolean(order.appointment?.google_html_link) || order.appointment?.sync_status === "synced");
                setCreateMeet(Boolean(order.appointment?.google_meet_link));
                setVisitOpen(true);
              }}
            >
              <CalendarClock className="mr-2 h-4 w-4" />
              Remarcar na agenda
            </Button>
          ) : null}
          {canConvertToInvoice && !editing ? (
            <Button type="button" variant="default" onClick={() => setConvertOpen(true)}>
              <Receipt className="mr-2 h-4 w-4" />
              Gerar fatura
            </Button>
          ) : null}
          {canSendSignature && !editing ? (
            <Button
              type="button"
              variant="secondary"
              disabled={signBusy}
              onClick={async () => {
                setSignBusy(true);
                try {
                  const res = await serviceOrdersService.sendForSignature(order.id, {
                    include_technician: true,
                    regenerate: order.status === "awaiting_signature",
                  });
                  setLastSignLinks({
                    view: res.view.frontend_path,
                    invites: res.invites.map((i) => ({
                      signer_id: i.signer_id,
                      name: i.name,
                      role: i.role,
                      url: i.frontend_path,
                      already_active: i.already_active,
                    })),
                  });
                  await load();
                  setPreviewKey((k) => k + 1);
                  toast.success(
                    order.status === "awaiting_signature"
                      ? "Links regenerados"
                      : "Enviado para assinatura",
                  );
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao enviar");
                } finally {
                  setSignBusy(false);
                }
              }}
            >
              {signBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSignature className="mr-2 h-4 w-4" />
              )}
              {order.status === "awaiting_signature"
                ? "Reenviar assinatura"
                : order.status === "signed"
                  ? "Gerar link do técnico"
                  : "Enviar para assinatura"}
            </Button>
          ) : null}
          {hasEditPermission && !editing ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canEditThis}
                      onClick={() => setEditing(true)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canEditThis ? (
                  <TooltipContent>
                    Edição bloqueada após envio para assinatura / OS congelada
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {canDeleteThis ? (
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              onClick={async () => {
                if (!window.confirm(`Excluir OS Nº ${order.service_order_number}?`)) return;
                try {
                  await serviceOrdersService.remove(order.id);
                  toast.success("Ordem excluída");
                  navigate("/service-orders");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao excluir");
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          ) : null}
          {canCancelThis && !editing ? (
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              disabled={cancelBusy}
              onClick={async () => {
                if (!window.confirm(`Cancelar OS Nº ${order.service_order_number}?`)) return;
                setCancelBusy(true);
                try {
                  const updated = await serviceOrdersService.update(order.id, {
                    status: "cancelled",
                  });
                  setOrder(updated);
                  toast.success("Ordem cancelada");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao cancelar");
                } finally {
                  setCancelBusy(false);
                }
              }}
            >
              {cancelBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>

      {editing && canEditThis ? (
        <ServiceOrderForm
          mode="edit"
          initial={order}
          submitting={submitting}
          onCancel={() => setEditing(false)}
          onSubmit={async (payload) => {
            setSubmitting(true);
            try {
              const updated = await serviceOrdersService.update(order.id, payload as UpdateServiceOrderInput);
              setOrder(updated);
              setEditing(false);
              setPreviewKey((k) => k + 1);
              toast.success("Ordem atualizada");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Falha ao salvar");
            } finally {
              setSubmitting(false);
            }
          }}
        />
      ) : (
        <>
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cliente
            </h2>
            <div className="flex items-start gap-3">
              <Avatar className="h-12 w-12 shrink-0 border border-border/60">
                {clientAvatarUrl ? (
                  <AvatarImage
                    src={clientAvatarUrl}
                    alt={String(snap.name || order.client_name || "Cliente")}
                  />
                ) : null}
                <AvatarFallback>
                  {String(snap.name || order.client_name || "?")
                    .trim()
                    .charAt(0)
                    .toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                {order.client_id ? (
                  <Link to={`/clients/${order.client_id}`} className="font-medium hover:underline">
                    {String(snap.name || order.client_name || "Cliente")}
                  </Link>
                ) : (
                  <p className="font-medium">{String(snap.name || "—")}</p>
                )}
                {snap.trade_name ? (
                  <p className="text-sm text-muted-foreground">Fantasia: {String(snap.trade_name)}</p>
                ) : null}
                {snap.document ? (
                  <p className="text-sm text-muted-foreground">Doc.: {String(snap.document)}</p>
                ) : null}
                <p className="mt-2 text-sm">
                  {[addr.line, addr.city_uf, addr.postal_code].filter(Boolean).map(String).join(" · ") ||
                    "Endereço não informado"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Período
            </h2>
            <p className="text-sm">Entrada: {fmtDt(order.period_start_at)}</p>
            <p className="text-sm">Saída: {fmtDt(order.period_end_at)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Faturamento:{" "}
              {order.billing_mode === "auto_on_sign"
                ? "Automático ao assinar"
                : order.billing_mode === "none"
                  ? "Sem fatura"
                  : "Manual"}
            </p>
            {order.converted_invoice_id ? (
              <p className="mt-2 text-sm">
                Fatura:{" "}
                <Link
                  to={`/customer-invoices/${order.converted_invoice_id}`}
                  className="font-medium text-primary hover:underline"
                >
                  abrir no painel
                </Link>
              </p>
            ) : null}
          </section>

          {showPreview ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Documento A4
                  {order.document_frozen_at ? (
                    <span className="ml-2 font-normal normal-case text-muted-foreground">
                      · snapshot em {fmtDt(order.document_frozen_at)}
                    </span>
                  ) : (
                    <span className="ml-2 font-normal normal-case text-muted-foreground">
                      · preview ao vivo (congela ao baixar PDF)
                    </span>
                  )}
                </h2>
              </div>
              <ServiceOrderA4Preview serviceOrderId={order.id} refreshKey={previewKey} />
            </section>
          ) : null}

          {(order.appointment || canScheduleVisit) && (
            <section className="rounded-lg border bg-card p-4 space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Visita técnica
              </h2>
              {order.appointment ? (
                <>
                  <p className="text-sm font-medium">{order.appointment.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmtDt(order.appointment.starts_at)} → {fmtDt(order.appointment.ends_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {syncStatusLabel(order.appointment.sync_status)}
                    {order.appointment.sync_error ? ` · ${order.appointment.sync_error}` : null}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/agenda?appointment_id=${order.appointment.id}`}>Ver na Agenda</Link>
                    </Button>
                    {order.appointment.sync_status === "error" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={visitBusy}
                        onClick={async () => {
                          setVisitBusy(true);
                          try {
                            await retryAppointmentSync(order.appointment!.id, false);
                            toast.success("Sincronização reenviada");
                            await load();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Falha ao sincronizar");
                          } finally {
                            setVisitBusy(false);
                          }
                        }}
                      >
                        Tentar Google novamente
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : canScheduleVisit ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Nenhuma visita principal marcada. O Google Agenda usa a conta de quem está logado.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const w = defaultVisitWindow();
                      setVisitStart(w.start);
                      setVisitEnd(w.end);
                      setVisitTitle(`Visita técnica — OS Nº ${order.service_order_number}`);
                      setVisitOpen(true);
                    }}
                  >
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    Marcar visita
                  </Button>
                </>
              ) : null}
            </section>
          )}

          {(order.status === "signed" ||
            order.status === "invoiced" ||
            order.status === "completed" ||
            order.billing_mode !== "manual") && (
            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Faturamento
              </h2>
              <p className="text-sm text-muted-foreground">
                {order.billing_mode === "auto_on_sign"
                  ? "Ao assinar, o sistema tenta gerar a fatura automaticamente (mesmas regras do botão)."
                  : order.billing_mode === "none"
                    ? "Esta OS não gera fatura."
                    : "Use Gerar fatura após a assinatura (uma vez por OS)."}
              </p>
              {order.converted_invoice_id ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/customer-invoices/${order.converted_invoice_id}`}>Ver fatura</Link>
                  </Button>
                </div>
              ) : canConvertToInvoice ? (
                <Button type="button" className="mt-3" size="sm" onClick={() => setConvertOpen(true)}>
                  <Receipt className="mr-2 h-4 w-4" />
                  Gerar fatura
                </Button>
              ) : null}
            </section>
          )}

          {(() => {
            const equipmentList = normalizeServiceOrderEquipmentList(order.equipment);
            if (!equipmentList.length) return null;
            return (
              <section className="rounded-lg border bg-card p-4 space-y-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {equipmentList.length > 1 ? "Equipamentos" : "Equipamento"}
                </h2>
                {equipmentList.map((eq, idx) => (
                  <div
                    key={`eq-${idx}-${String(eq.name || "")}-${String(eq.serial || "")}`}
                    className={idx > 0 ? "border-t border-border/60 pt-3" : undefined}
                  >
                    {equipmentList.length > 1 ? (
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Equipamento {idx + 1}
                      </p>
                    ) : null}
                    <p className="text-sm font-medium">
                      {[eq.name, eq.brand].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[eq.model, eq.serial].filter(Boolean).join(" / ") || null}
                    </p>
                    {eq.defects ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm">{String(eq.defects)}</p>
                    ) : null}
                  </div>
                ))}
              </section>
            );
          })()}

          <section className="space-y-4">
            <ItemTable title="Serviços" rows={services} currency={order.currency} showUnit={false} />
            <ItemTable title="Produtos" rows={products} currency={order.currency} showUnit />
            <div className="flex flex-col items-end gap-0.5 text-sm">
              <div className="text-muted-foreground">
                Serviços: {formatAppMoney(Number(order.total_services_cents) || 0, order.currency || "BRL")}
              </div>
              <div className="text-muted-foreground">
                Produtos: {formatAppMoney(Number(order.total_products_cents) || 0, order.currency || "BRL")}
              </div>
              <div className="text-base font-semibold">
                Total: {formatAppMoney(Number(order.total_cents) || 0, order.currency || "BRL")}
              </div>
            </div>
          </section>

          {order.observations ? (
            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Observações
              </h2>
              <p className="whitespace-pre-wrap text-sm">{order.observations}</p>
            </section>
          ) : null}

          {(order.status === "awaiting_signature" ||
            order.status === "signed" ||
            lastSignLinks ||
            (order.signers?.length ?? 0) > 0) && (
            <section className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Assinatura online
                </h2>
                {order.status === "awaiting_signature" && canSendSignature ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={signBusy}
                    onClick={async () => {
                      if (!window.confirm("Revogar links públicos ativos desta OS?")) return;
                      setSignBusy(true);
                      try {
                        await serviceOrdersService.revokeSignatureLinks(order.id);
                        setLastSignLinks(null);
                        await load();
                        toast.success("Links revogados");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Falha ao revogar");
                      } finally {
                        setSignBusy(false);
                      }
                    }}
                  >
                    Revogar links
                  </Button>
                ) : null}
              </div>

              {(() => {
                const viewPath =
                  lastSignLinks?.view || order.public_view?.frontend_path || null;
                if (!viewPath) return null;
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">Visualização pública</span>
                      <span className="ml-2 text-xs text-muted-foreground">documento</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 gap-1.5"
                        onClick={() => openAbs(viewPath)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Acessar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        onClick={() => void copyAbs(viewPath)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copiar
                      </Button>
                    </div>
                  </div>
                );
              })()}

              <ul className="space-y-2">
                {(order.signers ?? [])
                  .slice()
                  .sort((a, b) => {
                    const rank = (r: string) => (r === "client" ? 0 : r === "technician" ? 1 : 2);
                    return rank(a.role) - rank(b.role) || a.signing_order - b.signing_order;
                  })
                  .map((s) => {
                    const inviteUrl = resolveSignerInviteUrl(s);
                    return (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{s.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {s.role === "technician" ? "técnico" : "cliente"}
                            {s.signed_at ? " · assinado" : " · pendente"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {s.role === "technician" &&
                          !s.signed_at &&
                          hasPermissionKey("service_orders.request_signature") &&
                          canEdit("service_orders") ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5"
                              disabled={signBusy || techEditBusy}
                              onClick={() => {
                                setTechEditSignerId(s.id);
                                setTechEditName(s.name);
                                setTechEditOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                          ) : null}
                          {s.signed_at ? (
                            <span className="text-xs text-emerald-700 dark:text-emerald-400">
                              Assinatura registrada
                            </span>
                          ) : inviteUrl ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8 gap-1.5"
                                onClick={() => openAbs(inviteUrl)}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Acessar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5"
                                onClick={() => void copyAbs(inviteUrl)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                Copiar
                              </Button>
                            </>
                          ) : null}
                          {!s.signed_at &&
                          (order.status === "awaiting_signature" ||
                            (s.role === "technician" &&
                              (order.status === "signed" ||
                                order.status === "invoiced" ||
                                order.status === "completed"))) &&
                          hasPermissionKey("service_orders.request_signature") &&
                          canEdit("service_orders") ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8"
                              disabled={signBusy}
                              onClick={async () => {
                                setSignBusy(true);
                                try {
                                  const out = await serviceOrdersService.reissueSignerInvite(
                                    order.id,
                                    s.id,
                                  );
                                  setLastSignLinks((prev) => ({
                                    view:
                                      prev?.view || order.public_view?.frontend_path || undefined,
                                    invites: [
                                      ...(prev?.invites.filter(
                                        (i) =>
                                          i.signer_id !== s.id &&
                                          !(i.name === s.name && i.role === s.role),
                                      ) ?? []),
                                      {
                                        signer_id: s.id,
                                        name: s.name,
                                        role: s.role,
                                        url: out.frontend_path,
                                      },
                                    ],
                                  }));
                                  toast.success(
                                    s.role === "technician"
                                      ? "Link do técnico pronto"
                                      : "Link do cliente pronto",
                                  );
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error ? e.message : "Falha ao obter link",
                                  );
                                } finally {
                                  setSignBusy(false);
                                }
                              }}
                            >
                              {inviteUrl ? "Reemitir" : "Gerar link"}
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}

        </>
      )}

      <Dialog
        open={techEditOpen}
        onOpenChange={(open) => {
          setTechEditOpen(open);
          if (!open) {
            setTechEditSignerId(null);
            setTechEditName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar técnico responsável</DialogTitle>
            <DialogDescription>
              Altera o nome que aparece no documento e no link de assinatura do técnico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="tech-signer-name">Nome do técnico</Label>
            <Input
              id="tech-signer-name"
              value={techEditName}
              onChange={(e) => setTechEditName(e.target.value)}
              autoComplete="name"
              disabled={techEditBusy}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={techEditBusy}
              onClick={() => setTechEditOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={techEditBusy || techEditName.trim().length < 2 || !techEditSignerId}
              onClick={async () => {
                if (!order || !techEditSignerId) return;
                setTechEditBusy(true);
                try {
                  const out = await serviceOrdersService.updateSignerName(
                    order.id,
                    techEditSignerId,
                    techEditName,
                  );
                  setOrder((prev) =>
                    prev
                      ? {
                          ...prev,
                          signers: (prev.signers ?? []).map((s) =>
                            s.id === out.id ? { ...s, name: out.name } : s,
                          ),
                        }
                      : prev,
                  );
                  setLastSignLinks((prev) =>
                    prev
                      ? {
                          ...prev,
                          invites: prev.invites.map((i) =>
                            i.signer_id === out.id || (i.role === "technician" && !i.signer_id)
                              ? { ...i, name: out.name }
                              : i,
                          ),
                        }
                      : prev,
                  );
                  setTechEditOpen(false);
                  toast.success("Nome do técnico atualizado");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao atualizar nome");
                } finally {
                  setTechEditBusy(false);
                }
              }}
            >
              {techEditBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {visitMode === "reschedule" ? "Remarcar visita técnica" : "Marcar visita técnica"}
            </DialogTitle>
            <DialogDescription>
              {visitMode === "reschedule"
                ? "Atualiza o compromisso já vinculado a esta OS na Agenda. Se marcar Google, usa a conta de quem está logado."
                : "Cria um compromisso na Agenda vinculado a esta OS. Se marcar Google, o evento usa a conta Google de quem está logado (não necessariamente a do técnico responsável)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="visit-title">Título</Label>
              <Input
                id="visit-title"
                value={visitTitle}
                onChange={(e) => setVisitTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="visit-start">Início</Label>
                <Input
                  id="visit-start"
                  type="datetime-local"
                  value={visitStart}
                  onChange={(e) => setVisitStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="visit-end">Fim</Label>
                <Input
                  id="visit-end"
                  type="datetime-local"
                  value={visitEnd}
                  onChange={(e) => setVisitEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="visit-google"
                checked={createGoogle}
                onCheckedChange={(v) => {
                  const on = v === true;
                  setCreateGoogle(on);
                  if (!on) setCreateMeet(false);
                }}
              />
              <Label htmlFor="visit-google" className="cursor-pointer text-sm font-normal leading-snug">
                {visitMode === "reschedule"
                  ? "Atualizar / sincronizar no Google Agenda (conta do usuário logado)"
                  : "Criar no Google Agenda (conta do usuário logado)"}
              </Label>
            </div>
            {createGoogle ? (
              <div className="flex items-start gap-2 pl-6">
                <Checkbox
                  id="visit-meet"
                  checked={createMeet}
                  onCheckedChange={(v) => setCreateMeet(v === true)}
                />
                <Label htmlFor="visit-meet" className="cursor-pointer text-sm font-normal leading-snug">
                  Incluir Google Meet
                </Label>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVisitOpen(false)} disabled={visitBusy}>
              Cancelar
            </Button>
            <Button
              disabled={visitBusy || !visitStart || !visitEnd}
              onClick={async () => {
                if (!order) return;
                setVisitBusy(true);
                try {
                  const payload = {
                    title: visitTitle.trim() || undefined,
                    starts_at: localDatetimeToIso(visitStart),
                    ends_at: localDatetimeToIso(visitEnd),
                    create_google_event: createGoogle,
                    create_meet: createMeet,
                  };
                  const res =
                    visitMode === "reschedule"
                      ? await serviceOrdersService.rescheduleVisit(order.id, payload)
                      : await serviceOrdersService.scheduleVisit(order.id, {
                          ...payload,
                          type: "visit",
                        });
                  setOrder(res.order);
                  setVisitOpen(false);
                  const okLabel =
                    visitMode === "reschedule" ? "Visita remarcada" : "Visita técnica marcada";
                  if (res.warnings?.length) {
                    toast.message(okLabel, {
                      description: res.warnings.join(" · "),
                    });
                  } else {
                    toast.success(okLabel);
                  }
                  await load();
                } catch (e) {
                  toast.error(
                    e instanceof Error
                      ? e.message
                      : visitMode === "reschedule"
                        ? "Falha ao remarcar visita"
                        : "Falha ao marcar visita",
                  );
                } finally {
                  setVisitBusy(false);
                }
              }}
            >
              {visitBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : visitMode === "reschedule" ? (
                "Remarcar"
              ) : (
                "Confirmar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar fatura</DialogTitle>
            <DialogDescription>
              Será criada uma fatura manual para o cliente desta OS, com os itens e totais. Só pode ser feita uma vez
              por ordem de serviço.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="os-due-date">Vencimento da fatura</Label>
              <Input
                id="os-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O backend valida gateway e pré-condições do cliente como em qualquer fatura manual (CPF/CNPJ, etc.).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)} disabled={converting}>
              Cancelar
            </Button>
            <Button
              disabled={converting || !dueDate}
              onClick={async () => {
                if (!order || !dueDate) return;
                setConverting(true);
                try {
                  const result = await serviceOrdersService.convertToInvoice(order.id, {
                    due_date: dueDate,
                  });
                  toast.success("Fatura gerada");
                  setConvertOpen(false);
                  await load();
                  if (result.invoice?.id) {
                    navigate(`/customer-invoices/${result.invoice.id}`);
                  }
                } catch (e) {
                  const err = e instanceof Error ? e : null;
                  const msg = err?.message ?? "Erro ao gerar fatura";
                  const apiCode =
                    err && "apiCode" in err ? String((err as Error & { apiCode?: string }).apiCode) : "";
                  if (
                    apiCode === "SERVICE_ORDER_ALREADY_INVOICED" ||
                    msg.toLowerCase().includes("já existe fatura")
                  ) {
                    toast.error("Esta OS já foi convertida em fatura.");
                  } else {
                    toast.error(msg);
                  }
                } finally {
                  setConverting(false);
                }
              }}
            >
              {converting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando…
                </>
              ) : (
                "Confirmar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemTable({
  title,
  rows,
  currency,
  showUnit,
}: {
  title: string;
  rows: NonNullable<ServiceOrder["items"]>;
  currency: string;
  showUnit: boolean;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">Nenhuma linha.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Nome</th>
            {showUnit ? <th className="px-3 py-2 font-medium">Und.</th> : null}
            <th className="px-3 py-2 text-right font-medium">Qtd.</th>
            <th className="px-3 py-2 text-right font-medium">Unit.</th>
            <th className="px-3 py-2 text-right font-medium">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? `${title}-${i}`} className="border-b last:border-0">
              <td className="px-3 py-2 tabular-nums">{i + 1}</td>
              <td className="px-3 py-2">{row.name}</td>
              {showUnit ? <td className="px-3 py-2">{row.unit || "UN"}</td> : null}
              <td className="px-3 py-2 text-right tabular-nums">{Number(row.quantity).toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatAppMoney(Number(row.unit_price_cents) || 0, currency || "BRL")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">
                {formatAppMoney(
                  Number(row.subtotal_cents) ||
                    Math.round(Number(row.quantity) * Number(row.unit_price_cents) - Number(row.discount_cents || 0)),
                  currency || "BRL",
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
