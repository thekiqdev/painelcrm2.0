/**
 * Billing Automation — workflow contracts (no execution).
 */

export type BillingAutomationTrigger =
  | 'InvoiceCreated'
  | 'InvoicePaid'
  | 'InvoiceOverdue'
  | 'SubscriptionRenewed';

export type BillingAutomationStepType =
  | 'SendWhatsApp'
  | 'SendEmail'
  | 'Wait'
  | 'Condition'
  | 'CreateTask'
  | 'NotifyManager';

export type BillingAutomationStep = {
  id: string;
  type: BillingAutomationStepType;
  config: Record<string, unknown>;
  next_step_id?: string | null;
};

export type BillingAutomationWorkflowDefinition = {
  id: string;
  name: string;
  trigger: BillingAutomationTrigger;
  steps: BillingAutomationStep[];
  status: 'draft';
};

export const BILLING_AUTOMATION_REFERENCE_WORKFLOW: BillingAutomationWorkflowDefinition = {
  id: 'reference-dunning-v1',
  name: 'Reference — Invoice Created → WhatsApp → Wait → Email → Task',
  trigger: 'InvoiceCreated',
  status: 'draft',
  steps: [
    { id: 's1', type: 'SendWhatsApp', config: { template: 'invoice_created' }, next_step_id: 's2' },
    { id: 's2', type: 'Wait', config: { days: 3 }, next_step_id: 's3' },
    { id: 's3', type: 'Condition', config: { field: 'invoice.status', equals: 'unpaid' }, next_step_id: 's4' },
    { id: 's4', type: 'SendEmail', config: { template: 'payment_reminder' }, next_step_id: 's5' },
    { id: 's5', type: 'CreateTask', config: { assignee: 'collections' }, next_step_id: 's6' },
    { id: 's6', type: 'NotifyManager', config: {}, next_step_id: null },
  ],
};
