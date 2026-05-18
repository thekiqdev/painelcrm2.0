export type ContractStatus = 
  | 'DRAFT'
  | 'PENDING_SIGNATURE'
  | 'PARTIALLY_SIGNED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'CANCELLED';

export type SignerRole = 'CLIENT' | 'INTERNAL';

/** Regras de vigência copiadas do modelo na criação do contrato (snapshot). */
export type ContractTenancyRules = {
  date_base_type?: 'creation_date' | 'signature_date' | null;
  start_rule_type?: 'same_day' | 'plus_days' | null;
  start_offset_days?: number | null;
  duration_days?: number | null;
} | null;

export interface Contract {
  id: string;
  user_id: string;
  contract_number: string;
  title: string;
  client_id: string | null;
  responsible_id: string | null;
  /** Nome do cliente (listagem); derivado por join no backend. */
  client_name?: string | null;
  /** Quando o detalhe/enriquecimento expuser o objeto cliente. */
  client?: { id?: string; name?: string | null; company?: string | null } | null;
  /** Nome para exibição do responsável (listagem/detalhe), com fallback para e-mail. */
  responsible_display_name?: string | null;
  /** Nome do criador (owner) para auditoria/exibição quando necessário. */
  creator_display_name?: string | null;
  status: ContractStatus;
  start_date: string | null;
  end_date: string | null;
  tags: string[];
  content: string | null;
  template_id: string | null;
  content_html: string | null;
  /** Snapshot imutável após envio/ativação (Etapa 2). */
  content_snapshot_html?: string | null;
  /** Momento do congelamento do documento. */
  document_frozen_at?: string | null;
  /** Cópia das regras do modelo na criação; datas finais ficam em start_date/end_date. */
  tenancy_rules?: ContractTenancyRules;
  variables: Record<string, any>;
  auto_renew: boolean;
  renewal_period: number | null;
  total_value: number | null;
  currency: string;
  linked_proposal_id: string | null;
  linked_invoice_id: string | null;
  signature_settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ContractTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  /** Título sugerido ao criar contrato a partir deste modelo. */
  default_title?: string | null;
  content_html: string;
  variables_schema: Array<{
    key: string;
    label: string;
    type: 'text' | 'date' | 'number' | 'currency';
    required?: boolean;
  }>;
  is_active: boolean;
  default_total_value?: number | null;
  default_currency?: string | null;
  tenancy_rules?: ContractTenancyRules;
  created_at: string;
  updated_at: string;
}

/** Convite de assinatura pública (Etapa 4); separado do link de visualização. Etapa 5: estado do último convite. */
export interface ContractSignerSignatureInviteMeta {
  has_active: boolean;
  created_at: string | null;
  expires_at: string | null;
  last?: {
    status: "none" | "active" | "expired" | "revoked" | "consumed";
    created_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    consumed_at: string | null;
  } | null;
}

export interface ContractSigner {
  id: string;
  contract_id: string;
  name: string;
  email: string;
  /** CPF (11) ou CNPJ (14) apenas dígitos. */
  tax_id?: string | null;
  role: SignerRole;
  signing_order: number | null;
  signed_at: string | null;
  signature_data: Record<string, unknown> | null;
  created_at: string;
  signature_invite?: ContractSignerSignatureInviteMeta;
}

export interface ContractEvent {
  id: string;
  contract_id: string;
  event_type: string;
  description: string;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;
}

export interface ContractFilters {
  status: ContractStatus | 'all';
  dateType: 'created' | 'validity';
  startDate: string | null;
  endDate: string | null;
  clientId: string | null;
  responsibleId: string | null;
  tags: string[];
  search: string;
}
