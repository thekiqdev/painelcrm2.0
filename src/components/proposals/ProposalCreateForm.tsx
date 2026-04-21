import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";

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
}

function normalizeValidUntilForInput(v: string | null | undefined): string {
  if (!v) return "";
  const d = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function ProposalCreateForm({
  embedded = false,
  initialClientId = null,
  initialLeadId = null,
  initialLeadName = null,
  initialTitle = "",
  clientReturnPath = null,
  initialTemplateProposalId = null,
  onBack,
  onCreated,
}: ProposalCreateFormProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canCreate, loading: permLoading } = useModulePermissions();

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

  /** Perfil do cliente (`from=client`): só vínculo CRM; sem alternar para lead. */
  const lockToClientOnly = Boolean(initialClientId?.trim());

  const [contactMode, setContactMode] = useState<"client" | "lead">(() =>
    lockToClientOnly ? "client" : initialLeadId?.trim() ? "lead" : "client",
  );

  useEffect(() => {
    if (lockToClientOnly) {
      setContactMode("client");
    } else if (initialLeadId?.trim()) {
      setContactMode("lead");
    }
  }, [lockToClientOnly, initialLeadId]);

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

  useEffect(() => {
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
        const hint = initialTitle?.trim();
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
  }, [initialTemplateProposalId, initialTitle]);

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
        toast.success("Proposta enviada. Link do cliente já está disponível.");
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

    setSaving(true);
    try {
      const created = await proposalsService.createProposal(buildCreatePayload("sent"));
      afterSuccessfulCreate(created, "sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar proposta");
    } finally {
      setSaving(false);
    }
  }, [validateBeforeCreate, buildCreatePayload, afterSuccessfulCreate]);

  const saveDraft = useCallback(async () => {
    if (!validateBeforeCreate()) return;

    setSaving(true);
    try {
      const created = await proposalsService.createProposal(buildCreatePayload("draft"));
      afterSuccessfulCreate(created, "draft");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar rascunho");
    } finally {
      setSaving(false);
    }
  }, [validateBeforeCreate, buildCreatePayload, afterSuccessfulCreate]);

  const canUse = canCreate("proposals") && !permLoading;

  if (!permLoading && !canCreate("proposals")) {
    return (
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
      </div>
    );
  }

  const rootClass = embedded ? "space-y-4" : "space-y-6 max-w-5xl";

  return (
    <div className={rootClass}>
      {!embedded && (
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
              <h1 className="text-2xl font-bold truncate">Nova proposta</h1>
              <p className="text-sm text-muted-foreground">
                <strong>Criar proposta</strong> gera a proposta como <strong>enviada</strong> (com data de envio de hoje) e
                link público automático. <strong>Salvar como rascunho</strong> mantém rascunho; aceite e recusa pelo link
                público exigem proposta enviada.
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
              {!lockToClientOnly ? (
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
              {lockToClientOnly || contactMode === "client" ? (
                <ClientSearchCombobox
                  id="np-client"
                  label="Cliente CRM"
                  value={clientId}
                  onChange={handleClientChange}
                  remoteSearch
                  placeholderTrigger="Buscar cliente (nome, e-mail, telefone...)"
                />
              ) : (
                <LeadSearchCombobox
                  id="np-lead"
                  label="Lead"
                  value={leadId}
                  onChange={handleLeadChange}
                  placeholderTrigger="Buscar lead (nome, e-mail, telefone...)"
                />
              )}
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Itens da proposta</CardTitle>
        </CardHeader>
        <CardContent>
          <ProposalItemsEditor items={items} onChange={setItems} catalog={catalog} />
          {!hasLines && (
            <div className="mt-4 max-w-xs space-y-2">
              <Label htmlFor="np-amount-only">Valor total (sem linhas detalhadas)</Label>
              <Input
                id="np-amount-only"
                type="number"
                min={0}
                step={0.01}
                value={standaloneAmount}
                onChange={(e) => setStandaloneAmount(e.target.value)}
                placeholder="0,00"
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

      <div className="flex flex-col sm:flex-row gap-3 pb-10 sm:items-center">
        <Button type="button" size="lg" className="sm:min-w-[200px]" disabled={saving || !canUse} onClick={() => void submit()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Criar proposta
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="sm:min-w-[200px]"
          disabled={saving || !canUse}
          onClick={() => void saveDraft()}
        >
          Salvar como rascunho
        </Button>
      </div>
    </div>
  );
}

export default ProposalCreateForm;
