import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import {
  supportPortalSettingsService,
  type SupportPortalSettingsResponse,
} from "@/services/supportPortalSettings";
import { ticketPriorityLabels, type TicketPriority } from "@/types/tickets";

function fullPublicUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export const PublicSupportPortalSettingsSection: React.FC = () => {
  const { canEdit } = useModulePermissions();
  const canSave = canEdit("tickets") || canEdit("settings");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SupportPortalSettingsResponse | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [defaultPriority, setDefaultPriority] = useState<TicketPriority>("normal");
  const [limitCategories, setLimitCategories] = useState(false);
  const [categorySelection, setCategorySelection] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await supportPortalSettingsService.get();
      setData(d);
      setEnabled(d.enabled);
      setTitle(d.title ?? "");
      setDescription(d.description ?? "");
      setWelcomeMessage(d.welcome_message ?? "");
      setLogoUrl(d.logo_url ?? "");
      setPrimaryColor(d.primary_color ?? "");
      setDefaultPriority(d.default_priority ?? "normal");
      const allowed = d.allowed_category_ids;
      const cats = d.tenant_categories ?? [];
      if (allowed == null || allowed.length === 0) {
        setLimitCategories(false);
        const sel: Record<string, boolean> = {};
        for (const c of cats) sel[c.id] = true;
        setCategorySelection(sel);
      } else {
        setLimitCategories(true);
        const sel: Record<string, boolean> = {};
        for (const c of cats) sel[c.id] = allowed.includes(c.id);
        setCategorySelection(sel);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    if (!canSave) return;
    const cats = data?.tenant_categories ?? [];
    let allowedIds: string[] | null = null;
    if (cats.length > 0) {
      if (!limitCategories) {
        allowedIds = null;
      } else {
        allowedIds = cats.filter((c) => categorySelection[c.id]).map((c) => c.id);
        if (allowedIds.length === 0) {
          toast.error("Selecione pelo menos uma categoria pública ou desative a limitação.");
          return;
        }
        if (allowedIds.length === cats.length) {
          allowedIds = null;
        }
      }
    }

    setSaving(true);
    try {
      const out = await supportPortalSettingsService.put({
        enabled,
        title: title.trim() || null,
        description: description.trim() || null,
        welcome_message: welcomeMessage.trim() || null,
        logo_url: logoUrl.trim() || null,
        primary_color: primaryColor.trim() || null,
        default_priority: defaultPriority,
        allowed_category_ids: allowedIds,
      });
      setData((prev) => ({ ...out, tenant_categories: prev?.tenant_categories ?? out.tenant_categories }));
      toast.success("Configurações guardadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  const tenantSlug = (data?.slug ?? "").trim();
  const publicPath = tenantSlug ? `/suporte/${tenantSlug.toLowerCase()}` : null;

  const copyLink = async () => {
    if (!publicPath) {
      toast.error("Defina o slug da empresa nas configurações da conta (Dados da empresa).");
      return;
    }
    const url = fullPublicUrl(publicPath);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar…
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suporte público</CardTitle>
        <CardDescription>
          Partilhe um link para os seus clientes abrirem chamados sem conta no painel. Os tickets aparecem em Suporte
          com origem &quot;Portal público&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="portal-enabled">Ativar portal</Label>
            <p className="text-sm text-muted-foreground">Quando desligado, o link público deixa de funcionar.</p>
          </div>
          <Switch id="portal-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={!canSave} />
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Label>Link público do suporte</Label>
          {publicPath ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="break-all font-mono text-xs sm:text-sm">{fullPublicUrl(publicPath)}</span>
              <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copiar link
              </Button>
              <Button type="button" size="sm" variant="secondary" asChild>
                <a href={publicPath} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  Abrir link
                </a>
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              O link será gerado automaticamente quando o slug oficial da empresa estiver definido (mínimo 2 caracteres).
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            O link usa o slug oficial da sua empresa. Para alterar, edite o slug da empresa nas configurações da conta
            (Dados da empresa).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="portal-title">Título</Label>
          <Input id="portal-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canSave} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="portal-desc">Descrição</Label>
          <Textarea id="portal-desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canSave} rows={3} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="portal-welcome">Mensagem de boas-vindas</Label>
          <Textarea
            id="portal-welcome"
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            disabled={!canSave}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="portal-logo">URL do logótipo</Label>
          <Input id="portal-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!canSave} placeholder="https://…" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="portal-color">Cor principal (#RRGGBB)</Label>
          <Input id="portal-color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} disabled={!canSave} placeholder="#6E56CF" />
        </div>
        <div className="space-y-2">
          <Label>Prioridade pré-definida no formulário</Label>
          <Select value={defaultPriority} onValueChange={(v) => setDefaultPriority(v as TicketPriority)} disabled={!canSave}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ticketPriorityLabels) as TicketPriority[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {ticketPriorityLabels[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(data?.tenant_categories?.length ?? 0) > 0 ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-row items-center justify-between gap-4">
              <div>
                <Label>Categorias públicas</Label>
                <p className="text-sm text-muted-foreground">Limite quais categorias aparecem no formulário.</p>
              </div>
              <Switch checked={limitCategories} onCheckedChange={setLimitCategories} disabled={!canSave} />
            </div>
            {limitCategories ? (
              <div className="grid gap-2 pt-2">
                {data!.tenant_categories!.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!categorySelection[c.id]}
                      onCheckedChange={(v) => setCategorySelection((prev) => ({ ...prev, [c.id]: v === true }))}
                      disabled={!canSave}
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Todas as categorias do tenant estão disponíveis no portal.</p>
            )}
          </div>
        ) : null}

        <Button type="button" onClick={() => void onSave()} disabled={!canSave || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      </CardContent>
    </Card>
  );
};
