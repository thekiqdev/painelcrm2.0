import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Flag,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from 'lucide-react';
import { apiClient } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DEFAULT_COLLECTION_POLICY_FORM,
  buildActionsAfterFail,
  buildCollectionPolicyPreview,
  normalizePolicyFromApi,
  validateCollectionPolicyForm,
  type CollectionPolicyFormValues,
} from '@/lib/billing2/collectionPolicyForm';

type PolicyApiResponse = {
  policy: CollectionPolicyFormValues;
  source: 'database' | 'memory_default';
  legacy_auto_suspend_setting?: boolean;
  policy_row_id?: string;
  policy_version?: number;
  updated_at?: string;
  updated_by?: string | null;
  last_audit_id?: string | null;
  warning?: string;
};

type DestructiveToggle = 'auto_suspend_enabled' | 'auto_cancel_enabled';

/**
 * Financeiro → Cobrança Automática (Billing 2.0 Sprint 4 / PRD §7).
 * Persiste Collection Policy; engine consome no próximo evento se flag ON.
 */
export default function SuperAdminBilling2CollectionPolicyPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CollectionPolicyFormValues>(DEFAULT_COLLECTION_POLICY_FORM);
  const [meta, setMeta] = useState<{
    source: string;
    version?: number;
    updated_at?: string;
    updated_by?: string | null;
    last_audit_id?: string | null;
    warning?: string;
    legacy_auto_suspend?: boolean;
  } | null>(null);
  const [pendingDestructive, setPendingDestructive] = useState<DestructiveToggle | null>(null);

  const preview = useMemo(() => buildCollectionPolicyPreview(form), [form]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<PolicyApiResponse>('/api/superadmin/billing/collection-policy');
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível carregar a Cobrança Automática.');
      setLoading(false);
      return;
    }
    setForm(normalizePolicyFromApi(res.data.policy));
    setMeta({
      source: res.data.source,
      version: res.data.policy_version,
      updated_at: res.data.updated_at,
      updated_by: res.data.updated_by,
      last_audit_id: res.data.last_audit_id ?? null,
      warning: res.data.warning,
      legacy_auto_suspend: res.data.legacy_auto_suspend_setting,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setBool = (key: keyof CollectionPolicyFormValues, value: boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setNum = (key: keyof CollectionPolicyFormValues, raw: string) => {
    const n = parseInt(raw, 10);
    setForm((prev) => ({
      ...prev,
      [key]: Number.isFinite(n) ? n : prev[key],
    }));
  };

  const requestDestructiveToggle = (key: DestructiveToggle, next: boolean) => {
    if (next && !form[key]) {
      setPendingDestructive(key);
      return;
    }
    setBool(key, next);
  };

  const confirmDestructive = () => {
    if (pendingDestructive) setBool(pendingDestructive, true);
    setPendingDestructive(null);
  };

  const restoreDefaults = () => {
    setForm({ ...DEFAULT_COLLECTION_POLICY_FORM });
    toast.message('Formulário restaurado para o padrão PRD. Clique em Salvar para gravar.');
  };

  const save = async () => {
    const validation = validateCollectionPolicyForm(form);
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }

    const payload: CollectionPolicyFormValues = {
      ...form,
      schema_version: 1,
      actions_after_fail: buildActionsAfterFail(form),
    };

    setSaving(true);
    const res = await apiClient.put<PolicyApiResponse>('/api/superadmin/billing/collection-policy', payload);
    setSaving(false);
    if (res.error) {
      const status = (res.details as { status?: number } | undefined)?.status;
      if (status === 403) {
        toast.error('Sem permissão para alterar a Cobrança Automática (403).');
      } else {
        toast.error(res.error);
      }
      return;
    }
    toast.success('Cobrança Automática salva.');
    if (res.data) {
      setForm(normalizePolicyFromApi(res.data.policy));
      setMeta({
        source: res.data.source,
        version: res.data.policy_version,
        updated_at: res.data.updated_at,
        updated_by: res.data.updated_by,
        last_audit_id: res.data.last_audit_id ?? null,
        legacy_auto_suspend: res.data.legacy_auto_suspend_setting,
      });
    } else {
      void load();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/superadmin/financeiro">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Financeiro
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cobrança Automática</h1>
          <p className="mt-1 text-muted-foreground">
            Collection Policy global: renovação, tentativas, canais e dunning (PRD §7).
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/superadmin/billing/feature-flags">
            <Flag className="mr-2 h-4 w-4" />
            Feature Flags
          </Link>
        </Button>
      </div>

      {meta?.warning && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          {meta.warning}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" />
            Política de cobrança
          </CardTitle>
          <CardDescription>
            Alterações passam a valer no próximo evento interpretado pelo engine (se{' '}
            <code className="text-xs">collection_policy_engine_enabled</code> estiver ON). Defaults
            destrutivos permanecem OFF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Renovação</h2>
                <ToggleRow
                  id="renew_card"
                  label="Renovar cartão automaticamente"
                  hint="Tenta captura com token na renovação (requer Feature Flag + Sprint 9)."
                  checked={form.renew_card_auto}
                  onCheckedChange={(v) => setBool('renew_card_auto', v)}
                />
                <ToggleRow
                  id="generate_pix"
                  label="Gerar PIX automaticamente"
                  hint="Cria cobrança PIX avulsa na renovação (comportamento atual = ON)."
                  checked={form.generate_pix_auto}
                  onCheckedChange={(v) => setBool('generate_pix_auto', v)}
                />
                <ToggleRow
                  id="pix_auto"
                  label="PIX Recorrente (Pix Automático)"
                  hint="Débito PIX autorizado (capability do gateway ativo) — default OFF."
                  checked={form.pix_automatic_enabled}
                  onCheckedChange={(v) => setBool('pix_automatic_enabled', v)}
                />
              </section>

              <Separator />

              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Tentativas</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    id="max_attempts"
                    label="Tentativas máximas"
                    value={form.max_attempts}
                    min={1}
                    max={20}
                    onChange={(v) => setNum('max_attempts', v)}
                  />
                  <NumberField
                    id="attempt_interval"
                    label="Intervalo entre tentativas (dias)"
                    value={form.attempt_interval_days}
                    min={1}
                    max={30}
                    onChange={(v) => setNum('attempt_interval_days', v)}
                  />
                  <NumberField
                    id="grace"
                    label="Grace period (dias)"
                    value={form.grace_period_days}
                    min={0}
                    max={90}
                    onChange={(v) => setNum('grace_period_days', v)}
                  />
                </div>
              </section>

              <Separator />

              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Inadimplência</h2>
                <ToggleRow
                  id="auto_suspend"
                  label="Suspender automaticamente"
                  hint={`Após ${form.suspend_after_days} dia(s) de inadimplência (também exige Feature Flag auto_suspend).`}
                  checked={form.auto_suspend_enabled}
                  onCheckedChange={(v) => requestDestructiveToggle('auto_suspend_enabled', v)}
                  destructive
                />
                <NumberField
                  id="suspend_days"
                  label="Suspender após (dias)"
                  value={form.suspend_after_days}
                  min={0}
                  max={365}
                  onChange={(v) => setNum('suspend_after_days', v)}
                />
                <ToggleRow
                  id="auto_cancel"
                  label="Cancelar automaticamente"
                  hint={`Após ${form.cancel_after_days} dia(s) (também exige Feature Flag auto_cancel).`}
                  checked={form.auto_cancel_enabled}
                  onCheckedChange={(v) => requestDestructiveToggle('auto_cancel_enabled', v)}
                  destructive
                />
                <NumberField
                  id="cancel_days"
                  label="Cancelar após (dias)"
                  value={form.cancel_after_days}
                  min={0}
                  max={730}
                  onChange={(v) => setNum('cancel_after_days', v)}
                />
              </section>

              <Separator />

              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Notificações e recuperação</h2>
                <ToggleRow
                  id="wa"
                  label="Enviar WhatsApp"
                  checked={form.notify_whatsapp}
                  onCheckedChange={(v) => setBool('notify_whatsapp', v)}
                />
                <ToggleRow
                  id="email"
                  label="Enviar e-mail"
                  checked={form.notify_email}
                  onCheckedChange={(v) => setBool('notify_email', v)}
                />
                <ToggleRow
                  id="pix_after_fail"
                  label="Gerar novo PIX após falha de cartão"
                  checked={form.generate_pix_after_failure}
                  onCheckedChange={(v) => setBool('generate_pix_after_failure', v)}
                />
                <ToggleRow
                  id="reactivate"
                  label="Reativar automaticamente após pagamento"
                  checked={form.reactivate_on_paid}
                  onCheckedChange={(v) => setBool('reactivate_on_paid', v)}
                />
              </section>

              <Separator />

              <section className="space-y-2 rounded-md border bg-muted/40 p-4">
                <h2 className="text-sm font-semibold text-foreground">Preview</h2>
                <p className="text-sm text-muted-foreground">{preview}</p>
              </section>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void save()} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
                <Button type="button" variant="outline" onClick={restoreDefaults} disabled={saving}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar padrão
                </Button>
              </div>

              {meta && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">Fonte: {meta.source}</Badge>
                  {meta.version != null && <Badge variant="outline">v{meta.version}</Badge>}
                  {meta.updated_by && <span>Por: {meta.updated_by}</span>}
                  {meta.updated_at && (
                    <span>· {new Date(meta.updated_at).toLocaleString('pt-BR')}</span>
                  )}
                  {meta.last_audit_id && <span>· audit: {meta.last_audit_id}</span>}
                  {meta.legacy_auto_suspend != null && (
                    <span>· setting legado auto_suspend: {meta.legacy_auto_suspend ? 'ON' : 'OFF'}</span>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingDestructive != null}
        onOpenChange={(open) => {
          if (!open) setPendingDestructive(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Ativar automação destrutiva?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDestructive === 'auto_suspend_enabled'
                ? 'Suspensão automática pode bloquear o acesso do tenant por inadimplência. A Feature Flag billing2.auto_suspend também precisa estar ON para executar.'
                : 'Cancelamento automático encerra a assinatura após o limiar. A Feature Flag billing2.auto_cancel também precisa estar ON para executar.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDestructive}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ToggleRow(props: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  destructive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={props.id} className="text-base">
          {props.label}
          {props.destructive ? (
            <Badge variant="destructive" className="ml-2 align-middle text-[10px]">
              destrutivo
            </Badge>
          ) : null}
        </Label>
        {props.hint ? <p className="text-sm text-muted-foreground">{props.hint}</p> : null}
      </div>
      <Switch id={props.id} checked={props.checked} onCheckedChange={props.onCheckedChange} />
    </div>
  );
}

function NumberField(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}
