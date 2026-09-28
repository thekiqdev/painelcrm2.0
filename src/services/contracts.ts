import { apiClient, getApiUrl } from '@/integrations/api/client';
import {
  Contract,
  ContractTemplate,
  ContractSigner,
  ContractEvent,
  type ContractSignatureField,
  type ContractDocumentKind,
  type ContractTenancyRules,
} from '@/types/contracts';

export type ContractMergeCategoryId = 'system' | 'contract' | 'client' | 'operator' | 'signer';

export interface ContractMergeFieldDefinition {
  key: string;
  label: string;
  description: string;
  source: string;
}

export interface ContractMergeFieldCategory {
  id: ContractMergeCategoryId;
  title: string;
  description?: string;
  fields: ContractMergeFieldDefinition[];
}

export interface ContractMergeFieldCatalogResponse {
  categories: ContractMergeFieldCategory[];
  legacy_aliases: Record<string, string>;
}

export interface ContractPublicViewLinkMeta {
  has_active_link: boolean;
  created_at: string | null;
  expires_at: string | null;
}

/** Materialização do link no painel (GET bootstrap); cria token em falta. */
export interface ContractPublicViewBootstrapResponse {
  has_active_link: boolean;
  created_at: string | null;
  expires_at: string | null;
  token: string | null;
  frontend_path: string | null;
  public_view_url: string | null;
  legacy_token_not_retrievable?: boolean;
}

export interface ContractCreatePublicViewPayload {
  token: string;
  frontend_path: string;
  public_view_url: string | null;
  created_at: string;
  expires_at: string | null;
}

export type ContractCreateResult = Contract & {
  public_view?: ContractCreatePublicViewPayload;
};

export interface ContractPublicViewLinkIssueResponse {
  token: string;
  frontend_path: string;
  created_at: string;
  expires_at: string | null;
}

export interface ContractSignatureInviteMeta {
  has_active_invite: boolean;
  created_at: string | null;
  expires_at: string | null;
}

export interface ContractSignatureInviteIssueResponse {
  token: string;
  frontend_path: string;
  created_at: string;
  expires_at: string | null;
}

export type ContractOperationalAuditKind =
  | 'MESSAGE_INVITE_COPIED'
  | 'MESSAGE_INVITE_OPENED'
  | 'MESSAGE_REMINDER_COPIED'
  | 'MESSAGE_REMINDER_OPENED'
  | 'MESSAGE_VIEW_COPIED'
  | 'MESSAGE_VIEW_OPENED'
  | 'MESSAGE_COMPLETION_COPIED'
  | 'MESSAGE_COMPLETION_OPENED'
  | 'LINK_SIGNATURE_COPIED'
  | 'LINK_SIGNATURE_OPENED';

export interface ContractEvidenceSummaryPayload {
  schema_version?: string;
  generated_at?: string;
  summary_lines?: string[];
  contract: {
    id: string;
    title: string;
    contract_number: string;
    status: string;
    document_frozen_at: string | null;
  };
  signers: Array<{
    id: string;
    name: string;
    email: string;
    signed_at: string | null;
    evidence: {
      confirmed_name?: string;
      method?: string;
      signed_at?: string;
      client_ip?: string;
      user_agent?: string;
      accepted_terms_version?: string;
      /** Indica PNG e-sign guardado em `signature_data` (sem expor base64 no resumo). */
      signature_image_stored?: boolean;
    } | null;
  }>;
}

/** Resposta opcional do PATCH ao enviar contrato (DRAFT → PENDING_SIGNATURE). */
export type ContractSignatureInviteBootstrapItem =
  | { signer_id: string; token: string; frontend_path: string; expires_at: string | null }
  | { signer_id: string; already_active: true }
  | { signer_id: string; error: string };

export type ContractUpdateResult = Contract & {
  signature_invite_bootstrap?: ContractSignatureInviteBootstrapItem[];
};

export const contractsService = {
  // Get contracts with filters
  async getContracts(filters?: {
    status?: string;
    clientId?: string;
    responsibleId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
  }): Promise<Contract[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.clientId) params.append('clientId', filters.clientId);
      if (filters?.responsibleId) params.append('responsibleId', filters.responsibleId);
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.sortField) params.append('sortField', filters.sortField);
      if (filters?.sortDirection) params.append('sortDirection', filters.sortDirection);

      const url = `/api/contracts${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await apiClient.get<Contract[]>(url);
      
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching contracts:', error);
      throw error;
    }
  },

  async getContractMergeFieldCatalog(): Promise<ContractMergeFieldCatalogResponse> {
    const response = await apiClient.get<ContractMergeFieldCatalogResponse>(
      '/api/contracts/merge-field-catalog',
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  },

  // Get contract by ID
  async getContractById(id: string): Promise<Contract> {
    try {
      const response = await apiClient.get<Contract>(`/api/contracts/${id}`);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching contract:', error);
      throw error;
    }
  },

  // Create contract
  async createContract(contractData: {
    title: string;
    client_id?: string;
    responsible_id?: string;
    status?: 'DRAFT' | 'PENDING_SIGNATURE' | 'PARTIALLY_SIGNED' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'CANCELLED';
    start_date?: string;
    end_date?: string;
    tags?: string[];
    content?: string;
    content_html?: string;
    template_id?: string;
    variables?: Record<string, any>;
    auto_renew?: boolean;
    renewal_period?: number;
    total_value?: number;
    currency?: string;
    linked_proposal_id?: string;
    linked_invoice_id?: string;
    signature_settings?: Record<string, any>;
    document_kind?: ContractDocumentKind;
  }): Promise<ContractCreateResult> {
    try {
      const response = await apiClient.post<ContractCreateResult>('/api/contracts', contractData);
      if (response.error) throw new Error(response.error);
      return response.data!;
    } catch (error: any) {
      console.error('Error creating contract:', error);
      throw error;
    }
  },

  // Update contract
  async updateContract(id: string, contractData: Partial<{
    title: string;
    client_id?: string;
    responsible_id?: string;
    status?: 'DRAFT' | 'PENDING_SIGNATURE' | 'PARTIALLY_SIGNED' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'CANCELLED';
    start_date?: string;
    end_date?: string;
    tags?: string[];
    content?: string;
    content_html?: string;
    template_id?: string;
    variables?: Record<string, any>;
    auto_renew?: boolean;
    renewal_period?: number;
    total_value?: number;
    currency?: string;
    linked_proposal_id?: string;
    linked_invoice_id?: string;
    signature_settings?: Record<string, any>;
  }>): Promise<ContractUpdateResult> {
    try {
      const response = await apiClient.patch<ContractUpdateResult>(`/api/contracts/${id}`, contractData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error updating contract:', error);
      throw error;
    }
  },

  async getPublicViewLinkMeta(contractId: string): Promise<ContractPublicViewLinkMeta> {
    const response = await apiClient.get<ContractPublicViewLinkMeta>(
      `/api/contracts/${contractId}/public-view-link/meta`
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  },

  async getPublicViewBootstrap(contractId: string): Promise<ContractPublicViewBootstrapResponse> {
    const response = await apiClient.get<ContractPublicViewBootstrapResponse>(
      `/api/contracts/${contractId}/public-view-link/bootstrap`
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  },

  async issuePublicViewLink(
    contractId: string,
    body: { regenerate?: boolean } = {}
  ): Promise<ContractPublicViewLinkIssueResponse> {
    const response = await apiClient.post<ContractPublicViewLinkIssueResponse>(
      `/api/contracts/${contractId}/public-view-link`,
      body
    );
    if (response.error) throw Object.assign(new Error(response.error), { code: response.code, details: response.details });
    return response.data!;
  },

  async revokePublicViewLink(contractId: string): Promise<void> {
    const response = await apiClient.delete(`/api/contracts/${contractId}/public-view-link`);
    if (response.error) throw new Error(response.error);
  },

  async getSignatureInviteMeta(contractId: string, signerId: string): Promise<ContractSignatureInviteMeta> {
    const response = await apiClient.get<ContractSignatureInviteMeta>(
      `/api/contracts/${contractId}/signers/${signerId}/signature-invite/meta`
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  },

  async issueSignatureInvite(
    contractId: string,
    signerId: string,
    body: { regenerate?: boolean } = {}
  ): Promise<ContractSignatureInviteIssueResponse> {
    const response = await apiClient.post<ContractSignatureInviteIssueResponse>(
      `/api/contracts/${contractId}/signers/${signerId}/signature-invite`,
      body
    );
    if (response.error) {
      throw Object.assign(new Error(response.error), { code: response.code, details: response.details });
    }
    return response.data!;
  },

  async revokeSignatureInvite(contractId: string, signerId: string): Promise<void> {
    const response = await apiClient.delete(`/api/contracts/${contractId}/signers/${signerId}/signature-invite`);
    if (response.error) throw new Error(response.error);
  },

  async getEvidenceSummary(contractId: string): Promise<ContractEvidenceSummaryPayload> {
    const response = await apiClient.get<ContractEvidenceSummaryPayload>(
      `/api/contracts/${contractId}/evidence-summary`
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  },

  async recordOperationalAudit(
    contractId: string,
    body: { action_kind: ContractOperationalAuditKind; signer_id?: string | null }
  ): Promise<void> {
    const response = await apiClient.post(`/api/contracts/${contractId}/operational-audit`, body);
    if (response.error) throw new Error(response.error);
  },

  async fetchContractSourcePdfBlob(contractId: string): Promise<Blob> {
    const base = getApiUrl();
    const token = apiClient.getToken();
    const url = `${base}/api/contracts/${contractId}/source-pdf`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = 'Falha ao carregar PDF';
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.blob();
  },

  async uploadContractPdf(
    contractId: string,
    file: File,
  ): Promise<{ pdf_page_count: number | null; sha256: string }> {
    const fd = new FormData();
    fd.append('pdf', file);
    const response = await apiClient.post<{
      pdf_page_count: number | null;
      sha256: string;
    }>(`/api/contracts/${contractId}/pdf-upload`, fd);
    if (response.error) throw new Error(response.error);
    return response.data!;
  },

  async getContractSignatureFields(contractId: string): Promise<{
    fields: ContractSignatureField[];
    pdf_page_count: number | null;
    document_kind: ContractDocumentKind;
  }> {
    const response = await apiClient.get<{
      fields: ContractSignatureField[];
      pdf_page_count: number | null;
      document_kind: ContractDocumentKind;
    }>(`/api/contracts/${contractId}/signature-fields`);
    if (response.error) throw new Error(response.error);
    return response.data!;
  },

  async getContractPdfEditorState(contractId: string) {
    const response = await apiClient.get<import('@/types/contractPdfEditor').ContractPdfEditorState>(
      `/api/contracts/${contractId}/pdf-editor-state`,
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  },

  async appendContractPdfPage(contractId: string): Promise<{
    pdf_page_count: number;
    source_pdf_page_count: number;
    page: import('@/types/contractPdfEditor').ContractPdfExtraPage;
  }> {
    const response = await apiClient.post<{
      ok?: boolean;
      pdf_page_count: number;
      source_pdf_page_count: number;
      page: import('@/types/contractPdfEditor').ContractPdfExtraPage & {
        page_order: number;
        html_snapshot: string;
      };
    }>(`/api/contracts/${contractId}/pdf-extra-pages`, {});
    if (response.error) throw new Error(response.error);
    const d = response.data!;
    const virtual =
      d.page.virtual_page ??
      (d.source_pdf_page_count ?? 1) + (d.page.page_order ?? 1);
    return {
      pdf_page_count: d.pdf_page_count ?? 1,
      source_pdf_page_count: d.source_pdf_page_count ?? 1,
      page: {
        id: d.page.id,
        page_order: d.page.page_order,
        virtual_page: virtual,
        html_snapshot: d.page.html_snapshot ?? '',
        editor_json: d.page.editor_json,
      },
    };
  },

  async patchContractPdfExtraPage(
    contractId: string,
    pageId: string,
    body: { html_snapshot?: string; editor_json?: Record<string, unknown> },
  ): Promise<{ page: import('@/types/contractPdfEditor').ContractPdfExtraPage }> {
    const response = await apiClient.patch<{
      page: import('@/types/contractPdfEditor').ContractPdfExtraPage & { page_order: number };
    }>(`/api/contracts/${contractId}/pdf-extra-pages/${pageId}`, body);
    if (response.error) throw new Error(response.error);
    const p = response.data!.page;
    return {
      page: {
        id: p.id,
        page_order: p.page_order,
        virtual_page: p.virtual_page,
        html_snapshot: p.html_snapshot,
        editor_json: p.editor_json,
      },
    };
  },

  async saveContractSignatureFields(
    contractId: string,
    body: { fields: Omit<ContractSignatureField, 'id'>[]; pdf_page_count?: number },
  ): Promise<{ fields: ContractSignatureField[] }> {
    const response = await apiClient.put<{ fields: ContractSignatureField[] }>(
      `/api/contracts/${contractId}/signature-fields`,
      body,
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  },

  getPublicSignPdfUrl(signToken: string): string {
    return `${getApiUrl()}/api/public/contracts/sign/${encodeURIComponent(signToken)}/pdf`;
  },

  async fetchContractSignedPdfBlob(contractId: string, inline = true): Promise<Blob> {
    const base = getApiUrl();
    const token = apiClient.getToken();
    const q = inline ? '?inline=1' : '';
    const url = `${base}/api/contracts/${contractId}/signed-pdf${q}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = 'PDF assinado indisponível';
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.blob();
  },

  async rebuildSignedContractPdf(contractId: string): Promise<{ signed_pdf_storage_key: string | null }> {
    const response = await apiClient.post<{
      ok?: boolean;
      signed_pdf_storage_key?: string | null;
    }>(`/api/contracts/${contractId}/rebuild-signed-pdf`, {});
    if (response.error) throw new Error(response.error);
    return { signed_pdf_storage_key: response.data?.signed_pdf_storage_key ?? null };
  },

  async downloadSignedContractPdf(contractId: string): Promise<void> {
    const blob = await this.fetchContractSignedPdfBlob(contractId);
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'contrato-assinado.pdf';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(u);
  },

  async downloadContractPdf(contractId: string): Promise<void> {
    const base = getApiUrl();
    const token = apiClient.getToken();
    const url = `${base}/api/contracts/${contractId}/pdf`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = 'Falha ao gerar PDF';
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition');
    let filename = 'contrato.pdf';
    const m = cd?.match(/filename="([^"]+)"/i) || cd?.match(/filename=([^;]+)/i);
    if (m) filename = m[1].trim();
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(u);
  },

  // Delete contract
  async deleteContract(id: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/api/contracts/${id}`);
      if (response.error) throw new Error(response.error);
    } catch (error: any) {
      console.error('Error deleting contract:', error);
      throw error;
    }
  },

  // Get contract signers
  async getContractSigners(contractId: string): Promise<ContractSigner[]> {
    try {
      const response = await apiClient.get<ContractSigner[]>(`/api/contracts/${contractId}/signers`);
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching contract signers:', error);
      throw error;
    }
  },

  // Create contract signer
  async createContractSigner(contractId: string, signerData: {
    name: string;
    email: string;
    tax_id: string;
    role: 'CLIENT' | 'INTERNAL';
    signing_order?: number;
    whatsapp_phone?: string | null;
  }): Promise<ContractSigner> {
    try {
      const response = await apiClient.post<ContractSigner>(`/api/contracts/${contractId}/signers`, signerData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error creating contract signer:', error);
      throw error;
    }
  },

  // Update contract signer
  async updateContractSigner(signerId: string, signerData: Partial<{
    name: string;
    email: string;
    tax_id: string;
    role: 'CLIENT' | 'INTERNAL';
    signing_order?: number;
    whatsapp_phone?: string | null;
  }>): Promise<ContractSigner> {
    try {
      const response = await apiClient.patch<ContractSigner>(`/api/contracts/signers/${signerId}`, signerData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error updating contract signer:', error);
      throw error;
    }
  },

  // Delete contract signer
  async deleteContractSigner(signerId: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/api/contracts/signers/${signerId}`);
      if (response.error) throw new Error(response.error);
    } catch (error: any) {
      console.error('Error deleting contract signer:', error);
      throw error;
    }
  },

  // Get contract events
  async getContractEvents(contractId: string): Promise<ContractEvent[]> {
    try {
      const response = await apiClient.get<ContractEvent[]>(`/api/contracts/${contractId}/events`);
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching contract events:', error);
      throw error;
    }
  },

  // Create contract event
  async createContractEvent(contractId: string, eventData: {
    event_type: string;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<ContractEvent> {
    try {
      const response = await apiClient.post<ContractEvent>(`/api/contracts/${contractId}/events`, eventData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error creating contract event:', error);
      throw error;
    }
  },

  // Get contract templates
  async getContractTemplates(activeOnly?: boolean): Promise<ContractTemplate[]> {
    try {
      const url = activeOnly ? '/api/contract-templates?activeOnly=true' : '/api/contract-templates';
      const response = await apiClient.get<ContractTemplate[]>(url);
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching contract templates:', error);
      throw error;
    }
  },

  async getContractTemplate(id: string): Promise<ContractTemplate> {
    try {
      const response = await apiClient.get<ContractTemplate>(`/api/contract-templates/${id}`);
      if (response.error) throw new Error(response.error);
      if (!response.data) throw new Error('Modelo não encontrado');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching contract template:', error);
      throw error;
    }
  },

  // Create contract template
  async createContractTemplate(templateData: {
    name: string;
    description?: string;
    default_title?: string | null;
    content_html: string;
    variables_schema?: Array<{
      key: string;
      label: string;
      type: 'text' | 'date' | 'number' | 'currency';
      required?: boolean;
    }>;
    is_active?: boolean;
    default_total_value?: number | null;
    default_currency?: string | null;
    tenancy_rules?: ContractTenancyRules;
  }): Promise<ContractTemplate> {
    try {
      const response = await apiClient.post<ContractTemplate>('/api/contract-templates', templateData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error creating contract template:', error);
      throw error;
    }
  },

  // Update contract template
  async updateContractTemplate(id: string, templateData: Partial<{
    name: string;
    description?: string;
    default_title?: string | null;
    content_html: string;
    variables_schema?: Array<{
      key: string;
      label: string;
      type: 'text' | 'date' | 'number' | 'currency';
      required?: boolean;
    }>;
    is_active?: boolean;
    default_total_value?: number | null;
    default_currency?: string | null;
    tenancy_rules?: ContractTenancyRules;
  }>): Promise<ContractTemplate> {
    try {
      const response = await apiClient.patch<ContractTemplate>(`/api/contract-templates/${id}`, templateData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error updating contract template:', error);
      throw error;
    }
  },

  // Delete contract template
  async deleteContractTemplate(id: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/api/contract-templates/${id}`);
      if (response.error) throw new Error(response.error);
    } catch (error: any) {
      console.error('Error deleting contract template:', error);
      throw error;
    }
  },
};

