
// Funnel type definitions
export type FunnelType = "clients" | "leads" | "proposals" | "contracts";

export interface FunnelStage {
  id: string;
  name: string;
  color: string;
  order: number;
  funnelId: string;
}

export interface SalesFunnel {
  id: string;
  name: string;
  description: string;
  type: FunnelType;
  isDefault: boolean;
  createdAt: string;
  source?: string;
  stages: FunnelStage[];
}

export interface Deal {
  id: string;
  title: string;
  client: string;
  amount: string;
  probability: number;
  dueDate: string;
  stage: string;
  funnelId: string;
}

export interface ClientTag {
  id: string;
  name: string;
  color: string;
}

export interface Client {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  status?: string;
  stage: string;
  tags?: string[];
  notes?: string;
  createdAt?: string;
  source?: string;
}

export interface Rule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export interface RuleCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface RuleAction {
  id: string;
  type: string;
  value: string;
}

export interface SourceOption {
  value: string;
  label: string;
}
