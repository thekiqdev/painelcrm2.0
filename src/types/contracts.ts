export type ContractStatus = 
  | 'DRAFT'
  | 'PENDING_SIGNATURE'
  | 'PARTIALLY_SIGNED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'CANCELLED';

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
  created_at: string;
  updated_at: string;
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
