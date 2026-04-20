import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { ContractA4Document } from "@/components/contracts/ContractA4Document";
import { contractsService } from "@/services/contracts";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Braces, Plus, Trash2 } from "lucide-react";
import type { ContractTemplate, ContractTenancyRules } from "@/types/contracts";
import { applyContractMergeFieldsToHtml } from "@/utils/contractMergeFields";
import { ContractMergeFieldsPanel } from "@/components/contracts/ContractMergeFieldsPanel";

type VarRow = ContractTemplate["variables_schema"][number];

const emptyTenancy = (): ContractTenancyRules => ({
  date_base_type: null,
  start_rule_type: "same_day",
  start_offset_days: 0,
  duration_days: null,
});

export default function ContractTemplateFormPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = !templateId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [defaultTitle, setDefaultTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentHtml, setContentHtml] = useState("<p></p>");
  const [isActive, setIsActive] = useState(true);
  const [defaultTotal, setDefaultTotal] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("BRL");
  const [tenancyRules, setTenancyRules] = useState<ContractTenancyRules>(emptyTenancy());
  const [variablesSchema, setVariablesSchema] = useState<VarRow[]>([]);

  const load = useCallback(async () => {
    if (!templateId || !user) return;
    try {
      setLoading(true);
      const t = await contractsService.getContractTemplate(templateId);
      setName(t.name);
      setDefaultTitle(t.default_title || "");
      setDescription(t.description || "");
      setContentHtml(t.content_html || "<p></p>");
      setIsActive(t.is_active);
      setDefaultTotal(
        t.default_total_value != null && Number.isFinite(Number(t.default_total_value))
          ? String(t.default_total_value)
          : "",
      );
      setDefaultCurrency(t.default_currency?.trim() || "BRL");
      setTenancyRules(
        t.tenancy_rules && typeof t.tenancy_rules === "object"
          ? {
              date_base_type: t.tenancy_rules.date_base_type ?? null,
              start_rule_type: t.tenancy_rules.start_rule_type ?? "same_day",
              start_offset_days: t.tenancy_rules.start_offset_days ?? 0,
              duration_days: t.tenancy_rules.duration_days ?? null,
            }
          : emptyTenancy(),
      );
      setVariablesSchema(Array.isArray(t.variables_schema) ? t.variables_schema : []);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível carregar o modelo");
      navigate("/contracts/templates");
    } finally {
      setLoading(false);
    }
  }, [templateId, user, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const insertField = (key: string) => {
    setContentHtml((h) => `${h}{{${key}}}`);
  };

  const addVariableRow = () => {
    setVariablesSchema((rows) => [
      ...rows,
      { key: `campo_${rows.length + 1}`, label: "Campo", type: "text", required: false },
    ]);
  };

  const updateVarRow = (i: number, patch: Partial<VarRow>) => {
    setVariablesSchema((rows) => {
      const next = [...rows];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  };

  const removeVarRow = (i: number) => {
    setVariablesSchema((rows) => rows.filter((_, j) => j !== i));
  };

  const previewHtml = useMemo(() => {
    const sampleVars: Record<string, unknown> = {};
    for (const row of variablesSchema) {
      const k = row.key?.trim();
      if (k && !k.includes(".")) sampleVars[k] = `[${row.label || k}]`;
    }
    const tv = defaultTotal.trim() ? parseFloat(defaultTotal.replace(",", ".")) : 1500;
    return applyContractMergeFieldsToHtml(contentHtml, {
      title: (defaultTitle.trim() || name.trim() || "Contrato de exemplo").slice(0, 200),
      total_value: Number.isFinite(tv) ? tv : 1500,
      currency: defaultCurrency.trim() || "BRL",
      start_date: "2026-04-16",
      end_date: "2027-04-16",
      variables: sampleVars,
      contract_number: "CONTRACT-PREVIEW-001",
      status: "DRAFT",
      created_at: new Date("2026-04-16T10:00:00"),
      updated_at: new Date("2026-04-16T10:00:00"),
      tenant: { name: "Empresa demonstração", domain: "", slug: "demo" },
      client: {
        name: "Cliente exemplo",
        email: "cliente@exemplo.com",
        phone: "+351 900 000 000",
        company: "Cliente Exemplo Lda.",
        cpf_cnpj: "12345678901",
        status: "active",
        source: "indicação",
        funnel_stage: "fechamento",
        notes: "",
      },
      operator: {
        first_name: "João",
        last_name: "Silva",
        email: "joao@empresa.com",
        whatsapp_number: "+351 910 000 000",
        company_name: "Empresa demonstração",
      },
      signerPrimary: { name: "Cliente exemplo", signed: false, signed_at: null },
    });
  }, [contentHtml, defaultTitle, name, defaultTotal, defaultCurrency, variablesSchema]);

  const buildTenancyPayload = (): ContractTenancyRules => {
    const d = tenancyRules;
    if (!d?.date_base_type || d.duration_days == null || d.duration_days < 1) {
      return null;
    }
    return {
      date_base_type: d.date_base_type,
      start_rule_type: d.start_rule_type ?? "same_day",
      start_offset_days: d.start_offset_days ?? 0,
      duration_days: d.duration_days,
    };
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nome interno do modelo é obrigatório");
      return;
    }
    const html = contentHtml?.trim() || "";
    if (!html || html === "<p></p>" || html === "<p><br></p>") {
      toast.error("O texto do contrato não pode ficar vazio");
      return;
    }
    const varsClean = variablesSchema
      .map((r) => ({
        key: r.key.trim(),
        label: r.label.trim(),
        type: r.type,
        required: !!r.required,
      }))
      .filter((r) => r.key.length > 0);
    const totalNum = defaultTotal.trim() ? parseFloat(defaultTotal.replace(",", ".")) : null;
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      default_title: defaultTitle.trim() || null,
      content_html: contentHtml,
      is_active: isActive,
      variables_schema: varsClean,
      default_total_value: totalNum != null && Number.isFinite(totalNum) ? totalNum : null,
      default_currency: defaultCurrency.trim() || "BRL",
      tenancy_rules: buildTenancyPayload(),
    };
    try {
      setSaving(true);
      if (isNew) {
        await contractsService.createContractTemplate(payload);
        toast.success("Modelo criado");
      } else if (templateId) {
        await contractsService.updateContractTemplate(templateId, payload);
        toast.success("Modelo atualizado");
      }
      navigate("/contracts/templates");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        A carregar modelo…
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/contracts/templates")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{isNew ? "Novo modelo de contrato" : "Editar modelo"}</h1>
            <p className="text-sm text-muted-foreground max-w-prose">
              Configure o texto, valor sugerido e vigência. O preview à direita simula a folha A4 com dados de
              exemplo.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/contracts/templates")} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "A guardar…" : "Guardar modelo"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2 xl:items-start">
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identificação</CardTitle>
              <CardDescription>Nome interno e título sugerido ao criar um contrato novo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="m-name">Nome interno</Label>
                <Input
                  id="m-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Prestação de serviços — padrão"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-dtitle">Título padrão do contrato</Label>
                <Input
                  id="m-dtitle"
                  value={defaultTitle}
                  onChange={(e) => setDefaultTitle(e.target.value)}
                  placeholder="Ex.: Contrato de prestação de serviços"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-desc">Descrição (opcional)</Label>
                <Textarea id="m-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="m-act" checked={isActive} onCheckedChange={setIsActive} />
                <Label htmlFor="m-act">Modelo ativo na lista ao criar contrato</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Valor padrão</CardTitle>
              <CardDescription>Preenchimento inicial no contrato; o operador pode alterar antes do congelamento.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row">
              <div className="space-y-2 flex-1">
                <Label htmlFor="m-val">Valor (número)</Label>
                <Input
                  id="m-val"
                  inputMode="decimal"
                  value={defaultTotal}
                  onChange={(e) => setDefaultTotal(e.target.value)}
                  placeholder="Ex.: 1500 ou 1500.50"
                />
              </div>
              <div className="space-y-2 w-full sm:w-36">
                <Label htmlFor="m-cur">Moeda (ISO)</Label>
                <Input
                  id="m-cur"
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
                  maxLength={8}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vigência automática</CardTitle>
              <CardDescription>
                Copiada para o contrato na criação. Com base em <strong>criação</strong>, as datas são calculadas ao
                guardar o rascunho; com base em <strong>assinatura</strong>, ao tornar-se ativo após a última
                assinatura. Se o utilizador preencher datas manualmente no contrato, essas prevalecem.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Referência temporal</Label>
                <Select
                  value={tenancyRules?.date_base_type ?? "none"}
                  onValueChange={(v) =>
                    setTenancyRules((r) => ({
                      ...(r && typeof r === "object" ? r : emptyTenancy()),
                      date_base_type: v === "none" ? null : (v as "creation_date" | "signature_date"),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem vigência automática" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vigência automática</SelectItem>
                    <SelectItem value="creation_date">Data de criação do contrato</SelectItem>
                    <SelectItem value="signature_date">Data de conclusão da assinatura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Início</Label>
                  <Select
                    value={tenancyRules?.start_rule_type ?? "same_day"}
                    onValueChange={(v) =>
                      setTenancyRules((r) => ({
                        ...(r && typeof r === "object" ? r : emptyTenancy()),
                        start_rule_type: v as "same_day" | "plus_days",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same_day">Mesmo dia da referência</SelectItem>
                      <SelectItem value="plus_days">Referência + dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-off">Dias após a referência (se “+ dias”)</Label>
                  <Input
                    id="m-off"
                    type="number"
                    min={0}
                    value={tenancyRules?.start_offset_days ?? 0}
                    onChange={(e) =>
                      setTenancyRules((r) => ({
                        ...(r && typeof r === "object" ? r : emptyTenancy()),
                        start_offset_days: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-dur">Duração (dias a partir do início)</Label>
                <Input
                  id="m-dur"
                  type="number"
                  min={1}
                  placeholder="Ex.: 365"
                  value={tenancyRules?.duration_days ?? ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setTenancyRules((r) => ({
                      ...(r && typeof r === "object" ? r : emptyTenancy()),
                      duration_days: Number.isFinite(n) && n >= 1 ? n : null,
                    }));
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Braces className="h-4 w-4" />
                Campos de mesclagem
              </CardTitle>
              <CardDescription>
                Campos do sistema, contrato, cliente, responsável e signatário (primeiro na ordem). Clique em «Inserir»
                para adicionar o placeholder ao texto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContractMergeFieldsPanel onInsert={insertField} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Braces className="h-4 w-4" />
                  Variáveis personalizadas
                </CardTitle>
                <CardDescription>
                  Chaves simples (sem ponto) preenchidas no contrato; sobrepõem aliases legados com o mesmo nome.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addVariableRow}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Linha
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {variablesSchema.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma variável personalizada.</p>
              ) : (
                <div className="space-y-2">
                  {variablesSchema.map((row, i) => (
                    <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Chave</Label>
                        <Input
                          value={row.key}
                          onChange={(e) => updateVarRow(i, { key: e.target.value.replace(/\s/g, "_") })}
                          placeholder="ex.: cliente_endereco"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Rótulo</Label>
                        <Input
                          value={row.label}
                          onChange={(e) => updateVarRow(i, { label: e.target.value })}
                          placeholder="Ex.: Endereço"
                        />
                      </div>
                      <div className="w-full sm:w-32 space-y-1">
                        <Label className="text-xs">Tipo</Label>
                        <Select
                          value={row.type}
                          onValueChange={(v) => updateVarRow(i, { type: v as VarRow["type"] })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="date">Data</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="currency">Moeda</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeVarRow(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Texto do contrato</CardTitle>
            </CardHeader>
            <CardContent>
              <RichTextEditor value={contentHtml} onChange={setContentHtml} />
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-20 space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Preview A4</h2>
            <Badge variant="secondary">Exemplo</Badge>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 sm:p-4 border">
            <ContractA4Document html={previewHtml} highlightUnresolved className="py-2" />
          </div>
          <p className="text-xs text-muted-foreground">
            Placeholders não preenchíveis no preview aparecem realçados. No contrato real, o merge usa dados do
            cliente e do contrato no momento do congelamento (e datas de assinatura na ativação, se aplicável).
          </p>
        </div>
      </div>
    </div>
  );
}
