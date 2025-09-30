export type ContractStatus = 
  | 'DRAFT'
  | 'PENDING_SIGNATURE'
  | 'PARTIALLY_SIGNED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'CANCELLED';

export type SignerRole = 'CLIENT' | 'INTERNAL';

export interface Contract {
  id: string;
  user_id: string;
  contract_number: string;
  title: string;
  client_id: string | null;
  responsible_id: string | null;
  status: ContractStatus;
  start_date: string | null;
  end_date: string | null;
  tags: string[];
  content: string | null;
  template_id: string | null;
  content_html: string | null;
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
  content_html: string;
  variables_schema: Array<{
    key: string;
    label: string;
    type: 'text' | 'date' | 'number' | 'currency';
    required?: boolean;
  }>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContractSigner {
  id: string;
  contract_id: string;
  name: string;
  email: string;
  role: SignerRole;
  signing_order: number | null;
  signed_at: string | null;
  signature_data: Record<string, any> | null;
  created_at: string;
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
