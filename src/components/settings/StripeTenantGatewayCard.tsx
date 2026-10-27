/**
 * Stripe da empresa (IX5). Secret e webhook ficam no escopo tenant.
 * A secret da plataforma não entra neste formulário.
 */
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/integrations/api/client";
import { toast } from "@/components/ui/sonner";
import type { GatewayStatusItem } from "./gatewayPanelTypes";
import { useTranslation } from "react-i18next";

type StripeView = {
  configured: boolean;
  env: "sandbox" | "production";
  secret_key_masked: string | null;
  webhook_secret_masked: string | null;
  enabled: boolean;
  webhook_url: string;
};

export function StripeTenantGatewayCard({ item }: { item: GatewayStatusItem }) {
  const { t } = useTranslation("finance");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [env, setEnv] = useState<"sandbox" | "production">("sandbox");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [view, setView] = useState<StripeView | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await apiClient.get<StripeView>("/api/me/tenant/stripe-gateway");
    if (res.data) {
      setView(res.data);
      setEnv(res.data.env === "production" ? "production" : "sandbox");
    }
    if (res.error) toast.error(res.error);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await apiClient.put("/api/me/tenant/stripe-gateway", {
      env,
      ...(secretKey.trim() ? { secret_key: secretKey.trim() } : {}),
      ...(webhookSecret.trim() ? { webhook_secret: webhookSecret.trim() } : {}),
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setSecretKey("");
    setWebhookSecret("");
    toast.success(t("stripe_saved"));
    void load();
  };

  const test = async () => {
    setTesting(true);
    const res = await apiClient.post<{ connected?: boolean; error?: string }>(
      "/api/me/tenant/stripe-gateway/test",
      {}
    );
    setTesting(false);
    if (res.error || res.data?.connected === false) {
      toast.error(res.error || res.data?.error || t("stripe_fail"));
      return;
    }
    toast.success(t("stripe_ok"));
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Stripe</CardTitle>
        <CardDescription>
          {t("stripe_desc")}
          {item.configured ? ` ${t("stripe_saved_note")}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <p className="text-xs text-muted-foreground break-all">
              {t("secret_line", {
                secret: view?.secret_key_masked ?? "—",
                webhook: view?.webhook_secret_masked ?? "—",
              })}
              {view?.webhook_url ? ` Endpoint: ${view.webhook_url}` : ""}
            </p>
            <div className="grid gap-2">
              <Label>{t("stripe_mode")}</Label>
              <Select value={env} onValueChange={(v) => setEnv(v as "sandbox" | "production")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">{t("stripe_sandbox")}</SelectItem>
                  <SelectItem value="production">{t("stripe_production")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tenant-stripe-secret">Secret key</Label>
              <Input
                id="tenant-stripe-secret"
                type="password"
                autoComplete="off"
                placeholder={view?.secret_key_masked ? t("stripe_keep") : "sk_test_..."}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tenant-stripe-webhook">Webhook secret</Label>
              <Input
                id="tenant-stripe-webhook"
                type="password"
                autoComplete="off"
                placeholder={view?.webhook_secret_masked ? t("stripe_keep") : "whsec_..."}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? t("saving") : t("save")}
              </Button>
              <Button type="button" variant="outline" disabled={testing} onClick={() => void test()}>
                {testing ? t("testing") : t("test_connection")}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
