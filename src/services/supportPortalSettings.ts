import { apiClient } from "@/integrations/api/client";

export type SupportPortalTenantCategory = { id: string; name: string };

export type SupportPortalSettingsResponse = {
  enabled: boolean;
  /** Sempre igual a `tenants.slug` (fonte de verdade). */
  slug: string;
  slug_locked: boolean;
  title: string | null;
  description: string | null;
  welcome_message: string | null;
  logo_url: string | null;
  primary_color: string | null;
  default_priority: "low" | "normal" | "high" | "urgent";
  allowed_category_ids: string[] | null;
  public_url: string | null;
  tenant_categories?: SupportPortalTenantCategory[];
};

export type SupportPortalSettingsPut = {
  enabled: boolean;
  title?: string | null;
  description?: string | null;
  welcome_message?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  default_priority: "low" | "normal" | "high" | "urgent";
  allowed_category_ids?: string[] | null;
};

export const supportPortalSettingsService = {
  async get(): Promise<SupportPortalSettingsResponse> {
    const res = await apiClient.get<SupportPortalSettingsResponse>("/api/support-portal/settings");
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error("Resposta vazia");
    return res.data;
  },

  async put(body: SupportPortalSettingsPut): Promise<SupportPortalSettingsResponse> {
    const res = await apiClient.put<SupportPortalSettingsResponse>("/api/support-portal/settings", body);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error("Resposta vazia");
    return res.data;
  },
};
