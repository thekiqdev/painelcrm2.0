import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ProposalItemsEditor, summarizeProposalLines } from "@/components/proposals/ProposalItemsEditor";
import {
  proposalTemplatesService,
  type ProposalTemplatePayload,
} from "@/services/proposalTemplates";
import { productsService } from "@/services/products";
import type { Product } from "@/types/products";
import { fetchFunnels } from "@/services/funnels";
import type { SalesFunnel } from "@/components/funnel/types";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import type { ProposalItem, PostAcceptBillingMode } from "@/services/proposals";

export default function ProposalTemplateFormPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canCreate, canEditRecord, loading: permLoading } = useModulePermissions();
  const isNew = !templateId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [proposalFunnels, setProposalFunnels] = useState<SalesFunnel[]>([]);
  const [templateOwnerId, setTemplateOwnerId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [defaultTitle, setDefaultTitle] = useState("");
  const [description, setDescription] = useState("");
  const [postAccept, setPostAccept] = useState<PostAcceptBillingMode>("none");
  const [funnelId, setFunnelId] = useState("");
  const [stageId, setStageId] = useState("");
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [standaloneAmount, setStandaloneAmount] = useState("");
  const [isActive, setIsActive] = useState(true);

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

  const load = useCallback(async () => {
    if (!templateId || !user) return;
    try {
      setLoading(true);
      const t = await proposalTemplatesService.getById(templateId);
      setTemplateOwnerId(t.user_id ?? null);
      setName(t.name);
      setDefaultTitle(t.default_title?.trim() ?? "");
      setDescription(typeof t.description === "string" ? t.description : "");
      const allowed: PostAcceptBillingMode[] = ["none", "notify_team", "auto_pending_invoice"];
      setPostAccept(
        t.post_accept_billing_mode && allowed.includes(t.post_accept_billing_mode)
          ? t.post_accept_billing_mode
          : "none",
      );
      setFunnelId(t.funnel_id?.trim() ?? "");
      setStageId(t.stage_id?.trim() ?? "");
      setIsActive(t.is_active !== false);
      const rawItems = Array.isArray(t.items) ? t.items : [];
      if (rawItems.length > 0) {
        setItems(
          rawItems.map((it) => {
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
        setStandaloneAmount(t.amount != null ? String(t.amount) : "");
      }
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível carregar o modelo");
      navigate("/proposals/templates");
    } finally {
      setLoading(false);
    }
  }, [templateId, user, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedFunnel = useMemo(
    () => proposalFunnels.find((f) => f.id === funnelId),
    [proposalFunnels, funnelId],
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
  const effectiveAmount = hasLines
    ? lineSummary.total
    : Math.max(0, parseFloat(standaloneAmount.replace(",", ".")) || 0);

  const canSaveNew = canCreate("proposals") && !permLoading;
  const canSaveEdit =
    !!user?.id &&
    templateOwnerId &&
    canEditRecord("proposals", templateOwnerId, user.id) &&
    !permLoading;
  const allowSave = isNew ? canSaveNew : canSaveEdit;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nome do modelo é obrigatório");
      return;
    }
    if (!hasLines) {
      if (Number.isNaN(effectiveAmount) || effectiveAmount < 0) {
        toast.error("Informe um valor total válido ou adicione linhas");
        return;
      }
    }

    const payload: ProposalTemplatePayload = {
      name: name.trim(),
      default_title: defaultTitle.trim() || null,
      description: description.trim() ? description : null,
      amount: effectiveAmount,
      items: hasLines ? items : [],
      funnel_id: funnelId.trim() || null,
      stage_id: stageId.trim() || null,
      post_accept_billing_mode: postAccept,
      is_active: isActive,
    };

    setSaving(true);
    try {
      if (isNew) {
        await proposalTemplatesService.create(payload);
        toast.success("Modelo criado");
      } else if (templateId) {
        await proposalTemplatesService.update(templateId, payload);
        toast.success("Modelo atualizado");
      }
      navigate("/proposals/templates");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (!isNew && loading) {
    return (
      <div className="flex items-center justify-center min-h-[240px] text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isNew && !permLoading && user?.id && templateOwnerId && !canEditRecord("proposals", templateOwnerId, user.id)) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Button variant="outline" size="sm" onClick={() => navigate("/proposals/templates")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <p className="text-sm text-muted-foreground">Sem permissão para editar este modelo.</p>
      </div>
    );
  }

  if (isNew && !permLoading && !canCreate("proposals")) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Button variant="outline" size="sm" onClick={() => navigate("/proposals/templates")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <p className="text-sm text-muted-foreground">Sem permissão para criar modelos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="outline" size="icon" onClick={() => navigate("/proposals/templates")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{isNew ? "Novo modelo de proposta" : "Editar modelo"}</h1>
            <p className="text-sm text-muted-foreground">
              O conteúdo abaixo pré-preenche novas propostas criadas a partir deste modelo (módulo ou Kanban do chat).
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Identificação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pt-name">Nome interno *</Label>
              <Input
                id="pt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Proposta padrão — serviços mensais"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pt-default-title">Título sugerido na proposta</Label>
              <Input
                id="pt-default-title"
                value={defaultTitle}
                onChange={(e) => setDefaultTitle(e.target.value)}
                placeholder="Ex.: Proposta comercial — [cliente]"
              />
            </div>
            <div className="space-y-2 sm:col-span-2 flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="pt-active">Modelo ativo</Label>
                <p className="text-xs text-muted-foreground">Modelos inativos não aparecem ao configurar colunas.</p>
              </div>
              <Switch id="pt-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <div className="space-y-2">
              <Label>Política após aceite público (ao criar proposta a partir do modelo)</Label>
              <Select value={postAccept} onValueChange={(v) => setPostAccept(v as PostAcceptBillingMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem automação (apenas timeline)</SelectItem>
                  <SelectItem value="notify_team">Notificar responsável no CRM</SelectItem>
                  <SelectItem value="auto_pending_invoice">Gerar fatura pendente automaticamente</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Para proposta só com lead, o fluxo de fatura automática continua exigindo cliente após conversão — mesma
                regra do módulo de propostas.
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
              <Label htmlFor="pt-desc">Descrição / conteúdo comercial</Label>
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
          <CardTitle className="text-lg">Itens e valor</CardTitle>
        </CardHeader>
        <CardContent>
          <ProposalItemsEditor items={items} onChange={setItems} catalog={catalog} />
          {!hasLines && (
            <div className="mt-4 max-w-xs space-y-2">
              <Label htmlFor="pt-amount-only">Valor total (sem linhas detalhadas)</Label>
              <Input
                id="pt-amount-only"
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
                <span className="font-semibold">Total do modelo</span>
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

      <div className="flex flex-col sm:flex-row gap-3 pb-10">
        <Button type="button" size="lg" className="sm:min-w-[200px]" disabled={saving || !allowSave} onClick={() => void handleSave()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Salvar modelo
        </Button>
      </div>
    </div>
  );
}
