import { publicApiGet } from '@/integrations/api/client';
import { apiClient } from '@/integrations/api/client';

export type LegalPageSlug = 'privacy-policy' | 'terms-of-service';

export type LegalPublicationStatus = 'draft' | 'published';

export type LegalPagePublicPayload = {
  ok?: boolean;
  type?: string;
  html: string;
  published_at: string | null;
  updated_at?: string | null;
  status?: LegalPublicationStatus;
};

export type LegalPageAdminPayload = {
  ok?: boolean;
  type?: string;
  content_draft: string;
  content_published: string;
  status: LegalPublicationStatus;
  updated_at: string | null;
  updated_by?: string | null;
  published_at: string | null;
  published_by?: string | null;
  has_unpublished_changes: boolean;
};

export function publicLegalUrl(slug: LegalPageSlug): string {
  return `/api/public/legal/${slug}`;
}

export function superadminLegalUrl(slug: LegalPageSlug): string {
  return `/api/superadmin/legal/${slug}`;
}

export async function fetchPublicLegalPage(slug: LegalPageSlug) {
  return publicApiGet<LegalPagePublicPayload>(publicLegalUrl(slug), { cache: 'no-store' });
}

export async function fetchSuperadminLegalPage(slug: LegalPageSlug) {
  return apiClient.get<LegalPageAdminPayload>(superadminLegalUrl(slug));
}

export async function saveSuperadminLegalDraft(slug: LegalPageSlug, html: string) {
  return apiClient.put<LegalPageAdminPayload>(`${superadminLegalUrl(slug)}/draft`, { html });
}

export async function publishSuperadminLegalPage(slug: LegalPageSlug, htmlFromEditor: string) {
  return apiClient.post<LegalPageAdminPayload>(`${superadminLegalUrl(slug)}/publish`, {
    html: htmlFromEditor,
  });
}
