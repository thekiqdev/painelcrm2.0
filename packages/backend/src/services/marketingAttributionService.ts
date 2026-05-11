import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

export const marketingAttributionInputSchema = z
  .object({
    utm_source: z.string().max(500).optional().nullable(),
    utm_medium: z.string().max(500).optional().nullable(),
    utm_campaign: z.string().max(500).optional().nullable(),
    utm_content: z.string().max(500).optional().nullable(),
    utm_term: z.string().max(500).optional().nullable(),
    fbclid: z.string().max(500).optional().nullable(),
    landing_path: z.string().max(2000).optional().nullable(),
    first_seen_at: z.string().datetime().optional().nullable(),
  })
  .strict();

export type MarketingAttributionInput = z.infer<typeof marketingAttributionInputSchema>;

function cleanText(value: string | null | undefined, max: number): string | null {
  const t = (value ?? '').trim();
  if (!t) return null;
  return t.slice(0, max);
}

function parseFirstSeenAt(raw: string | null | undefined): Date | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseMarketingAttributionFromBody(body: unknown): MarketingAttributionInput | null {
  if (body == null || typeof body !== 'object') return null;
  const wrapped = (body as { marketing_attribution?: unknown }).marketing_attribution;
  if (wrapped == null) return null;
  const parsed = marketingAttributionInputSchema.safeParse(wrapped);
  return parsed.success ? parsed.data : null;
}

export async function persistTenantMarketingAttribution(
  client: Pool | PoolClient,
  params: {
    tenantId: string;
    userId: string | null;
    attribution: MarketingAttributionInput | null;
    convertedAt?: Date;
  },
): Promise<void> {
  if (!params.attribution) return;

  const convertedAt = params.convertedAt ?? new Date();
  await client.query(
    `INSERT INTO tenant_marketing_attribution (
       tenant_id, user_id,
       utm_source, utm_medium, utm_campaign, utm_content, utm_term,
       fbclid, landing_path, first_seen_at, converted_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (tenant_id) DO UPDATE SET
       user_id = COALESCE(EXCLUDED.user_id, tenant_marketing_attribution.user_id),
       utm_source = COALESCE(EXCLUDED.utm_source, tenant_marketing_attribution.utm_source),
       utm_medium = COALESCE(EXCLUDED.utm_medium, tenant_marketing_attribution.utm_medium),
       utm_campaign = COALESCE(EXCLUDED.utm_campaign, tenant_marketing_attribution.utm_campaign),
       utm_content = COALESCE(EXCLUDED.utm_content, tenant_marketing_attribution.utm_content),
       utm_term = COALESCE(EXCLUDED.utm_term, tenant_marketing_attribution.utm_term),
       fbclid = COALESCE(EXCLUDED.fbclid, tenant_marketing_attribution.fbclid),
       landing_path = COALESCE(EXCLUDED.landing_path, tenant_marketing_attribution.landing_path),
       first_seen_at = COALESCE(EXCLUDED.first_seen_at, tenant_marketing_attribution.first_seen_at),
       converted_at = EXCLUDED.converted_at`,
    [
      params.tenantId,
      params.userId,
      cleanText(params.attribution.utm_source, 500),
      cleanText(params.attribution.utm_medium, 500),
      cleanText(params.attribution.utm_campaign, 500),
      cleanText(params.attribution.utm_content, 500),
      cleanText(params.attribution.utm_term, 500),
      cleanText(params.attribution.fbclid, 500),
      cleanText(params.attribution.landing_path, 2000),
      parseFirstSeenAt(params.attribution.first_seen_at),
      convertedAt,
    ],
  );
}
