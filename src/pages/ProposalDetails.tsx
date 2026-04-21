
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileText, ArrowLeft, Check, X, Send, Receipt, ExternalLink, Loader2, Link2, Copy } from "lucide-react";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { isProposalDescriptionHtml, sanitizeProposalHtml } from "@/utils/proposalRichText";
import {
  getStoredProposalPublicUrl,
  setStoredProposalPublicUrl,
  clearStoredProposalPublicUrl,
} from "@/utils/proposalPublicLinkSession";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import {
  proposalsService,
  Proposal,
  ProposalPublicLinkMeta,
  ProposalItem,
  PostAcceptBillingMode,
} from "@/services/proposals";
import { clientsService } from "@/services/clients";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";
import { ProposalItemsEditor, summarizeProposalLines } from "@/components/proposals/ProposalItemsEditor";
import { productsService } from "@/services/products";
import type { Product } from "@/types/products";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const { user } = useAuth();
  const { canEditRecord, canProposalSendRecord, canProposalConvertRecord } = useModulePermissions();
  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [isAcceptDialogOpen, setIsAcceptDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [dueDate, setDueDate] = useState<string>("");
  const [converting, setConverting] = useState(false);
  const [publicLinkMeta, setPublicLinkMeta] = useState<ProposalPublicLinkMeta | null>(null);
  const [publicLinkBusy, setPublicLinkBusy] = useState(false);
  const [lastPublicUrl, setLastPublicUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("resumo");
  const [billingSaving, setBillingSaving] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [itemsDraft, setItemsDraft] = useState<ProposalItem[]>([]);
  const [itemsSaving, setItemsSaving] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionSaving, setDescriptionSaving] = useState(false);

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
      setDescriptionDraft(proposalData.description ?? "");
      setItemsDraft(Array.isArray(proposalData.items) ? proposalData.items : []);
      const due = proposalData.valid_until
        ? format(new Date(proposalData.valid_until), "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd");
      setDueDate(due);

      if (proposalData.client_name?.trim()) {
        setClientName(proposalData.client_name.trim());
      } else if (proposalData.client_id) {
        const clients = await clientsService.getClients();
        const client = clients.find((c) => c.id === proposalData.client_id);
        setClientName(client?.name || "Cliente não encontrado");
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

  useEffect(() => {
    if (
      !proposal ||
      proposal.converted_invoice_id ||
      (proposal.status !== "draft" && proposal.status !== "sent")
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const products = await productsService.getProducts();
        if (!cancelled) setCatalog(products);
      } catch {
        if (!cancelled) setCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposal?.id, proposal?.status, proposal?.converted_invoice_id]);

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

  const handleAccept = async () => {
    if (!proposal) return;
    try {
      await proposalsService.updateProposal(proposal.id, { status: "accepted" });
      toast.success("Proposta aceita com sucesso!");
      setIsAcceptDialogOpen(false);
      await fetchProposal();
    } catch (error) {
      console.error("Erro ao aceitar proposta:", error);
      toast.error("Erro ao aceitar proposta");
    }
  };

  const handleReject = async () => {
    if (!proposal) return;
    try {
      await proposalsService.updateProposal(proposal.id, { status: "rejected" });
      toast.success("Proposta recusada.");
      setIsRejectDialogOpen(false);
      await fetchProposal();
    } catch (error) {
      console.error("Erro ao recusar proposta:", error);
      toast.error("Erro ao recusar proposta");
    }
  };

  const handleMarkSent = async () => {
    if (!proposal) return;
    try {
      await proposalsService.updateProposal(proposal.id, {
        status: "sent",
        sent_date: format(new Date(), "yyyy-MM-dd"),
      });
      toast.success("Proposta marcada como enviada.");
      await fetchProposal();
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível atualizar o status.");
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

  const handleClientChange = async (nextId: string | null) => {
    if (!proposal) return;
    try {
      await proposalsService.updateProposal(proposal.id, { client_id: nextId });
      toast.success("Cliente atualizado.");
      await fetchProposal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o cliente.");
    }
  };

  const handleSaveItems = async () => {
    if (!proposal) return;
    setItemsSaving(true);
    try {
      await proposalsService.updateProposal(proposal.id, { items: itemsDraft });
      toast.success("Itens e total atualizados.");
      await fetchProposal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar os itens.");
    } finally {
      setItemsSaving(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!proposal) return;
    setDescriptionSaving(true);
    try {
      const next = descriptionDraft.trim() ? descriptionDraft.trim() : null;
      await proposalsService.updateProposal(proposal.id, { description: next });
      toast.success("Descrição comercial atualizada.");
      await fetchProposal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a descrição.");
    } finally {
      setDescriptionSaving(false);
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

  const canChangeStatus =
    canEditThis &&
    !isInvoiced &&
    proposal.status !== "accepted" &&
    proposal.status !== "rejected" &&
    proposal.status !== "expired";

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

  const canEditDescription = !!canEditThis && !isInvoiced;

  /** Link revogado (`active === false`) bloqueia; falha ao carregar meta não bloqueia se já há URL válida. */
  const canUsePublicLinkActions = Boolean(effectivePublicUrl && publicLinkMeta?.active !== false);

  const itemsDraftSummary = summarizeProposalLines(itemsDraft);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="outline" size="icon" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{proposal.title}</h1>
            <p className="text-sm text-muted-foreground truncate">{clientName}</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <Badge className={statusColors[proposal.status] || "bg-gray-100 text-gray-800"}>
            {statusLabels[proposal.status] || proposal.status}
          </Badge>
          <Button variant="outline" asChild>
            <Link to="/proposals">
              <FileText className="mr-2 h-4 w-4" />
              Lista
            </Link>
          </Button>
          <Button
            type="button"
            disabled={!canUsePublicLinkActions}
            title={
              publicLinkMeta?.active === false
                ? "Link público revogado. Gere um novo na aba Faturamento, se disponível."
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
          {canEditThis && proposal.status === "draft" && (
            <Button variant="secondary" onClick={() => void handleMarkSent()}>
              <Send className="mr-2 h-4 w-4" />
              Marcar enviada
            </Button>
          )}
          {canChangeStatus && (
            <>
              <Button variant="destructive" onClick={() => setIsRejectDialogOpen(true)}>
                <X className="mr-2 h-4 w-4" />
                Recusar
              </Button>
              <Button onClick={() => setIsAcceptDialogOpen(true)}>
                <Check className="mr-2 h-4 w-4" />
                Aceitar
              </Button>
            </>
          )}
          {canConvertToInvoice && (
            <Button onClick={() => setConvertOpen(true)}>
              <Receipt className="mr-2 h-4 w-4" />
              Gerar fatura
            </Button>
          )}
        </div>
      </div>

      {proposal.status === "accepted" && !isInvoiced && (
        <p className="text-sm text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
          Proposta aceita: valores e itens estão travados até a emissão da fatura. Você ainda pode ajustar observações,
          validade ou estágio no funil pela lista ou edição futura.
        </p>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="itens">Itens e valores</TabsTrigger>
          <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Visão comercial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Cliente</p>
                {canEditCommercialLines ? (
                  <ClientSearchCombobox
                    id="proposal-client-edit"
                    value={proposal.client_id ?? null}
                    onChange={(id) => void handleClientChange(id)}
                    remoteSearch
                    selectedLabel={clientName !== "—" ? clientName : undefined}
                    placeholderTrigger="Buscar ou alterar cliente..."
                  />
                ) : (
                  <p className="font-medium">{clientName}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Responsável</p>
                  <p className="font-medium text-sm break-all">{proposal.responsible_email || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Valor total</p>
                  <p className="font-semibold text-lg">{formatCurrency(proposal.amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Validade</p>
                  <p className="font-medium">
                    {proposal.valid_until ? format(new Date(proposal.valid_until), "dd/MM/yyyy") : "—"}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {proposal.sent_date && (
                  <div>
                    <span className="text-muted-foreground">Enviada em: </span>
                    {format(new Date(proposal.sent_date), "dd/MM/yyyy")}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Itens: </span>
                  {proposal.items.length}
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-medium">Descrição / conteúdo comercial</h3>
                {canEditDescription ? (
                  <>
                    <RichTextEditor
                      value={descriptionDraft}
                      onChange={setDescriptionDraft}
                      placeholder="Contexto da oferta, escopo, condições comerciais..."
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={descriptionSaving}
                      onClick={() => void handleSaveDescription()}
                    >
                      {descriptionSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Salvar descrição
                    </Button>
                  </>
                ) : proposal.description?.trim() ? (
                  isProposalDescriptionHtml(proposal.description) ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border rounded-md p-4 bg-muted/20"
                      dangerouslySetInnerHTML={{ __html: sanitizeProposalHtml(proposal.description) }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap border rounded-md p-4 bg-muted/20">
                      {proposal.description}
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma descrição cadastrada.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="itens" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-lg">Itens / serviços</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {canEditCommercialLines ? (
                    <>
                      Rascunho: subtotal {formatCurrency(itemsDraftSummary.gross)} · total previsto{" "}
                      {formatCurrency(itemsDraftSummary.total)} · gravado: {formatCurrency(proposal.amount)}
                    </>
                  ) : (
                    <>
                      Soma das linhas: {formatCurrency(itemsSubtotal)} · Total: {formatCurrency(proposal.amount)}
                    </>
                  )}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {canEditCommercialLines && (
                <div className="mb-4 space-y-3 rounded-lg border bg-muted/20 p-4">
                  <ProposalItemsEditor items={itemsDraft} onChange={setItemsDraft} catalog={catalog} />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                    <p className="text-xs text-muted-foreground">
                      Pré-visualização: subtotal {formatCurrency(itemsDraftSummary.gross)} · descontos{" "}
                      {formatCurrency(itemsDraftSummary.discountSum)} · total{" "}
                      <span className="font-medium text-foreground">
                        {formatCurrency(itemsDraftSummary.total)}
                      </span>
                    </p>
                    <Button type="button" size="sm" disabled={itemsSaving} onClick={() => void handleSaveItems()}>
                      {itemsSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Salvar itens e total
                    </Button>
                  </div>
                </div>
              )}
              {!canEditCommercialLines && (
                <div className="rounded-md border overflow-x-auto">
                  <div className="min-w-[640px]">
                    <div className="grid grid-cols-12 bg-muted px-4 py-2 text-xs sm:text-sm font-medium gap-2">
                      <div className="col-span-4">Descrição</div>
                      <div className="col-span-2 text-center">Qtd</div>
                      <div className="col-span-2 text-right">Unit.</div>
                      <div className="col-span-2 text-right">Desc.</div>
                      <div className="col-span-2 text-right">Subtotal</div>
                    </div>
                    {proposal.items.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-muted-foreground">
                        Nenhum item cadastrado — o total vem do valor único da proposta.
                      </div>
                    ) : (
                      proposal.items.map((item, index) => (
                        <div
                          key={String(item.id ?? index)}
                          className="grid grid-cols-12 px-4 py-3 text-sm border-t gap-2 items-center"
                        >
                          <div className="col-span-4">{item.description}</div>
                          <div className="col-span-2 text-center">{item.quantity}</div>
                          <div className="col-span-2 text-right">{formatCurrency(item.unitPrice)}</div>
                          <div className="col-span-2 text-right">{formatCurrency(item.discount ?? 0)}</div>
                          <div className="col-span-2 text-right font-medium">{formatCurrency(item.total)}</div>
                        </div>
                      ))
                    )}
                    <div className="grid grid-cols-12 px-4 py-3 text-sm font-medium border-t bg-muted/50 gap-2">
                      <div className="col-span-10 text-right">Total:</div>
                      <div className="col-span-2 text-right">{formatCurrency(proposal.amount)}</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faturamento" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Faturamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="text-sm font-medium">Após aceite pelo link público</div>
                <p className="text-xs text-muted-foreground">
                  Define o que o sistema faz quando o cliente aceita pela página pública (não altera o botão &quot;Gerar
                  fatura&quot; no painel). Aceite feito só por você no CRM segue sem disparar estes gatilhos.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 max-w-md">
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
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    A fatura automática usa as mesmas regras e validações do fluxo manual (gateway, dados do cliente,
                    etc.). Se falhar, o responsável recebe um aviso no CRM.
                  </p>
                )}
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="h-4 w-4" />
                  Link público para o cliente
                </div>
                <p className="text-xs text-muted-foreground">
                  O cliente abre sem login. O link é criado automaticamente com a proposta (pré-visualização em rascunho).
                  Aceite e recusa pelo link só funcionam enquanto a proposta está <strong>enviada</strong>, dentro da
                  validade e sem fatura gerada.
                </p>
                {publicLinkMeta?.active && publicLinkMeta.created_at && (
                  <p className="text-xs text-muted-foreground">
                    Link ativo (emitido em {format(new Date(publicLinkMeta.created_at), "dd/MM/yyyy HH:mm")}).
                  </p>
                )}
                {lastPublicUrl && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input readOnly value={lastPublicUrl} className="font-mono text-xs" />
                    <Button type="button" variant="secondary" size="sm" onClick={() => void copyPublicUrl()}>
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
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Associe um cliente à proposta antes de gerar fatura.
                </p>
              )}
              {isInvoiced && proposal.converted_invoice_id && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <p className="text-sm">
                    Fatura{" "}
                    <span className="font-mono font-medium">
                      {proposal.converted_invoice_number || proposal.converted_invoice_id.slice(0, 8)}
                    </span>
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/customer-invoices/${proposal.converted_invoice_id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Abrir fatura
                    </Link>
                  </Button>
                </div>
              )}
              {!isInvoiced && (
                <p className="text-sm text-muted-foreground">
                  Quando a proposta estiver <strong>aceita</strong>, use &quot;Gerar fatura&quot; no topo para criar uma
                  fatura manual vinculada (campo <code className="text-xs">proposal_id</code>) com cópia dos itens e
                  totais.
                </p>
              )}
              {canConvertToInvoice && (
                <Button onClick={() => setConvertOpen(true)}>
                  <Receipt className="mr-2 h-4 w-4" />
                  Gerar fatura a partir desta proposta
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Linha do tempo</CardTitle>
            </CardHeader>
            <CardContent>
              {!proposal.timeline?.length ? (
                <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
              ) : (
                <ul className="space-y-3 border-l-2 border-muted pl-4 ml-1">
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isTerminal && proposal.status !== "invoiced" && (
        <p className="text-xs text-muted-foreground">
          Proposta encerrada ({statusLabels[proposal.status]}). Alterações comerciais estão bloqueadas no backend.
        </p>
      )}

      <Dialog open={isAcceptDialogOpen} onOpenChange={setIsAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aceitar proposta</DialogTitle>
            <DialogDescription>
              A proposta passará para aceita e os valores ficarão protegidos até a geração da fatura.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-1 text-sm">
            <p className="font-medium">{proposal.title}</p>
            <p className="text-muted-foreground">Cliente: {clientName}</p>
            <p className="text-muted-foreground">Valor: {formatCurrency(proposal.amount)}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAcceptDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleAccept()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar proposta</DialogTitle>
            <DialogDescription>A proposta será marcada como recusada.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-1 text-sm">
            <p className="font-medium">{proposal.title}</p>
            <p className="text-muted-foreground">Cliente: {clientName}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void handleReject()}>
              Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
