import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SettingsSectionProps } from "./types";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { apiClient } from "@/integrations/api/client";
import { toast } from "@/components/ui/sonner";
import { useLocaleCurrency } from "@/lib/i18n/LocaleProvider";
import { normalizeAppLocale, type AppLocale } from "@/lib/i18n/appLocale";
import { APP_CURRENCIES, type AppCurrency } from "@/lib/i18n/appCurrency";
import { formatAppDate, formatAppMoney, PILOT_SAMPLE_AT, PILOT_SAMPLE_CENTS } from "@/lib/i18n/formatApp";
import {
  getMyTenantLocalization,
  putMyTenantLocalization,
} from "@/services/tenantLocalization";
import { Loader2 } from "lucide-react";

const CURRENCY_META: Record<AppCurrency, { label: string; detail: string }> = {
  BRL: { label: "BRL", detail: "Real brasileiro" },
  USD: { label: "USD", detail: "Dólar americano" },
  EUR: { label: "EUR", detail: "Euro" },
};

export const PreferencesSection: React.FC<SettingsSectionProps> = () => {
  const { t, i18n: i18nInstance } = useTranslation("common");
  const { refreshUser } = useAuth();
  const { canEdit } = useModulePermissions();
  const canSave = canEdit("settings");
  const { setLocale, setCurrency } = useLocaleCurrency();
  const [savingLanguage, setSavingLanguage] = useState(false);
  const current = normalizeAppLocale(i18nInstance.language) ?? "pt-BR";

  const [loadingCurrencies, setLoadingCurrencies] = useState(true);
  const [savingCurrencies, setSavingCurrencies] = useState(false);
  const [available, setAvailable] = useState<AppCurrency[]>([...APP_CURRENCIES]);
  const [enabled, setEnabled] = useState<AppCurrency[]>([...APP_CURRENCIES]);
  const [defaultCurrency, setDefaultCurrency] = useState<AppCurrency>("BRL");

  const loadCurrencies = useCallback(async () => {
    setLoadingCurrencies(true);
    try {
      const res = await getMyTenantLocalization();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (!res.data) return;
      setAvailable(res.data.available_currencies.length ? res.data.available_currencies : [...APP_CURRENCIES]);
      setEnabled(res.data.enabled_currencies);
      setDefaultCurrency(res.data.default_currency);
    } finally {
      setLoadingCurrencies(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrencies();
  }, [loadCurrencies]);

  const enabledSet = useMemo(() => new Set(enabled), [enabled]);

  const onLanguageChange = async (value: string) => {
    const locale = normalizeAppLocale(value);
    if (!locale || locale === current) return;
    setSavingLanguage(true);
    setLocale(locale);
    const response = await apiClient.patch<{ locale: AppLocale }>("/api/me/locale", { locale });
    setSavingLanguage(false);
    if (response.error) {
      toast.error(t("language_save_failed"));
      return;
    }
    await refreshUser();
    toast.success(t("language_saved"));
  };

  const toggleCurrency = (code: AppCurrency, nextOn: boolean) => {
    if (!canSave) return;
    if (nextOn) {
      setEnabled((prev) => (prev.includes(code) ? prev : [...prev, code]));
      return;
    }
    if (enabled.length <= 1) {
      toast.error("Mantenha ao menos uma moeda habilitada.");
      return;
    }
    if (code === defaultCurrency) {
      const fallback = enabled.find((c) => c !== code);
      if (!fallback) {
        toast.error("Defina outra moeda padrão antes de desabilitar esta.");
        return;
      }
      setDefaultCurrency(fallback);
    }
    setEnabled((prev) => prev.filter((c) => c !== code));
  };

  const onDefaultChange = (code: string) => {
    const next = code as AppCurrency;
    if (!enabledSet.has(next)) return;
    setDefaultCurrency(next);
  };

  const saveCurrencies = async () => {
    if (!canSave) {
      toast.error("Sem permissão para alterar configurações.");
      return;
    }
    if (!enabled.length || !enabled.includes(defaultCurrency)) {
      toast.error("A moeda padrão precisa estar habilitada.");
      return;
    }
    setSavingCurrencies(true);
    try {
      const res = await putMyTenantLocalization({
        enabled_currencies: enabled,
        default_currency: defaultCurrency,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.data) {
        setAvailable(res.data.available_currencies);
        setEnabled(res.data.enabled_currencies);
        setDefaultCurrency(res.data.default_currency);
        setCurrency(res.data.default_currency);
      }
      toast.success("Moedas salvas.");
    } finally {
      setSavingCurrencies(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Localização</CardTitle>
          <CardDescription>Idioma e fuso horário da sua experiência no painel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="language">{t("language_label")}</Label>
              <Select
                value={current}
                onValueChange={(value) => void onLanguageChange(value)}
                disabled={savingLanguage}
              >
                <SelectTrigger id="language">
                  <SelectValue placeholder={t("language_label")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">{t("language_pt")}</SelectItem>
                  <SelectItem value="en">{t("language_en")}</SelectItem>
                  <SelectItem value="es">{t("language_es")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground" data-testid="i18n-pilot-sample">
                {t("pilot_date")}: {formatAppDate(PILOT_SAMPLE_AT)}
                {" · "}
                {t("pilot_amount")}: {formatAppMoney(PILOT_SAMPLE_CENTS, defaultCurrency)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Fuso Horário</Label>
              <Select defaultValue="America/Sao_Paulo">
                <SelectTrigger id="timezone">
                  <SelectValue placeholder="Selecione um fuso horário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">Brasília (UTC-3)</SelectItem>
                  <SelectItem value="America/Manaus">Manaus (UTC-4)</SelectItem>
                  <SelectItem value="America/Belem">Belém (UTC-3)</SelectItem>
                  <SelectItem value="America/Noronha">Fernando de Noronha (UTC-2)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateFormat">Formato de Data</Label>
              <Select defaultValue="DD/MM/YYYY">
                <SelectTrigger id="dateFormat">
                  <SelectValue placeholder="Selecione um formato de data" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moedas</CardTitle>
          <CardDescription>
            Moedas disponíveis no site (BRL, USD e EUR). Habilite as que a empresa usa e escolha a padrão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCurrencies ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando moedas…
            </div>
          ) : (
            <RadioGroup
              value={defaultCurrency}
              onValueChange={onDefaultChange}
              className="space-y-3"
              disabled={!canSave || savingCurrencies}
            >
              {available.map((code) => {
                const meta = CURRENCY_META[code];
                const isOn = enabledSet.has(code);
                return (
                  <div
                    key={code}
                    className="flex flex-col gap-3 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">
                        {meta.label} <span className="text-muted-foreground font-normal">· {meta.detail}</span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Exemplo: {formatAppMoney(PILOT_SAMPLE_CENTS, code)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={isOn}
                          disabled={!canSave || savingCurrencies}
                          onCheckedChange={(checked) => toggleCurrency(code, checked)}
                          aria-label={`Habilitar ${code}`}
                        />
                        <span>{isOn ? "Ativa" : "Inativa"}</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value={code} id={`default-${code}`} disabled={!isOn || !canSave} />
                        <span>Padrão</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={() => void saveCurrencies()} disabled={!canSave || loadingCurrencies || savingCurrencies}>
            {savingCurrencies ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
              </>
            ) : (
              "Salvar moedas"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
