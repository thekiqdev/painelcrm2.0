import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSectionProps } from "./types";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/integrations/api/client";
import { toast } from "@/components/ui/sonner";
import { useLocaleCurrency } from "@/lib/i18n/LocaleProvider";
import { normalizeAppLocale, type AppLocale } from "@/lib/i18n/appLocale";
import { formatAppDate, formatAppMoney, PILOT_SAMPLE_AT, PILOT_SAMPLE_CENTS } from "@/lib/i18n/formatApp";

export const PreferencesSection: React.FC<SettingsSectionProps> = ({ handleSave }) => {
  const { t, i18n: i18nInstance } = useTranslation("common");
  const { refreshUser } = useAuth();
  const { setLocale } = useLocaleCurrency();
  const [savingLanguage, setSavingLanguage] = useState(false);
  const current = normalizeAppLocale(i18nInstance.language) ?? "pt-BR";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências Gerais</CardTitle>
        <CardDescription>Personalize sua experiência no sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="language">{t("language_label")}</Label>
            <Select value={current} onValueChange={(value) => void onLanguageChange(value)} disabled={savingLanguage}>
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
              {t("pilot_amount")}: {formatAppMoney(PILOT_SAMPLE_CENTS, "BRL")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Fuso Horário</Label>
            <Select defaultValue="America/Sao_Paulo">
              <SelectTrigger>
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
              <SelectTrigger>
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
      <CardFooter>
        <Button onClick={handleSave}>{savingLanguage ? t("saving") : t("save")}</Button>
      </CardFooter>
    </Card>
  );
};
