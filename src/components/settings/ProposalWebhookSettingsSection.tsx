import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import {
  getProposalWebhookSettings,
  putProposalWebhookSettings,
  type ProposalWebhookEventKey,
} from "@/services/proposalWebhookSettings";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { Loader2 } from "lucide-react";

const EVENT_LABELS: Record<ProposalWebhookEventKey, string> = {
  "proposal.public_accepted": "Aceite público (link)",
  "proposal.public_rejected": "Recusa pública (link)",
  "proposal.invoiced": "Proposta convertida em fatura",
};

export function ProposalWebhookSettingsSection() {
  const { canProposalManageIntegrations } = useModulePermissions();
  const canManage = canProposalManageIntegrations();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [encryptionConfigured, setEncryptionConfigured] = useState(false);
  const [allowedKeys, setAllowedKeys] = useState<ProposalWebhookEventKey[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<Set<ProposalWebhookEventKey>>(new Set());
  const [secret, setSecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getProposalWebhookSettings();
      setEncryptionConfigured(r.encryption_configured);
      setAllowedKeys(r.allowed_event_keys);
      const s = r.settings;
      setEnabled(s?.enabled ?? false);
      setUrl(s?.webhook_url ?? "");
      setHasSecret(s?.has_secret ?? false);
      setSelected(new Set((s?.event_keys ?? []) as ProposalWebhookEventKey[]));
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) void load();
  }, [canManage]);

  const toggleKey = (k: ProposalWebhookEventKey) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await putProposalWebhookSettings({
        enabled,
        webhook_url: url.trim() || null,
        event_keys: Array.from(selected),
        secret: secret.trim() || null,
      });
      toast.success("Configuração salva.");
      setSecret("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Webhooks — Propostas</CardTitle>
          <CardDescription>
            Apenas perfis com permissão <strong>integrações de propostas</strong> (administradores do módulo) podem
            alterar esta configuração.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando…
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhooks — Propostas</CardTitle>
        <CardDescription>
          Envio assinado (HMAC-SHA256) para o seu endpoint quando ocorrem aceite/recusa públicos ou faturamento. Falhas
          são reprocessadas automaticamente (até 5 tentativas com backoff). O servidor precisa da variável{" "}
          <code className="text-xs">PROPOSAL_WEBHOOK_SECRET_KEY</code> para cifrar o secret.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-xl">
        {!encryptionConfigured && (
          <p className="text-sm text-amber-800 dark:text-amber-200 border border-amber-200 rounded-md px-3 py-2">
            O backend não está com criptografia configurada (chave curta ou ausente). Não é possível guardar o secret até
            o administrador da infraestrutura definir <code className="text-xs">PROPOSAL_WEBHOOK_SECRET_KEY</code> com
            pelo menos 16 caracteres.
          </p>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="wh-enabled">Integração ativa</Label>
            <p className="text-xs text-muted-foreground">Só envia quando habilitado e URL/secret válidos.</p>
          </div>
          <Switch id="wh-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wh-url">URL do webhook (HTTPS)</Label>
          <Input
            id="wh-url"
            placeholder="https://api.seudominio.com/webhooks/painelcrm/proposals"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Eventos</Label>
          <div className="space-y-2 rounded-md border p-3">
            {allowedKeys.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={selected.has(k)} onCheckedChange={() => toggleKey(k)} />
                {EVENT_LABELS[k]}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wh-secret">Secret (HMAC)</Label>
          <Input
            id="wh-secret"
            type="password"
            autoComplete="new-password"
            placeholder={hasSecret ? "•••••••• (deixe em branco para manter)" : "Mínimo 8 caracteres"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            O secret não é exibido depois de salvo. Para rotacionar, informe um novo valor e salve.
          </p>
        </div>

        <Button type="button" onClick={() => void handleSave()} disabled={saving || !encryptionConfigured}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Salvando…
            </>
          ) : (
            "Salvar"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
