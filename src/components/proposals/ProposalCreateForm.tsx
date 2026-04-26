import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { setStoredProposalPublicUrl } from "@/utils/proposalPublicLinkSession";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";
import { LeadSearchCombobox } from "@/components/leads/LeadSearchCombobox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ProposalItemsEditor, summarizeProposalLines } from "@/components/proposals/ProposalItemsEditor";
import { proposalsService, type Proposal, type ProposalItem, type PostAcceptBillingMode } from "@/services/proposals";
import { productsService } from "@/services/products";
import type { Product } from "@/types/products";
import { fetchFunnels } from "@/services/funnels";
import type { SalesFunnel } from "@/components/funnel/types";
import { format } from "date-fns";
import { formatDateOnlyIsoInput } from "@/utils/formatCalendarDate";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCommerceScreenLayout } from "@/components/mobile/MobileCommerceScreenLayout";
import { useMobileShellChrome } from "@/contexts/MobileShellChromeContext";

export type ProposalCreateSuccessPayload = Proposal & { public_link_path?: string | null };

export interface ProposalCreateFormProps {
  /** Painel embutido (ex.: coluna do Chat — mesmo padrão de `CustomerInvoiceNew` com `embedded`). */
  embedded?: boolean;
  /**
   * `clients.id` quando a conversa (ou lead convertido) está vinculada a cliente CRM.
   * Não enviar id de lead neste campo.
   */
  initialClientId?: string | null;
  /**
   * `leads.id` quando a conversa está só com lead (sem `client_id`).
   * Ignorado se `initialClientId` estiver definido.
   */
  initialLeadId?: string | null;
  /** Rótulo opcional (nome do lead) só para contexto na UI. */
  initialLeadName?: string | null;
  /** Sugestão de título a partir do contato (cliente/lead); usuário pode editar. */
  initialTitle?: string;
  /**
   * Quando definido (ex.: `?from=client` na rota `/proposals/new`), o cabeçalho oferece voltar ao perfil do cliente.
   */
  clientReturnPath?: string | null;
  /**
   * Quando true (ex.: abertura a partir do perfil do cliente com `?from=client`), o cliente não pode ser alterado.
   * Outros fluxos (lista, chat) continuam sem este bloqueio.
   */
  lockClientPicker?: boolean;
  /** Perfil do lead (`?from=lead`): lead pré-preenchido e não editável. */
  lockLeadPicker?: boolean;
  onBack?: () => void;
  /**
   * Quando definido (ex.: chat), substitui toast+navegação padrão após criar.
   * `setStoredProposalPublicUrl` continua sendo aplicado aqui quando há link público.
   */
  onCreated?: (created: ProposalCreateSuccessPayload, mode: "sent" | "draft") => void;
  /**
   * Etapa 3 (Kanban): rascunho existente (`getProposalById`) cujo conteúdo pré-preenche o formulário.
   */
  initialTemplateProposalId?: string | null;
  /** Edição de proposta existente (`/proposals/:id/edit`): mesmo layout da criação; destinatário fixo. */
  editProposalId?: string | null;
}

function normalizeValidUntilForInput(v: string | null | undefined): string {
  return formatDateOnlyIsoInput(v);
}

function ProposalCreateForm({
  embedded = false,
  initialClientId = null,
  initialLeadId = null,
  initialLeadName = null,
  initialTitle = "",
  clientReturnPath = null,
  lockClientPicker = false,
  lockLeadPicker = false,
  initialTemplateProposalId = null,
  editProposalId = null,
  onBack,
  onCreated,
}: ProposalCreateFormProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { setSuppressMobileBottomNav } = useMobileShellChrome();
  const { user } = useAuth();
  const { canCreate, canEditRecord, canProposalSendRecord, loading: permLoading } = useModulePermissions();

  const isEditing = Boolean(editProposalId?.trim());
  const [editLoading, setEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [editSourceProposal, setEditSourceProposal] = useState<Proposal | null>(null);

  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [proposalFunnels, setProposalFunnels] = useState<SalesFunnel[]>([]);

  const [title, setTitle] = useState(() => initialTitle?.trim() ?? "");
  const [clientId, setClientId] = useState<string | null>(() => initialClientId?.trim() || null);
  const [leadId, setLeadId] = useState<string | null>(() =>
    initialClientId?.trim() ? null : initialLeadId?.trim() || null,
  );
  const [validUntil, setValidUntil] = useState("");
  const [description, setDescription] = useState("");
  const [postAccept, setPostAccept] = useState<PostAcceptBillingMode>("none");
  const [funnelId, setFunnelId] = useState("");
  const [stageId, setStageId] = useState("");
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [standaloneAmount, setStandaloneAmount] = useState("");
  const templateAppliedForIdRef = useRef<string | null>(null);

  /** Cliente ou lead vindos do perfil ou edição: esconde alternância Cliente/Lead. */
  const hideRecipientToggle = Boolean(initialClientId?.trim()) || Boolean(lockLeadPicker) || isEditing;

  const [contactMode, setContactMode] = useState<"client" | "lead">(() =>
    initialClientId?.trim() ? "client" : initialLeadId?.trim() ? "lead" : "client",
  );

  useEffect(() => {
    if (initialClientId?.trim()) {
      setContactMode("client");
    } else if (lockLeadPicker && initialLeadId?.trim()) {
      setContactMode("lead");
    } else if (initialLeadId?.trim()) {
      setContactMode("lead");
    }
  }, [initialClientId, initialLeadId, lockLeadPicker]);

  useEffect(() => {
    const cid = initialClientId?.trim();
    if (cid) {
      setClientId(cid);
      setLeadId(null);
      return;
    }
    setClientId(null);
  }, [initialClientId]);

  useEffect(() => {
    if (initialClientId?.trim()) return;
    const lid = initialLeadId?.trim();
    setLeadId(lid ? lid : null);
  }, [initialLeadId, initialClientId]);

  const handleClientChange = useCallback((id: string | null) => {
    setClientId(id);
    if (id) {
      setLeadId(null);
      setContactMode("client");
    }
  }, []);

  const handleLeadChange = useCallback((id: string | null) => {
    setLeadId(id);
    if (id) {
      setClientId(null);
      setContactMode("lead");
    }
  }, []);

  const isLeadOnly = Boolean(leadId && !clientId);

  useEffect(() => {
    if (!isLeadOnly || postAccept !== "auto_pending_invoice") return;
    setPostAccept("none");
  }, [isLeadOnly, postAccept]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [products, funnelsRes] = await Promise.all([
          productsService.getProducts(),
          fetchFunnels(),
        ]);
        if (cancelled) return;
        setCatalog(products);
        if (funnelsRes.success && funnelsRes.data) {
          setProposalFunnels(funnelsRes.data.filter((f) => f.type === "proposals"));
        }
      } catch {
        if (!cancelled) toast.error("Erro ao carregar catálogo ou funis");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chatEmbeddedMobile = embedded && isMobile;
  /** Só no Chat mobile: o shell é interno ao form; não mexer no estado quando `embedded` é false (ex.: `NewProposal` já controla). */
  useEffect(() => {
    if (!chatEmbeddedMobile) return;
    setSuppressMobileBottomNav(true);
    return () => setSuppressMobileBottomNav(false);
  }, [chatEmbeddedMobile, setSuppressMobileBottomNav]);

  const wrapChatMobileShell = useCallback(
    (inner: ReactNode) => {
      if (!chatEmbeddedMobile) return inner;
      return (
        <MobileCommerceScreenLayout enabled className="fixed inset-0 z-[200]" header={
          <div className="flex items-center gap-2 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onBack?.()}
              aria-label="Voltar à conversa"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold">{isEditing ? "Editar proposta" : "Nova proposta"}</h1>
              {!isEditing ? (
                <p className="truncate text-xs text-muted-foreground">Desde a conversa</p>
              ) : null}
            </div>
          </div>
        }
        >
          <div className="px-2 pt-1">{inner}</div>
        </MobileCommerceScreenLayout>
      );
    },
    [chatEmbeddedMobile, isEditing, onBack],
  );

  const applyProposalToForm = useCallback((p: Proposal, titleHint?: string | null) => {
    const hint = titleHint?.trim();
    setTitle(hint || p.title || "");
    setDescription(typeof p.description === "string" ? p.description : "");
    setValidUntil(normalizeValidUntilForInput(p.valid_until));
    const rawMode = p.post_accept_billing_mode;
    const allowed: PostAcceptBillingMode[] = ["none", "notify_team", "auto_pending_invoice"];
    if (rawMode && allowed.includes(rawMode as PostAcceptBillingMode)) {
      setPostAccept(rawMode as PostAcceptBillingMode);
    } else {
      setPostAccept("none");
    }
    if (p.funnel_id) setFunnelId(p.funnel_id);
    else setFunnelId("");
    if (p.stage_id) setStageId(p.stage_id);
    else setStageId("");
    if (p.client_id?.trim()) {
      setClientId(p.client_id);
      setLeadId(null);
      setContactMode("client");
    } else if (p.lead_id?.trim()) {
      setLeadId(p.lead_id);
      setClientId(null);
      setContactMode("lead");
    }
    const rawItems = Array.isArray(p.items) ? p.items : [];
    const lineItems = rawItems.filter((it) => it && typeof (it as ProposalItem).description === "string");
    if (lineItems.length > 0) {
      setItems(
        lineItems.map((it) => {
          const row = it as ProposalItem;
          return {
            description: row.description ?? "",
            quantity: Number(row.quantity) || 0,
            unitPrice: Number(row.unitPrice) || 0,
            discount: Number(row.discount) || 0,
            total: Number(row.total) || 0,
          };
        }),
      );
      setStandaloneAmount("");
    } else {
      setItems([]);
      setStandaloneAmount(p.amount != null ? String(p.amount) : "");
    }
  }, []);

  useEffect(() => {
    const eid = editProposalId?.trim();
    if (!eid) {
      setEditSourceProposal(null);
      setEditLoadError(null);
      setEditLoading(false);
      return;
    }
    let cancelled = false;
    setEditLoading(true);
    setEditLoadError(null);
    void (async () => {
      try {
        const p = await proposalsService.getProposalById(eid);
        if (cancelled) return;
        if (p.status !== "draft" && p.status !== "sent") {
          setEditLoadError("Só é possível editar propostas em rascunho ou enviadas.");
          setEditSourceProposal(null);
          return;
        }
        setEditSourceProposal(p);
        applyProposalToForm(p, null);
      } catch (e) {
        if (!cancelled) {
          setEditLoadError(e instanceof Error ? e.message : "Erro ao carregar proposta");
          setEditSourceProposal(null);
        }
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editProposalId, applyProposalToForm]);

  useEffect(() => {
    if (editProposalId?.trim()) return;
    const tid = initialTemplateProposalId?.trim();
    if (!tid) {
      templateAppliedForIdRef.current = null;
      return;
    }
    if (templateAppliedForIdRef.current && templateAppliedForIdRef.current !== tid) {
      templateAppliedForIdRef.current = null;
    }
    if (templateAppliedForIdRef.current === tid) return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await proposalsService.getProposalById(tid);
        if (cancelled) return;
        if (p.status !== "draft") {
          toast.message("Modelo indisponível", {
            description: "O rascunho configurado não é mais válido. Continue sem modelo ou atualize a coluna no Kanban.",
          });
          templateAppliedForIdRef.current = tid;
          return;
        }
        templateAppliedForIdRef.current = tid;
        applyProposalToForm(p, initialTitle);
      } catch (e) {
        if (cancelled) return;
        templateAppliedForIdRef.current = tid;
        toast.message("Modelo indisponível", {
          description: e instanceof Error ? e.message : "Não foi possível carregar o modelo.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialTemplateProposalId, initialTitle, editProposalId, applyProposalToForm]);

  const selectedFunnel = useMemo(
    () => proposalFunnels.find((f) => f.id === funnelId),
    [proposalFunnels, funnelId]
  );

  useEffect(() => {
    if (!funnelId || !selectedFunnel?.stages?.length) {
      setStageId("");
      return;
    }
    const first = [...selectedFunnel.stages].sort((a, b) => a.order - b.order)[0];
    setStageId((prev) => {
      if (prev && selectedFunnel.stages.some((s) => s.id === prev)) return prev;
      return first?.id ?? "";
    });
  }, [funnelId, selectedFunnel]);

  const lineSummary = useMemo(() => summarizeProposalLines(items), [items]);
  const hasLines = items.length > 0;

  const effectiveAmount = hasLines ? lineSummary.total : Math.max(0, parseFloat(standaloneAmount.replace(",", ".")) || 0);

  const responsibleLabel = useMemo(() => {
    if (!user) return "—";
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    return name || user.email || "—";
  }, [user]);

  const validateBeforeCreate = useCallback((): boolean => {
    if (!title.trim()) {
      toast.error("Título é obrigatório");
      return false;
    }
    if (!hasLines) {
      if (Number.isNaN(effectiveAmount) || effectiveAmount < 0) {
        toast.error("Informe um valor total válido ou adicione linhas à proposta");
        return false;
      }
    }
    if (!clientId?.trim() && !leadId?.trim()) {
      toast.error("Selecione um cliente CRM ou um lead para vincular a proposta");
      return false;
    }
    return true;
  }, [title, hasLines, effectiveAmount, clientId, leadId]);

  const buildCreatePayload = useCallback(
    (mode: "draft" | "sent") => ({
      title: title.trim(),
      client_id: clientId?.trim() ? clientId : null,
      lead_id: clientId?.trim() ? null : leadId?.trim() ? leadId : null,
      funnel_id: funnelId || null,
      stage_id: stageId || null,
      description: description.trim() ? description : null,
      amount: effectiveAmount,
      status: mode === "sent" ? ("sent" as const) : ("draft" as const),
      sent_date: mode === "sent" ? format(new Date(), "yyyy-MM-dd") : null,
      valid_until: validUntil || null,
      items: hasLines ? items : [],
      post_accept_billing_mode: postAccept,
    }),
    [title, clientId, leadId, funnelId, stageId, description, effectiveAmount, validUntil, hasLines, items, postAccept]
  );

  const buildUpdatePayload = useCallback(
    () => ({
      title: title.trim(),
      description: description.trim() ? description : null,
      amount: effectiveAmount,
      valid_until: validUntil || null,
      funnel_id: funnelId || null,
      stage_id: stageId || null,
      items: hasLines ? items : [],
      post_accept_billing_mode: postAccept,
    }),
    [title, description, effectiveAmount, validUntil, funnelId, stageId, hasLines, items, postAccept]
  );

  const afterSuccessfulCreate = useCallback(
    (created: ProposalCreateSuccessPayload, mode: "sent" | "draft") => {
      if (created.public_link_path) {
        const full = `${window.location.origin}${created.public_link_path}`;
        setStoredProposalPublicUrl(created.id, full);
      }
      if (onCreated) {
        onCreated(created, mode);
        return;
      }
      if (mode === "sent") {
        toast.success("Proposta publicada. Link do cliente disponível; notificações de envio disparadas se configuradas.");
        navigate(`/proposals/${created.id}`);
      } else {
        toast.success("Rascunho salvo.");
        navigate("/proposals");
      }
    },
    [onCreated, navigate]
  );

  const submit = useCallback(async () => {
    if (!validateBeforeCreate()) return;

    const eid = editProposalId?.trim();
    setSaving(true);
    try {
      if (eid) {
        const ownerId = editSourceProposal?.user_id;
        if (!ownerId || !user?.id || !canProposalSendRecord(ownerId, user.id)) {
          toast.error("Sem permissão para publicar esta proposta.");
          return;
        }
        const updated = await proposalsService.updateProposal(eid, {
          ...buildUpdatePayload(),
          status: "sent",
          sent_date: format(new Date(), "yyyy-MM-dd"),
        });
        if (updated.public_link_path) {
          const full = `${window.location.origin}${updated.public_link_path}`;
          setStoredProposalPublicUrl(eid, full);
        }
        toast.success("Proposta publicada. Link disponível; notificações de envio disparadas se configuradas.");
        navigate(`/proposals/${eid}`);
      } else {
        const created = await proposalsService.createProposal(buildCreatePayload("sent"));
        afterSuccessfulCreate(created, "sent");
      }
    } catch (e) {
      const withProposal = e as Error & { code?: string; proposal?: Proposal };
      if (!eid && withProposal.code === "PROPOSAL_SENT_REQUIRES_PUBLIC_LINK" && withProposal.proposal?.id) {
        toast.message("Proposta guardada como rascunho", {
          description: withProposal.message,
        });
        navigate(`/proposals/${withProposal.proposal.id}`);
        return;
      }
      if (eid && withProposal.code === "PROPOSAL_SENT_REQUIRES_PUBLIC_LINK") {
        toast.error(withProposal.message || "Não foi possível gerar o link público.");
        return;
      }
      toast.error(e instanceof Error ? e.message : eid ? "Erro ao publicar proposta" : "Erro ao criar proposta");
    } finally {
      setSaving(false);
    }
  }, [
    validateBeforeCreate,
    editProposalId,
    editSourceProposal?.user_id,
    user?.id,
    canProposalSendRecord,
    buildUpdatePayload,
    buildCreatePayload,
    afterSuccessfulCreate,
    navigate,
  ]);

  const saveEditsOnly = useCallback(async () => {
    if (!validateBeforeCreate()) return;
    const eid = editProposalId?.trim();
    if (!eid || editSourceProposal?.status !== "sent") return;
    setSaving(true);
    try {
      await proposalsService.updateProposal(eid, buildUpdatePayload());
      toast.success("Alterações guardadas.");
      navigate(`/proposals/${eid}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar alterações");
    } finally {
      setSaving(false);
    }
  }, [validateBeforeCreate, editProposalId, editSourceProposal?.status, buildUpdatePayload, navigate]);

  const saveDraft = useCallback(async () => {
    if (!validateBeforeCreate()) return;

    const eid = editProposalId?.trim();
    setSaving(true);
    try {
      if (eid) {
        await proposalsService.updateProposal(eid, buildUpdatePayload());
        toast.success("Rascunho atualizado.");
        navigate(`/proposals/${eid}`);
      } else {
        const created = await proposalsService.createProposal(buildCreatePayload("draft"));
        afterSuccessfulCreate(created, "draft");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar rascunho");
    } finally {
      setSaving(false);
    }
  }, [validateBeforeCreate, editProposalId, buildUpdatePayload, buildCreatePayload, afterSuccessfulCreate, navigate]);

  const canUseCreateFlow = !isEditing && canCreate("proposals") && !permLoading;
  const canUseEditFlow =
    isEditing &&
    !editLoading &&
    !!editSourceProposal &&
    !!user?.id &&
    canEditRecord("proposals", editSourceProposal.user_id ?? "", user.id);
  const canUse = canUseCreateFlow || canUseEditFlow;
  const isEditDraft = isEditing && editSourceProposal?.status === "draft";
  const isEditSent = isEditing && editSourceProposal?.status === "sent";
  const canPublishInEditor =
    !isEditing ||
    (isEditDraft &&
      !!editSourceProposal?.user_id &&
      !!user?.id &&
      canProposalSendRecord(editSourceProposal.user_id, user.id));

  const mobileFlow = isMobile;
  const rootClass = embedded ? "space-y-4" : "space-y-6 max-w-5xl";

  if (isEditing && editLoading) {
    return wrapChatMobileShell(
      <div className={rootClass}>
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Carregando proposta…</p>
        </div>
      </div>,
    );
  }

  if (isEditing && editLoadError) {
    return wrapChatMobileShell(
      <div className={rootClass}>
        <p className="text-sm text-destructive">{editLoadError}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/proposals">Voltar à lista</Link>
        </Button>
      </div>,
    );
  }

  if (isEditing && editSourceProposal && user?.id && !canEditRecord("proposals", editSourceProposal.user_id ?? "", user.id)) {
    return wrapChatMobileShell(
      <div className={rootClass}>
        <p className="text-sm text-muted-foreground">Sem permissão para editar esta proposta.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to={`/proposals/${editSourceProposal.id}`}>Ver detalhe</Link>
        </Button>
      </div>,
    );
  }

  if (!isEditing && !permLoading && !canCreate("proposals")) {
    return wrapChatMobileShell(
      <div className="space-y-4">
        {embedded ? (
          <Button variant="outline" size="sm" onClick={onBack}>
            Voltar
          </Button>
        ) : clientReturnPath ? (
          <Button variant="outline" size="sm" asChild>
            <Link to={clientReturnPath}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para cliente
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link to="/proposals">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Link>
          </Button>
        )}
        <p className="text-sm text-muted-foreground">Sem permissão para criar propostas.</p>
      </div>,
    );
  }

  return wrapChatMobileShell(
    <div className={rootClass}>
      {!embedded && !mobileFlow && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            {clientReturnPath ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={clientReturnPath} aria-label="Voltar para o cliente">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar para cliente
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="icon" asChild>
                <Link to="/proposals" aria-label="Voltar à lista">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{isEditing ? "Editar proposta" : "Nova proposta"}</h1>
              <p className="text-sm text-muted-foreground">
                {isEditSent ? (
                  <>
                    Proposta <strong>enviada</strong>: alterações são guardadas sem reenviar notificações. O cliente aceita ou
                    recusa pela <strong>página pública</strong> do link.
                  </>
                ) : (
                  <>
                    <strong>Publicar proposta</strong> envia ao cliente (status <strong>Enviada</strong>, link e notificações
                    de envio se configuradas). <strong>Salvar rascunho</strong> só grava — não envia nem notifica.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {embedded && initialClientId == null && initialLeadId && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Proposta vinculada ao lead{initialLeadName ? ` «${initialLeadName}»` : ""}. Use a chave Cliente / Lead abaixo
          para trocar o destinatário. Para fatura automática após aceite público, é necessário cliente CRM.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Dados principais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="np-title">Título *</Label>
              <Input
                id="np-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Proposta de serviços — projeto X"
                required
              />
            </div>
            <div className="space-y-2">
              {!hideRecipientToggle ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border border-border/80 bg-muted/20 px-3 py-2">
                  <span className="text-sm font-medium text-foreground">Destinatário</span>
                  <ToggleGroup
                    type="single"
                    value={contactMode}
                    onValueChange={(v) => {
                      if (v !== "client" && v !== "lead") return;
                      setContactMode(v);
                      if (v === "client") {
                        setLeadId(null);
                      } else {
                        setClientId(null);
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="justify-start shrink-0"
                  >
                    <ToggleGroupItem value="client" className="px-3 text-xs sm:text-sm">
                      Cliente
                    </ToggleGroupItem>
                    <ToggleGroupItem value="lead" className="px-3 text-xs sm:text-sm">
                      Lead
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              ) : null}
              {hideRecipientToggle || contactMode === "client" ? (
                <ClientSearchCombobox
                  id="np-client"
                  label={lockClientPicker ? "Cliente CRM (fixo)" : "Cliente CRM"}
                  value={clientId}
                  onChange={handleClientChange}
                  disabled={lockClientPicker || isEditing}
                  remoteSearch
                  placeholderTrigger="Buscar cliente (nome, e-mail, telefone...)"
                />
              ) : (
                <LeadSearchCombobox
                  id="np-lead"
                  label={lockLeadPicker ? "Lead (fixo)" : "Lead"}
                  value={leadId}
                  onChange={handleLeadChange}
                  disabled={lockLeadPicker || isEditing}
                  placeholderTrigger="Buscar lead (nome, e-mail, telefone...)"
                />
              )}
              {lockClientPicker || (isEditing && clientId) ? (
                <p className="text-xs text-muted-foreground">
                  {isEditing
                    ? "O destinatário (cliente ou lead) não pode ser alterado após a criação da proposta."
                    : "Proposta para o cliente aberto no perfil; o destinatário não pode ser alterado neste fluxo."}
                </p>
              ) : null}
              {lockLeadPicker || (isEditing && leadId && !clientId) ? (
                <p className="text-xs text-muted-foreground">
                  {isEditing
                    ? "O destinatário (cliente ou lead) não pode ser alterado após a criação da proposta."
                    : "Proposta para o lead aberto no perfil; o destinatário não pode ser alterado neste fluxo."}
                </p>
              ) : null}
              {isLeadOnly ? (
                <p className="text-xs text-muted-foreground">
                  Proposta vinculada ao lead (sem cliente CRM). A opção de fatura automática após aceite fica
                  indisponível até haver cliente.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <p className="rounded-md border border-border bg-muted/40 py-2 px-3 text-sm font-medium">{responsibleLabel}</p>
              <p className="text-xs text-muted-foreground">
                O criador da proposta é o responsável registrado no sistema (e-mail comercial exibido ao cliente).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="np-valid">Validade</Label>
              <Input id="np-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Política após aceite público</Label>
              <Select value={postAccept} onValueChange={(v) => setPostAccept(v as PostAcceptBillingMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem automação (apenas timeline)</SelectItem>
                  <SelectItem value="notify_team">Notificar responsável no CRM</SelectItem>
                  <SelectItem value="auto_pending_invoice" disabled={isLeadOnly}>
                    Gerar fatura pendente automaticamente
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Aplica-se quando o cliente aceita pela página pública do link (Etapa 4).
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Funil de propostas (opcional)</Label>
              <Select value={funnelId || "__none__"} onValueChange={(v) => setFunnelId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Funil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {proposalFunnels.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedFunnel && selectedFunnel.stages.length > 0 && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Estágio</Label>
                <Select value={stageId || undefined} onValueChange={setStageId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Estágio" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...selectedFunnel.stages]
                      .sort((a, b) => a.order - b.order)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="np-desc">Descrição / conteúdo comercial</Label>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="Contexto da oferta, escopo, condições comerciais..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={cn(mobileFlow && "border-0 bg-transparent shadow-none")}>
        <CardHeader className={cn("pb-2", mobileFlow && "space-y-2 px-0 pt-0")}>
          <CardTitle className={cn("text-lg", mobileFlow && "text-base")}>Itens e serviços</CardTitle>
          {mobileFlow ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Adicione linhas ao orçamento ou use apenas o valor único abaixo.
            </p>
          ) : null}
        </CardHeader>
        <CardContent className={cn(mobileFlow && "space-y-4 p-0")}>
          {mobileFlow ? (
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linhas da proposta</h2>
          ) : null}
          <div
            className={cn(
              mobileFlow &&
                "rounded-2xl border border-border/60 bg-card/40 p-4 space-y-4 dark:bg-card/25",
            )}
          >
            <ProposalItemsEditor
              items={items}
              onChange={setItems}
              catalog={catalog}
              popoverContentClassName={mobileFlow ? "z-[260]" : undefined}
            />
          </div>
          {!hasLines && (
            <div className={cn("mt-4 max-w-xs space-y-2", mobileFlow && "max-w-none")}>
              <Label htmlFor="np-amount-only">Valor total (sem linhas detalhadas)</Label>
              <Input
                id="np-amount-only"
                type="number"
                min={0}
                step={0.01}
                value={standaloneAmount}
                onChange={(e) => setStandaloneAmount(e.target.value)}
                placeholder="0,00"
                className={cn(mobileFlow && "h-11")}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Totais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {hasLines ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal (bruto)</span>
                <span className="tabular-nums font-medium">
                  {lineSummary.gross.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descontos nas linhas</span>
                <span className="tabular-nums font-medium">
                  {lineSummary.discountSum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base">
                <span className="font-semibold">Total da proposta</span>
                <span className="tabular-nums font-bold">
                  {lineSummary.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-base">
              <span className="font-semibold">Total</span>
              <span className="tabular-nums font-bold">
                {effectiveAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {mobileFlow && (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Resumo da proposta</p>
              <p className="text-lg font-semibold tabular-nums">
                {effectiveAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{hasLines ? `${items.length} item(ns)` : "Sem linhas detalhadas"}</p>
              <p>{validUntil ? `Validade ${formatDateOnlyIsoInput(validUntil) || validUntil}` : "Sem validade definida"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className={mobileFlow ? "hidden sm:flex sm:flex-row sm:items-center gap-3 pb-10" : "flex flex-col sm:flex-row gap-3 pb-10 sm:items-center"}>
        {isEditSent ? (
          <Button
            type="button"
            size="lg"
            className="sm:min-w-[200px]"
            disabled={saving || !canUse}
            onClick={() => void saveEditsOnly()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Guardar alterações
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="lg"
              className="sm:min-w-[200px]"
              disabled={saving || !canUse || !canPublishInEditor}
              title={!canPublishInEditor && isEditDraft ? "Sem permissão para publicar (envio de propostas)" : undefined}
              onClick={() => void submit()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Publicar proposta
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="sm:min-w-[200px]"
              disabled={saving || !canUse}
              onClick={() => void saveDraft()}
            >
              Salvar rascunho
            </Button>
          </>
        )}
      </div>
      {mobileFlow && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-5xl gap-2">
            {isEditSent ? (
              <Button type="button" className="h-11 w-full" disabled={saving || !canUse} onClick={() => void saveEditsOnly()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar alterações
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  disabled={saving || !canUse}
                  onClick={() => void saveDraft()}
                >
                  Salvar rascunho
                </Button>
                <Button
                  type="button"
                  className="h-11 flex-[1.3]"
                  disabled={saving || !canUse || !canPublishInEditor}
                  title={!canPublishInEditor && isEditDraft ? "Sem permissão para publicar" : undefined}
                  onClick={() => void submit()}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Publicar proposta
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>,
  );
}

export default ProposalCreateForm;
