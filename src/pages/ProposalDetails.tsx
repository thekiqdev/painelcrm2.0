
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  FileText,
  ArrowLeft,
  Send,
  Receipt,
  ExternalLink,
  Loader2,
  Link2,
  Copy,
  MoreHorizontal,
  Pencil,
  ChevronDown,
  User,
  Calendar,
  Banknote,
  Mail,
} from "lucide-react";
import { isProposalDescriptionHtml, sanitizeProposalHtml } from "@/utils/proposalRichText";
import {
  getStoredProposalPublicUrl,
  setStoredProposalPublicUrl,
  clearStoredProposalPublicUrl,
} from "@/utils/proposalPublicLinkSession";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useParams, Link, useLocation } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { proposalsService, Proposal, ProposalPublicLinkMeta, PostAcceptBillingMode } from "@/services/proposals";
import { clientsService } from "@/services/clients";
import { format } from "date-fns";
import { formatDateOnlyIsoInput, formatDateOnlyPtBr } from "@/utils/formatCalendarDate";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobileShellChrome } from "@/contexts/MobileShellChromeContext";

function resolveProposalPublicUrl(proposal: Proposal, lastPublicUrl: string | null): string | null {
  const path = proposal.public_link_path?.trim();
  if (path) return `${window.location.origin}${path}`;
  return lastPublicUrl || getStoredProposalPublicUrl(proposal.id) || null;
}

const ProposalDetails = () => {
  const { funnelId, proposalId } = useParams<{
    funnelId?: string;
    stageId?: string;
    proposalId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { setSuppressMobileBottomNav } = useMobileShellChrome();
  const { user } = useAuth();
  const { canEditRecord, canProposalSendRecord, canProposalConvertRecord } = useModulePermissions();
  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [dueDate, setDueDate] = useState<string>("");
  const [converting, setConverting] = useState(false);
  const [publicLinkMeta, setPublicLinkMeta] = useState<ProposalPublicLinkMeta | null>(null);
  const [publicLinkBusy, setPublicLinkBusy] = useState(false);
  const [lastPublicUrl, setLastPublicUrl] = useState<string | null>(null);
  const [billingSaving, setBillingSaving] = useState(false);
  const [chatReturnTo, setChatReturnTo] = useState<string | null>(null);
  const [publishingProposal, setPublishingProposal] = useState(false);
  const mobileFlow = isMobile;

  useEffect(() => {
    if (!mobileFlow) {
      setSuppressMobileBottomNav(false);
      return;
    }
    setSuppressMobileBottomNav(true);
    return () => setSuppressMobileBottomNav(false);
  }, [mobileFlow, setSuppressMobileBottomNav]);

  useEffect(() => {
    const st = location.state as { chatReturnTo?: string } | null;
    if (!st) return;
    const rt = typeof st.chatReturnTo === "string" ? st.chatReturnTo.trim() : "";
    if (rt) setChatReturnTo(rt);
    if (rt) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  const goBack = useCallback(() => {
    if (funnelId) navigate(`/funnel/${funnelId}`);
    else navigate("/proposals");
  }, [funnelId, navigate]);

  const fetchProposal = useCallback(async () => {
    if (!proposalId) {
      toast.error("ID da proposta não fornecido");
      goBack();
      return;
    }
    setLoading(true);
    try {
      const proposalData = await proposalsService.getProposalById(proposalId);
      setProposal(proposalData);
      const due = proposalData.valid_until
        ? formatDateOnlyIsoInput(proposalData.valid_until) || format(new Date(), "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd");
      setDueDate(due);

      if (proposalData.client_name?.trim()) {
        setClientName(proposalData.client_name.trim());
      } else if (proposalData.client_id) {
        const clients = await clientsService.getClients();
        const client = clients.find((c) => c.id === proposalData.client_id);
        setClientName(client?.name || "Cliente não encontrado");
      } else if (proposalData.lead_name?.trim()) {
        setClientName(proposalData.lead_name.trim());
      } else if (proposalData.lead_id) {
        setClientName("Lead vinculado");
      } else {
        setClientName("—");
      }

      try {
        const meta = await proposalsService.getProposalPublicLinkMeta(proposalId);
        setPublicLinkMeta(meta);
        const fromApi =
          proposalData.public_link_path != null && proposalData.public_link_path !== ""
            ? `${window.location.origin}${proposalData.public_link_path}`
            : null;
        const fromMetaPath =
          meta.path != null && String(meta.path).trim() !== ""
            ? `${window.location.origin}${String(meta.path).trim()}`
            : null;
        const resolvedUrl = fromApi || fromMetaPath;
        if (resolvedUrl) {
          setLastPublicUrl(resolvedUrl);
          setStoredProposalPublicUrl(proposalId, resolvedUrl);
        } else if (meta?.active) {
          setLastPublicUrl(getStoredProposalPublicUrl(proposalId));
        } else {
          setLastPublicUrl(null);
          clearStoredProposalPublicUrl(proposalId);
        }
      } catch {
        setPublicLinkMeta(null);
        const fromApiFallback =
          proposalData.public_link_path != null && proposalData.public_link_path !== ""
            ? `${window.location.origin}${proposalData.public_link_path}`
            : null;
        if (fromApiFallback) {
          setLastPublicUrl(fromApiFallback);
          setStoredProposalPublicUrl(proposalId, fromApiFallback);
        } else {
          setLastPublicUrl(getStoredProposalPublicUrl(proposalId));
        }
      }
    } catch (error) {
      console.error("Erro ao carregar proposta:", error);
      toast.error("Erro ao carregar proposta");
      goBack();
    } finally {
      setLoading(false);
    }
  }, [proposalId, goBack]);

  useEffect(() => {
    void fetchProposal();
  }, [fetchProposal]);

  const effectivePublicUrl = useMemo(
    () => (proposal ? resolveProposalPublicUrl(proposal, lastPublicUrl) : null),
    [proposal, lastPublicUrl]
  );

  const copyPublicUrl = async () => {
    if (!proposal || !effectivePublicUrl) return;
    try {
      await navigator.clipboard.writeText(effectivePublicUrl);
      toast.success("Link copiado.");
      if (!lastPublicUrl) setLastPublicUrl(effectivePublicUrl);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const openPublicProposalPage = () => {
    if (!effectivePublicUrl) return;
    window.open(effectivePublicUrl, "_blank", "noopener,noreferrer");
  };

  const handlePublishProposal = async () => {
    if (!proposal) return;
    setPublishingProposal(true);
    try {
      const updated = await proposalsService.updateProposal(proposal.id, {
        status: "sent",
        sent_date: format(new Date(), "yyyy-MM-dd"),
      });
      const path = updated.public_link_path?.trim();
      if (path) {
        const full = `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
        setStoredProposalPublicUrl(proposal.id, full);
        setLastPublicUrl(full);
      }
      toast.success("Proposta publicada. O cliente pode abrir pelo link público; notificações de envio foram disparadas se estiverem configuradas.");
      await fetchProposal();
      try {
        const meta = await proposalsService.getProposalPublicLinkMeta(proposal.id);
        setPublicLinkMeta(meta);
      } catch {
        /* meta opcional */
      }
    } catch (error) {
      console.error(error);
      const err = error as Error & { code?: string };
      if (err.code === "PROPOSAL_SENT_REQUIRES_PUBLIC_LINK") {
        toast.error(err.message || "Não foi possível gerar o link público para publicar.");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível publicar a proposta.");
    } finally {
      setPublishingProposal(false);
    }
  };

  const handleConvert = async () => {
    if (!proposal || !dueDate) return;
    setConverting(true);
    try {
      const result = await proposalsService.convertProposalToInvoice(proposal.id, { due_date: dueDate });
      toast.success("Fatura gerada com sucesso.");
      setConvertOpen(false);
      await fetchProposal();
      if (result.invoice?.id) {
        navigate(`/customer-invoices/${result.invoice.id}`);
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : null;
      const msg = err?.message ?? "Erro ao gerar fatura";
      const apiCode = err && "apiCode" in err ? String((err as Error & { apiCode?: string }).apiCode) : "";
      if (apiCode === "PROPOSAL_ALREADY_INVOICED" || msg.toLowerCase().includes("já existe fatura")) {
        toast.error("Esta proposta já foi convertida em fatura.");
      } else {
        toast.error(msg);
      }
    } finally {
      setConverting(false);
    }
  };

  const issuePublicLink = async () => {
    if (!proposal) return;
    setPublicLinkBusy(true);
    try {
      const r = await proposalsService.issueProposalPublicLink(proposal.id);
      const full = `${window.location.origin}${r.path}`;
      setLastPublicUrl(full);
      setStoredProposalPublicUrl(proposal.id, full);
      toast.success("Link gerado. Copie e envie ao cliente.");
      const meta = await proposalsService.getProposalPublicLinkMeta(proposal.id);
      setPublicLinkMeta(meta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link");
    } finally {
      setPublicLinkBusy(false);
    }
  };

  const revokePublicLink = async () => {
    if (!proposal) return;
    setPublicLinkBusy(true);
    try {
      await proposalsService.revokeProposalPublicLink(proposal.id);
      setLastPublicUrl(null);
      clearStoredProposalPublicUrl(proposal.id);
      toast.success("Link público revogado.");
      const meta = await proposalsService.getProposalPublicLinkMeta(proposal.id);
      setPublicLinkMeta(meta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao revogar");
    } finally {
      setPublicLinkBusy(false);
    }
  };

  const handleBillingModeChange = async (mode: PostAcceptBillingMode) => {
    if (!proposal) return;
    setBillingSaving(true);
    try {
      await proposalsService.updateProposal(proposal.id, { post_accept_billing_mode: mode });
      toast.success("Política pós-aceite atualizada.");
      await fetchProposal();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBillingSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="text-center flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando proposta...
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="text-center">
          <p className="text-muted-foreground">Proposta não encontrada</p>
          <Button onClick={goBack} className="mt-4">
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const statusLabels: Record<string, string> = {
    draft: "Rascunho",
    sent: "Enviada",
    accepted: "Aceita",
    rejected: "Recusada",
    expired: "Expirada",
    invoiced: "Faturada",
  };

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    sent: "bg-amber-100 text-amber-800",
    accepted: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    expired: "bg-red-100 text-red-800",
    invoiced: "bg-blue-100 text-blue-800",
  };

  const canEditThis =
    user?.id && proposal.user_id && canEditRecord("proposals", proposal.user_id, user.id);

  const isTerminal = proposal.status === "rejected" || proposal.status === "expired" || proposal.status === "invoiced";
  const isInvoiced = proposal.status === "invoiced" || !!proposal.converted_invoice_id;

  const canConvertToInvoice =
    !!proposal.user_id &&
    !!user?.id &&
    canProposalConvertRecord(proposal.user_id, user.id) &&
    proposal.status === "accepted" &&
    !proposal.converted_invoice_id &&
    !!proposal.client_id;

  const canManagePublicLink =
    !!proposal.user_id &&
    !!user?.id &&
    canProposalSendRecord(proposal.user_id, user.id) &&
    (proposal.status === "draft" || proposal.status === "sent" || proposal.status === "accepted");

  const canEditBillingPolicy =
    canEditThis &&
    !isInvoiced &&
    proposal.status !== "rejected" &&
    proposal.status !== "expired";

  const canEditCommercialLines =
    !!canEditThis &&
    !isInvoiced &&
    (proposal.status === "draft" || proposal.status === "sent");

  /** Edição completa no mesmo layout da criação (rascunho ou enviada, não faturada). */
  const canOpenFullEditor = canEditCommercialLines;

  /** Publicar = enviar ao cliente (permissão de envio / link público, não só edição). */
  const canPublishDraft = canManagePublicLink && proposal.status === "draft";

  /** Link revogado (`active === false`) bloqueia; falha ao carregar meta não bloqueia se já há URL válida. */
  const canUsePublicLinkActions = Boolean(effectivePublicUrl && publicLinkMeta?.active !== false);

  const timelineLabel = (ev: { event_type: string; payload?: Record<string, unknown> }) => {
    const src = ev.payload?.source;
    switch (ev.event_type) {
      case "proposal_accepted":
        return src === "public_link" ? "Aceite pelo cliente (link público)" : "Proposta aceita (painel)";
      case "proposal_rejected":
        return src === "public_link" ? "Recusa pelo cliente (link público)" : "Proposta recusada (painel)";
      case "proposal_viewed":
        return "Visualização do link público";
      case "invoice_created":
        return "Fatura gerada";
      default:
        return ev.event_type;
    }
  };

  const itemsSubtotal = proposal.items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  const itemsLineGross = proposal.items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const itemsDiscountTotal = proposal.items.reduce((s, it) => s + (Number(it.discount) || 0), 0);

  /** Rodapé fixo só para publicar rascunho (evita duplicar com banner e menu). */
  const showMobilePublishBar = mobileFlow && canPublishDraft;

  const recipientLabel =
    proposal.client_id ? "Cliente CRM" : proposal.lead_id ? "Lead comercial" : "Destinatário";

  return (
    <div
      className={cn(
        "space-y-5 sm:space-y-6",
        showMobilePublishBar && "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]",
      )}
    >
      {chatReturnTo ? (
        <Alert className="border-primary/35 bg-primary/5">
          <Link2 className="h-4 w-4 text-primary" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-foreground/90">
              Proposta criada a partir do chat. Pode voltar à conversa para continuar o atendimento.
            </span>
            <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={() => navigate(chatReturnTo)}>
              Voltar para conversa
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
          mobileFlow &&
            "sticky top-0 z-20 -mx-4 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Button variant="outline" size="icon" className="shrink-0" onClick={goBack} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-base font-bold leading-snug sm:text-2xl">{proposal.title}</h1>
                <Badge
                  className={cn(statusColors[proposal.status] || "bg-gray-100 text-gray-800", "shrink-0 text-xs font-medium")}
                >
                  {statusLabels[proposal.status] || proposal.status}
                </Badge>
              </div>
              <div className="shrink-0 pt-0.5 md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" aria-label="Ações da proposta">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem asChild>
                      <Link to="/proposals">
                        <FileText className="mr-2 h-4 w-4" />
                        Voltar à lista
                      </Link>
                    </DropdownMenuItem>
                    {canOpenFullEditor && (
                      <DropdownMenuItem asChild>
                        <Link to={`/proposals/${proposal.id}/edit`}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar proposta
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem disabled={!canUsePublicLinkActions} onClick={() => openPublicProposalPage()}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Abrir proposta
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!canUsePublicLinkActions} onClick={() => void copyPublicUrl()}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar link
                    </DropdownMenuItem>
                    {canPublishDraft && !showMobilePublishBar && (
                      <DropdownMenuItem disabled={publishingProposal} onClick={() => void handlePublishProposal()}>
                        <Send className="mr-2 h-4 w-4" />
                        Publicar proposta
                      </DropdownMenuItem>
                    )}
                    {canConvertToInvoice && (
                      <DropdownMenuItem onClick={() => setConvertOpen(true)}>
                        <Receipt className="mr-2 h-4 w-4" />
                        Gerar fatura
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {proposal.client_id ? clientName : proposal.lead_id ? `Lead: ${clientName}` : clientName}
            </p>
          </div>
        </div>

        <div className="hidden shrink-0 flex-wrap items-center justify-end gap-2 md:flex">
            <Button variant="outline" asChild size="sm">
              <Link to="/proposals">
                <FileText className="mr-2 h-4 w-4" />
                Lista
              </Link>
            </Button>
            {canOpenFullEditor && (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to={`/proposals/${proposal.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canUsePublicLinkActions}
              title={
                publicLinkMeta?.active === false
                  ? "Link público revogado. Gere um novo na secção Faturamento, se disponível."
                  : !effectivePublicUrl
                    ? "URL do link não disponível. Verifique PROPOSAL_WEBHOOK_SECRET_KEY ou abra a proposta após criar no Kanban na mesma sessão."
                    : undefined
              }
              onClick={() => openPublicProposalPage()}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir proposta
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canUsePublicLinkActions}
              title={
                !canUsePublicLinkActions
                  ? publicLinkMeta?.active === false
                    ? "Link público revogado."
                    : "URL do link não disponível."
                  : undefined
              }
              onClick={() => void copyPublicUrl()}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copiar link
            </Button>
            {canPublishDraft && (
              <Button variant="default" size="sm" disabled={publishingProposal} onClick={() => void handlePublishProposal()}>
                {publishingProposal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Publicar
              </Button>
            )}
            {canConvertToInvoice && (
              <Button size="sm" onClick={() => setConvertOpen(true)}>
                <Receipt className="mr-2 h-4 w-4" />
                Gerar fatura
              </Button>
            )}
        </div>
      </div>

      {proposal.status === "sent" && !isInvoiced && (
        <Alert>
          <Link2 className="h-4 w-4" />
          <AlertDescription className="text-sm text-muted-foreground">
            Esta proposta está <strong>enviada</strong>. O cliente decide na <strong>página pública</strong> (atalhos na
            secção Faturamento). O painel não substitui essa decisão.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
            <User className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            Cliente
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{clientName !== "—" ? clientName : "—"}</p>
          <p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">{recipientLabel}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
            <Mail className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            Responsável
          </div>
          <p className="mt-2 break-all text-sm font-semibold leading-snug">{proposal.responsible_email || "—"}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
            <Banknote className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            Valor total
          </div>
          <p className="mt-2 text-lg font-bold tabular-nums leading-none sm:text-xl">{formatCurrency(proposal.amount)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
            <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            Validade
          </div>
          <p className="mt-2 text-sm font-semibold leading-snug">
            {proposal.valid_until ? formatDateOnlyPtBr(proposal.valid_until) : "—"}
          </p>
          {proposal.sent_date ? (
            <p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">
              Enviada em {formatDateOnlyPtBr(proposal.sent_date)}
            </p>
          ) : null}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground sm:text-xs">
        O destinatário (cliente ou lead) é definido na criação da proposta e não pode ser alterado.
      </p>

      {proposal.status === "accepted" && !isInvoiced && (
        <p className="text-sm text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
          Proposta aceita: valores e itens estão travados até a emissão da fatura. Você ainda pode ajustar observações,
          validade ou estágio no funil pela lista ou edição futura.
        </p>
      )}

      {showMobilePublishBar ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] backdrop-blur-md md:hidden">
          <Button
            className="w-full touch-manipulation"
            size="lg"
            disabled={publishingProposal}
            onClick={() => void handlePublishProposal()}
          >
            {publishingProposal ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Publicar proposta
          </Button>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 space-y-8 lg:col-span-8">
          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold tracking-tight sm:text-lg">Conteúdo comercial</h2>
              {canOpenFullEditor && (
                <Button type="button" size="sm" variant="outline" className="shrink-0" asChild>
                  <Link to={`/proposals/${proposal.id}/edit`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar conteúdo
                  </Link>
                </Button>
              )}
            </div>
            {proposal.description?.trim() ? (
              isProposalDescriptionHtml(proposal.description) ? (
                <div
                  className={cn(
                    "prose prose-sm dark:prose-invert max-w-none overflow-x-hidden break-words text-foreground/95",
                    "rounded-xl border border-border/80 bg-muted/10 px-4 py-5 sm:max-w-3xl sm:px-6 sm:py-6",
                    "[&_p]:leading-relaxed [&_p+p]:mt-3 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1 [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base",
                    "[&_img]:max-w-full [&_img]:h-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_pre]:max-w-full [&_pre]:overflow-x-auto",
                  )}
                  dangerouslySetInnerHTML={{ __html: sanitizeProposalHtml(proposal.description) }}
                />
              ) : (
                <p className="max-w-none overflow-x-hidden break-words rounded-xl border border-border/80 bg-muted/10 px-4 py-5 text-sm leading-relaxed whitespace-pre-wrap text-foreground/95 sm:max-w-3xl sm:px-6">
                  {proposal.description}
                </p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma descrição cadastrada.</p>
            )}
          </section>

          <section>
            <Card className="overflow-hidden border-border/80 shadow-sm">
              <CardHeader className="space-y-1 pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <CardTitle className={cn("text-base sm:text-lg")}>Itens e valores</CardTitle>
                  {canOpenFullEditor && (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link to={`/proposals/${proposal.id}/edit`}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar itens
                      </Link>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {proposal.items.length} {proposal.items.length === 1 ? "linha" : "linhas"}
                  {proposal.items.length > 0
                    ? ` · Soma das linhas ${formatCurrency(itemsSubtotal)}`
                    : " · total definido manualmente"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="hidden overflow-x-auto rounded-lg border md:block">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-12 gap-2 bg-muted/80 px-4 py-2.5 text-xs font-medium text-muted-foreground sm:text-sm">
                      <div className="col-span-4">Descrição</div>
                      <div className="col-span-2 text-center">Qtd</div>
                      <div className="col-span-2 text-right">Unit.</div>
                      <div className="col-span-2 text-right">Desc.</div>
                      <div className="col-span-2 text-right">Total linha</div>
                    </div>
                    {proposal.items.length === 0 ? (
                      <div className="px-4 py-8 text-sm text-muted-foreground">
                        Nenhum item cadastrado — o total vem do valor único da proposta.
                      </div>
                    ) : (
                      proposal.items.map((item, index) => (
                        <div
                          key={String(item.id ?? index)}
                          className="grid grid-cols-12 items-center gap-2 border-t px-4 py-3 text-sm"
                        >
                          <div className="col-span-4 break-words">{item.description}</div>
                          <div className="col-span-2 text-center tabular-nums">{item.quantity}</div>
                          <div className="col-span-2 text-right tabular-nums">{formatCurrency(item.unitPrice)}</div>
                          <div className="col-span-2 text-right tabular-nums">{formatCurrency(item.discount ?? 0)}</div>
                          <div className="col-span-2 text-right font-medium tabular-nums">{formatCurrency(item.total)}</div>
                        </div>
                      ))
                    )}
                    <div className="space-y-1 border-t bg-muted/25 px-4 py-3 text-sm">
                      {proposal.items.length > 0 ? (
                        <>
                          <div className="flex justify-between gap-4 tabular-nums text-muted-foreground">
                            <span>Subtotal (bruto)</span>
                            <span>{formatCurrency(itemsLineGross)}</span>
                          </div>
                          {itemsDiscountTotal > 0 ? (
                            <div className="flex justify-between gap-4 tabular-nums text-muted-foreground">
                              <span>Descontos</span>
                              <span>−{formatCurrency(itemsDiscountTotal)}</span>
                            </div>
                          ) : null}
                          <div className="flex justify-between gap-4 tabular-nums text-muted-foreground">
                            <span>Soma das linhas</span>
                            <span>{formatCurrency(itemsSubtotal)}</span>
                          </div>
                        </>
                      ) : null}
                      <div className="flex justify-between gap-4 border-t border-border/60 pt-2 text-base font-semibold tabular-nums">
                        <span>Total da proposta</span>
                        <span>{formatCurrency(proposal.amount)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 md:hidden">
                  {proposal.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum item cadastrado — o total vem do valor único da proposta.
                    </p>
                  ) : (
                    proposal.items.map((item, index) => (
                      <div
                        key={String(item.id ?? index)}
                        className="rounded-xl border border-border/80 bg-card p-3.5 text-sm shadow-sm"
                      >
                        <p className="font-medium leading-snug">{item.description}</p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>Qtd {item.quantity}</span>
                          <span>Unit. {formatCurrency(item.unitPrice)}</span>
                          {(Number(item.discount) || 0) > 0 ? (
                            <span>Desc. {formatCurrency(item.discount ?? 0)}</span>
                          ) : null}
                        </div>
                        <p className="mt-3 text-right text-base font-semibold tabular-nums">{formatCurrency(item.total)}</p>
                      </div>
                    ))
                  )}
                  <div className="space-y-1.5 rounded-xl border border-border/80 bg-muted/20 px-3 py-3 text-sm">
                    {proposal.items.length > 0 ? (
                      <>
                        <div className="flex justify-between gap-2 tabular-nums text-muted-foreground">
                          <span>Subtotal (bruto)</span>
                          <span>{formatCurrency(itemsLineGross)}</span>
                        </div>
                        {itemsDiscountTotal > 0 ? (
                          <div className="flex justify-between gap-2 tabular-nums text-muted-foreground">
                            <span>Descontos</span>
                            <span>−{formatCurrency(itemsDiscountTotal)}</span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    <div className="flex justify-between gap-2 border-t border-border/60 pt-2 font-semibold tabular-nums">
                      <span>Total</span>
                      <span>{formatCurrency(proposal.amount)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-border/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg">Faturamento e link público</CardTitle>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Política após aceite, gestão do link e vínculo com faturas.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
                  <div className="text-sm font-medium">Após aceite pelo link público</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Define o que o sistema faz quando o <strong>cliente aceita na página pública</strong>. Não altera o
                    botão <strong className="text-foreground">Gerar fatura</strong> nas ações do topo.
                  </p>
                  <div className="flex flex-col gap-2 max-w-md">
                    <Select
                      value={proposal.post_accept_billing_mode ?? "none"}
                      onValueChange={(v) => void handleBillingModeChange(v as PostAcceptBillingMode)}
                      disabled={!canEditBillingPolicy || billingSaving}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Política" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem automação (apenas timeline)</SelectItem>
                        <SelectItem value="notify_team">Notificar responsável no CRM</SelectItem>
                        <SelectItem value="auto_pending_invoice">Gerar fatura pendente automaticamente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {proposal.post_accept_billing_mode === "auto_pending_invoice" && (
                    <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                      A fatura automática usa as mesmas regras e validações do fluxo manual (gateway, dados do cliente,
                      etc.). Se falhar, o responsável recebe um aviso no CRM.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Link2 className="h-4 w-4 shrink-0" />
                    Link público para o cliente
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    O cliente abre sem login. O link acompanha a proposta (pré-visualização em rascunho). Aceite e recusa
                    pelo link só funcionam enquanto a proposta está <strong>enviada</strong>, dentro da validade e sem
                    fatura gerada.
                  </p>
                  {publicLinkMeta?.active && publicLinkMeta.created_at && (
                    <p className="text-xs text-muted-foreground">
                      Link ativo (emitido em {format(new Date(publicLinkMeta.created_at), "dd/MM/yyyy HH:mm")}).
                    </p>
                  )}
                  {lastPublicUrl && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input readOnly value={lastPublicUrl} className="min-w-0 font-mono text-xs" />
                      <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => void copyPublicUrl()}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar
                      </Button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {canManagePublicLink && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={publicLinkBusy}
                        onClick={() => void issuePublicLink()}
                      >
                        {publicLinkBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {publicLinkMeta?.active ? "Gerar novo link (revoga o anterior)" : "Gerar link público"}
                      </Button>
                    )}
                    {canManagePublicLink && publicLinkMeta?.active && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={publicLinkBusy}
                        onClick={() => void revokePublicLink()}
                      >
                        Revogar link
                      </Button>
                    )}
                  </div>
                </div>

                {!proposal.client_id && proposal.status === "accepted" && (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 dark:bg-amber-950/30 dark:border-amber-900">
                    Associe um cliente à proposta antes de gerar fatura.
                  </p>
                )}
                {isInvoiced && proposal.converted_invoice_id && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <p className="text-sm">
                      Fatura{" "}
                      <span className="font-mono font-medium">
                        {proposal.converted_invoice_number || proposal.converted_invoice_id.slice(0, 8)}
                      </span>
                    </p>
                    <Button variant="outline" size="sm" className="w-fit" asChild>
                      <Link to={`/customer-invoices/${proposal.converted_invoice_id}`}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Abrir fatura
                      </Link>
                    </Button>
                  </div>
                )}
                {!isInvoiced && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Quando a proposta estiver <strong>aceita</strong>, use <strong className="text-foreground">Gerar fatura</strong>{" "}
                    nas ações do topo (ou no menu no telemóvel) para criar uma fatura manual vinculada (campo{" "}
                    <code className="text-xs">proposal_id</code>) com cópia dos itens e totais.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <Collapsible defaultOpen={!mobileFlow} className="group rounded-xl border border-border/80 bg-card shadow-sm">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40">
              <span>Histórico e linha do tempo</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4 pt-1">
              {!proposal.timeline?.length ? (
                <p className="text-sm text-muted-foreground py-2">Nenhum evento registrado ainda.</p>
              ) : (
                <ul className="space-y-3 border-l-2 border-muted pl-4 ml-1 py-2">
                  {proposal.timeline.map((ev) => (
                    <li key={ev.id} className="text-sm relative">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                      <p className="font-medium">{timelineLabel(ev)}</p>
                      <p className="text-muted-foreground text-xs">
                        {format(new Date(ev.created_at), "dd/MM/yyyy HH:mm")}
                      </p>
                      {ev.event_type === "invoice_created" && typeof ev.payload?.invoice_id === "string" && (
                        <p className="text-xs mt-1">
                          Fatura:{" "}
                          <Link className="text-primary underline" to={`/customer-invoices/${ev.payload.invoice_id}`}>
                            {String(ev.payload.invoice_number ?? ev.payload.invoice_id).slice(0, 36)}
                          </Link>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>

        <aside className="hidden lg:col-span-4 lg:block">
          <div className="sticky top-20 space-y-4">
            <div className="rounded-xl border border-border/80 bg-muted/15 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acesso rápido</p>
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  disabled={!canUsePublicLinkActions}
                  onClick={() => openPublicProposalPage()}
                >
                  <ExternalLink className="mr-2 h-4 w-4 shrink-0" />
                  Abrir página pública
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  disabled={!canUsePublicLinkActions}
                  onClick={() => void copyPublicUrl()}
                >
                  <Copy className="mr-2 h-4 w-4 shrink-0" />
                  Copiar link
                </Button>
                <Separator className="my-1" />
                <Button type="button" variant="ghost" size="sm" className="w-full justify-start" asChild>
                  <Link to="/proposals">
                    <FileText className="mr-2 h-4 w-4 shrink-0" />
                    Todas as propostas
                  </Link>
                </Button>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Gestão completa do link (gerar / revogar) continua na secção <strong className="text-foreground/90">Faturamento</strong>{" "}
                ao lado.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {isTerminal && proposal.status !== "invoiced" && (
        <p className="text-xs text-muted-foreground">
          Proposta encerrada ({statusLabels[proposal.status]}). Alterações comerciais estão bloqueadas no backend.
        </p>
      )}

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar fatura</DialogTitle>
            <DialogDescription>
              Será criada uma fatura manual para o cliente desta proposta, com os itens e totais copiados. Esta ação só
              pode ser feita uma vez por proposta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="due-date">Vencimento da fatura</Label>
              <Input id="due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              O backend valida gateway e pré-condições do cliente como em qualquer fatura manual (CPF/CNPJ, etc.).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)} disabled={converting}>
              Cancelar
            </Button>
            <Button onClick={() => void handleConvert()} disabled={converting || !dueDate}>
              {converting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
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
};

export default ProposalDetails;
