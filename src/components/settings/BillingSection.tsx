
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { Loader2 } from "lucide-react";
import { getMyTenantBillingPreferences, putMyTenantBillingPreferences } from "@/services/tenantBillingPreferences";

interface TimezoneOption {
  value: string;
  label: string;
}

const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo (Brasília)" },
  { value: "America/Manaus", label: "America/Manaus" },
  { value: "America/Fortaleza", label: "America/Fortaleza" },
  { value: "America/Recife", label: "America/Recife" },
  { value: "America/Belem", label: "America/Belem" },
  { value: "America/Noronha", label: "America/Noronha" },
  { value: "America/Cuiaba", label: "America/Cuiaba" },
  { value: "America/Bahia", label: "America/Bahia" },
  { value: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires" },
  { value: "America/Santiago", label: "America/Santiago" },
  { value: "America/Bogota", label: "America/Bogota" },
  { value: "America/Mexico_City", label: "America/Mexico_City" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Chicago", label: "America/Chicago" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "Europe/Lisbon", label: "Europe/Lisbon" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Madrid", label: "Europe/Madrid" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "UTC", label: "UTC" },
];

const HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeHhMm(value: string): string {
  return value.trim().slice(0, 5);
}

export const BillingSection: React.FC = () => {
  const { canEdit } = useModulePermissions();
  const canSave = canEdit("settings");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [recurringGenerateTimeLocal, setRecurringGenerateTimeLocal] = useState("09:00");
  const [invoiceNotifySameAsGeneration, setInvoiceNotifySameAsGeneration] = useState(true);
  const [invoiceNotifyTimeLocal, setInvoiceNotifyTimeLocal] = useState("09:00");
  const [recurringInvoiceGenerateDaysBeforeDue, setRecurringInvoiceGenerateDaysBeforeDue] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const timezoneOptions = useMemo(() => {
    if (!timezone || TIMEZONE_OPTIONS.some((tz) => tz.value === timezone)) return TIMEZONE_OPTIONS;
    return [{ value: timezone, label: `${timezone} (atual)` }, ...TIMEZONE_OPTIONS];
  }, [timezone]);
  const timezoneValues = useMemo(() => new Set(timezoneOptions.map((tz) => tz.value)), [timezoneOptions]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getMyTenantBillingPreferences();
      if (res.error || !res.data) {
        setLoadError(res.error ?? "Não foi possível carregar as preferências de faturamento.");
        return;
      }
      const data = res.data;
      const resolvedTimezone = data.timezone ?? data.defaults?.timezone ?? "America/Sao_Paulo";
      const resolvedGenerate = data.recurring_generate_time_local ?? data.defaults?.recurring_generate_time_local ?? "09:00";
      const resolvedSame =
        typeof data.invoice_notify_same_as_generation === "boolean"
          ? data.invoice_notify_same_as_generation
          : (data.defaults?.invoice_notify_same_as_generation ?? true);
      const resolvedNotify =
        data.invoice_notify_time_local ??
        data.defaults?.invoice_notify_time_local ??
        resolvedGenerate;
      const resolvedDays =
        typeof data.recurring_invoice_generate_days_before_due === "number"
          ? data.recurring_invoice_generate_days_before_due
          : (data.defaults?.recurring_invoice_generate_days_before_due ?? 0);

      setTimezone(resolvedTimezone);
      setRecurringGenerateTimeLocal(normalizeHhMm(resolvedGenerate));
      setInvoiceNotifySameAsGeneration(resolvedSame);
      setInvoiceNotifyTimeLocal(normalizeHhMm(resolvedNotify));
      setRecurringInvoiceGenerateDaysBeforeDue(Math.min(60, Math.max(0, Math.trunc(resolvedDays))));
      setFieldErrors({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    const generate = normalizeHhMm(recurringGenerateTimeLocal);
    const notify = normalizeHhMm(invoiceNotifyTimeLocal);

    if (!timezone || !timezoneValues.has(timezone)) {
      nextErrors.timezone = "Selecione um timezone válido da lista.";
    }
    if (!HH_MM_REGEX.test(generate)) {
      nextErrors.recurring_generate_time_local = "Informe um horário válido no formato HH:mm.";
    }
    if (!invoiceNotifySameAsGeneration && !HH_MM_REGEX.test(notify)) {
      nextErrors.invoice_notify_time_local = "Informe o horário de notificação no formato HH:mm.";
    }
    const days = Math.trunc(Number(recurringInvoiceGenerateDaysBeforeDue));
    if (!Number.isFinite(days) || days < 0 || days > 60) {
      nextErrors.recurring_invoice_generate_days_before_due = "Informe um número inteiro entre 0 e 60.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      toast.error("Sem permissão para alterar configurações.");
      return;
    }
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        timezone,
        recurring_generate_time_local: normalizeHhMm(recurringGenerateTimeLocal),
        invoice_notify_same_as_generation: invoiceNotifySameAsGeneration,
        invoice_notify_time_local: invoiceNotifySameAsGeneration ? null : normalizeHhMm(invoiceNotifyTimeLocal),
        recurring_invoice_generate_days_before_due: Math.min(60, Math.max(0, Math.trunc(Number(recurringInvoiceGenerateDaysBeforeDue)))),
      };
      const res = await putMyTenantBillingPreferences(payload);
      if (res.error || !res.data) {
        toast.error(res.error ?? "Não foi possível salvar as preferências.");
        return;
      }

      const saved = res.data;
      setTimezone(saved.timezone ?? timezone);
      setRecurringGenerateTimeLocal(
        normalizeHhMm(saved.recurring_generate_time_local ?? payload.recurring_generate_time_local)
      );
      setInvoiceNotifySameAsGeneration(saved.invoice_notify_same_as_generation ?? payload.invoice_notify_same_as_generation);
      setInvoiceNotifyTimeLocal(
        normalizeHhMm(saved.invoice_notify_time_local ?? saved.effective?.invoice_notify_time_local ?? payload.recurring_generate_time_local)
      );
      const savedDays =
        typeof saved.recurring_invoice_generate_days_before_due === "number"
          ? saved.recurring_invoice_generate_days_before_due
          : (saved.effective?.recurring_invoice_generate_days_before_due ?? payload.recurring_invoice_generate_days_before_due);
      setRecurringInvoiceGenerateDaysBeforeDue(Math.min(60, Math.max(0, Math.trunc(savedDays))));
      setFieldErrors({});
      toast.success("Preferências de recorrência salvas.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar preferências de faturamento…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Faturas recorrentes por tenant</CardTitle>
        <CardDescription>
          Configure o fuso e horários usados na recorrência de faturas da sua empresa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id="billing-preferences-form" className="space-y-5" onSubmit={handleSubmit}>
          {loadError ? (
            <Alert variant="destructive">
              <AlertTitle>Falha ao carregar configurações</AlertTitle>
              <AlertDescription>
                {loadError}
                <div className="mt-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                    Tentar novamente
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {!canSave ? (
            <Alert>
              <AlertTitle>Só leitura</AlertTitle>
              <AlertDescription>
                O seu perfil pode visualizar esta secção, mas apenas utilizadores com permissão de edição em
                Configurações podem alterar estes campos.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="billing-timezone">Timezone da empresa</Label>
            <Select value={timezone} onValueChange={setTimezone} disabled={!canSave}>
              <SelectTrigger id="billing-timezone">
                <SelectValue placeholder="Selecione um timezone" />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.timezone ? <p className="text-sm text-destructive">{fieldErrors.timezone}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurring-generate-time">Horário de geração das faturas recorrentes</Label>
            <Input
              id="recurring-generate-time"
              type="time"
              step={60}
              value={recurringGenerateTimeLocal}
              onChange={(e) => setRecurringGenerateTimeLocal(e.target.value)}
              disabled={!canSave}
              required
            />
            {fieldErrors.recurring_generate_time_local ? (
              <p className="text-sm text-destructive">{fieldErrors.recurring_generate_time_local}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Formato 24h (HH:mm).</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurring-generate-days-before">Geração antecipada de faturas recorrentes</Label>
            <p className="text-xs text-muted-foreground">
              Gerar faturas recorrentes antecipadamente: defina quantos dias antes do vencimento a fatura será
              enfileirada. O vencimento da fatura continua sendo a data normal da cobrança (o dia do ciclo).
            </p>
            <Input
              id="recurring-generate-days-before"
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              step={1}
              value={recurringInvoiceGenerateDaysBeforeDue}
              onChange={(e) => setRecurringInvoiceGenerateDaysBeforeDue(Number(e.target.value))}
              disabled={!canSave}
            />
            <p className="text-xs text-muted-foreground">
              Número de dias antes do vencimento (0 a 60). Exemplo: vencimento dia 25 com 5 dias — geração a partir do
              dia 20 (respeitando o horário acima no primeiro dia elegível), vencimento da fatura continua dia 25.
            </p>
            {fieldErrors.recurring_invoice_generate_days_before_due ? (
              <p className="text-sm text-destructive">{fieldErrors.recurring_invoice_generate_days_before_due}</p>
            ) : null}
          </div>

          <div className="rounded-md border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <Label htmlFor="notify-same-toggle">Notificar no mesmo horário da geração</Label>
                <p className="text-xs text-muted-foreground">
                  Quando ativado, o horário de notificação usa o mesmo valor do horário de geração.
                </p>
              </div>
              <Switch
                id="notify-same-toggle"
                checked={invoiceNotifySameAsGeneration}
                disabled={!canSave}
                onCheckedChange={setInvoiceNotifySameAsGeneration}
              />
            </div>
          </div>

          {!invoiceNotifySameAsGeneration ? (
            <div className="space-y-2">
              <Label htmlFor="notify-time">Horário de notificação</Label>
              <Input
                id="notify-time"
                type="time"
                step={60}
                value={invoiceNotifyTimeLocal}
                onChange={(e) => setInvoiceNotifyTimeLocal(e.target.value)}
                disabled={!canSave}
                required={!invoiceNotifySameAsGeneration}
              />
              {fieldErrors.invoice_notify_time_local ? (
                <p className="text-sm text-destructive">{fieldErrors.invoice_notify_time_local}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Usado para preparação da fase de notificação desacoplada.</p>
              )}
            </div>
          ) : null}
        </form>
      </CardContent>
      <CardFooter className="flex items-center gap-3">
        <Button type="submit" form="billing-preferences-form" disabled={!canSave || saving || Boolean(loadError)}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar preferências
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={() => void load()}>
          Recarregar
        </Button>
      </CardFooter>
    </Card>
  );
};
