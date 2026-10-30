/** Tipos do módulo Ordem de Serviço (OS-S1). */

export type ServiceOrderStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'sent'
  | 'awaiting_signature'
  | 'signed'
  | 'invoiced'
  | 'completed'
  | 'cancelled';

export type ServiceOrderBillingMode = 'none' | 'manual' | 'auto_on_sign';

export type ServiceOrderItemKind = 'service' | 'product';

export interface ServiceOrderItem {
  id?: string;
  kind: ServiceOrderItemKind;
  product_id?: string | null;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price_cents: number;
  discount_cents?: number;
  subtotal_cents?: number;
  sort_order?: number;
  created_at?: string;
}

export interface ServiceOrderEvent {
  id: string;
  tenant_id: string;
  service_order_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface ServiceOrderEquipment {
  name?: string | null;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  defects?: string | null;
  [key: string]: unknown;
}

/** Aceita objeto legado (1 item) ou lista. */
export type ServiceOrderEquipmentInput = ServiceOrderEquipment | ServiceOrderEquipment[] | null;

/** Normaliza `equipment` da OS para sempre uma lista (legado = 1 item). */
export function normalizeServiceOrderEquipmentList(
  equipment: ServiceOrderEquipmentInput | unknown,
): ServiceOrderEquipment[] {
  if (equipment == null) return [];
  const rawItems = Array.isArray(equipment) ? equipment : [equipment];
  const out: ServiceOrderEquipment[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const item: ServiceOrderEquipment = {
      name: r.name == null || String(r.name).trim() === '' ? null : String(r.name).trim(),
      brand: r.brand == null || String(r.brand).trim() === '' ? null : String(r.brand).trim(),
      model: r.model == null || String(r.model).trim() === '' ? null : String(r.model).trim(),
      serial: r.serial == null || String(r.serial).trim() === '' ? null : String(r.serial).trim(),
      defects: r.defects == null || String(r.defects).trim() === '' ? null : String(r.defects).trim(),
    };
    if (item.name || item.brand || item.model || item.serial || item.defects) {
      out.push(item);
    }
  }
  return out;
}

export interface ServiceOrder {
  id: string;
  tenant_id: string;
  created_by: string;
  responsible_user_id?: string | null;
  service_order_number: number;
  status: ServiceOrderStatus;
  client_id?: string | null;
  client_name?: string | null;
  client_snapshot?: Record<string, unknown>;
  execution_address?: Record<string, unknown>;
  period_start_at?: string | null;
  period_end_at?: string | null;
  /** Objeto legado ou lista de equipamentos. */
  equipment?: ServiceOrderEquipmentInput;
  observations?: string | null;
  billing_mode: ServiceOrderBillingMode;
  appointment_id?: string | null;
  converted_invoice_id?: string | null;
  content_html?: string | null;
  content_snapshot_html?: string | null;
  document_frozen_at?: string | null;
  total_services_cents: number | string;
  total_products_cents: number | string;
  total_cents: number | string;
  currency: string;
  signed_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
  responsible_email?: string | null;
  created_by_email?: string | null;
  items?: ServiceOrderItem[];
  events?: ServiceOrderEvent[];
  signers?: ServiceOrderSigner[];
  public_view?: ServiceOrderPublicViewMeta | null;
  appointment?: ServiceOrderAppointmentSummary | null;
}

export interface ServiceOrderAppointmentSummary {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  sync_status: string;
  sync_error: string | null;
  google_html_link: string | null;
  google_meet_link: string | null;
  type: string;
  location: string | null;
}

export type ServiceOrderSignerRole = 'client' | 'technician';

export interface ServiceOrderSigner {
  id: string;
  tenant_id: string;
  service_order_id: string;
  role: ServiceOrderSignerRole;
  name: string;
  email?: string | null;
  tax_id?: string | null;
  whatsapp_phone?: string | null;
  signing_order: number;
  signed_at?: string | null;
  signature_data?: Record<string, unknown> | null;
  created_at: string;
}

export interface ServiceOrderPublicViewMeta {
  has_active: boolean;
  created_at: string | null;
  expires_at: string | null;
  raw_token: string | null;
  frontend_path: string | null;
}

export interface SendServiceOrderForSignatureResult {
  order: ServiceOrder;
  view: { token: string; frontend_path: string; expires_at: string | null };
  invites: Array<{
    signer_id: string;
    role: string;
    name: string;
    token?: string;
    frontend_path?: string;
    expires_at?: string | null;
    already_active?: boolean;
    already_signed?: boolean;
  }>;
}

export interface SendServiceOrderToClientResult {
  order: ServiceOrder;
  view: { token: string; frontend_path: string; expires_at: string | null };
}

export interface ServiceOrderListResponse {
  data: ServiceOrder[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateServiceOrderInput {
  client_id?: string | null;
  responsible_user_id?: string | null;
  status?: Extract<ServiceOrderStatus, 'draft' | 'scheduled' | 'in_progress'>;
  client_snapshot?: Record<string, unknown>;
  execution_address?: Record<string, unknown>;
  period_start_at?: string | null;
  period_end_at?: string | null;
  equipment?: ServiceOrderEquipmentInput;
  observations?: string | null;
  billing_mode?: ServiceOrderBillingMode;
  currency?: string;
  items?: ServiceOrderItem[];
}

export type UpdateServiceOrderInput = Partial<
  Omit<CreateServiceOrderInput, 'status'> & { status?: ServiceOrderStatus }
>;

export interface ListServiceOrdersParams {
  status?: ServiceOrderStatus;
  client_id?: string;
  responsible_user_id?: string;
  created_by?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
