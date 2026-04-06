/**
 * Missões de ativação (Primeiros passos) — regras de conclusão e metadados para o dashboard.
 */
import { pool } from '../utils/db.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';

export type ActivationMissionId =
  | 'whatsapp'
  | 'first_client'
  | 'payment_gateway'
  | 'first_invoice'
  | 'invite_users';

export interface ActivationMissionPublic {
  id: ActivationMissionId;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  isApplicable: boolean;
  isCompleted: boolean;
}

export interface ActivationChecklistResponse {
  dismissed: boolean;
  applicableTotal: number;
  completedCount: number;
  progressPercent: number;
  /** Somente missões aplicáveis ainda pendentes (lista principal). */
  pendingMissions: Omit<ActivationMissionPublic, 'isApplicable' | 'isCompleted'>[];
}

const MISSION_DEFS: Omit<ActivationMissionPublic, 'isApplicable' | 'isCompleted'>[] = [
  {
    id: 'whatsapp',
    title: 'Configurar WhatsApp',
    description: 'Conecte uma instância para atender clientes pelo chat integrado ao CRM.',
    actionLabel: 'Abrir WhatsApp',
    actionHref: '/settings?section=whatsapp',
  },
  {
    id: 'first_client',
    title: 'Criar cliente',
    description: 'Cadastre seu primeiro cliente para organizar contatos e histórico.',
    actionLabel: 'Novo cliente',
    actionHref: '/clients?new=1',
  },
  {
    id: 'payment_gateway',
    title: 'Integrar pagamento',
    description: 'Configure o gateway (ex.: Asaas) para cobrar por PIX, boleto ou cartão.',
    actionLabel: 'Configurar pagamentos',
    actionHref: '/settings/payments',
  },
  {
    id: 'first_invoice',
    title: 'Criar fatura',
    description: 'Emita uma fatura de cliente para testar o fluxo de cobrança.',
    actionLabel: 'Nova fatura',
    actionHref: '/customer-invoices/new',
  },
  {
    id: 'invite_users',
    title: 'Criar usuários',
    description: 'Convide colaboradores quando seu plano permitir mais de um acesso.',
    actionLabel: 'Gerenciar usuários',
    actionHref: '/settings?section=users',
  },
];

function defById(id: ActivationMissionId): Omit<ActivationMissionPublic, 'isApplicable' | 'isCompleted'> {
  const d = MISSION_DEFS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown mission ${id}`);
  return d;
}

async function loadDismissed(userId: string): Promise<boolean> {
  const r = await pool.query<{ hide: boolean }>(
    `SELECT COALESCE(hide_dashboard_activation_checklist, false) AS hide FROM profiles WHERE id = $1`,
    [userId]
  );
  return r.rows[0]?.hide === true;
}

/**
 * WhatsApp: instância do tenant com status conectado ou número vinculado (chat_instances + users do tenant).
 */
async function hasWhatsappConfigured(tenantId: string): Promise<boolean> {
  const r = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM chat_instances ci
       INNER JOIN users u ON u.id = ci.user_id
       WHERE u.tenant_id = $1
         AND (
           ci.status = 'connected'
           OR (ci.connected_phone IS NOT NULL AND btrim(ci.connected_phone) <> '')
         )
     ) AS ok`,
    [tenantId]
  );
  return r.rows[0]?.ok === true;
}

async function countClientsForTenant(tenantId: string): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id
     WHERE u.tenant_id = $1`,
    [tenantId]
  );
  return parseInt(r.rows[0]?.n ?? '0', 10) || 0;
}

async function countInvoicesForTenant(tenantId: string): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM customer_invoices WHERE tenant_id = $1`,
    [tenantId]
  );
  return parseInt(r.rows[0]?.n ?? '0', 10) || 0;
}

async function countUsersForTenant(tenantId: string): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM users WHERE tenant_id = $1`,
    [tenantId]
  );
  return parseInt(r.rows[0]?.n ?? '0', 10) || 0;
}

/** Efetivo: override do tenant ou limite do plano; null = ilimitado. */
async function effectiveMaxUsers(tenantId: string): Promise<number | null> {
  const r = await pool.query<{ max_u: number | null }>(
    `SELECT COALESCE(t.max_users_override, p.max_users) AS max_u
     FROM tenants t
     JOIN plans p ON p.id = t.plan_id
     WHERE t.id = $1`,
    [tenantId]
  );
  return r.rows[0]?.max_u ?? null;
}

async function hasActiveCrmPaymentGateway(tenantId: string): Promise<boolean> {
  const cfg = await getActiveConfig('crm', tenantId);
  if (!cfg?.credentials || typeof cfg.credentials !== 'object') return false;
  const apiKey = (cfg.credentials as Record<string, unknown>).api_key;
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

export async function buildActivationChecklist(
  tenantId: string,
  userId: string
): Promise<ActivationChecklistResponse> {
  const dismissed = await loadDismissed(userId);
  if (dismissed) {
    return {
      dismissed: true,
      applicableTotal: 0,
      completedCount: 0,
      progressPercent: 100,
      pendingMissions: [],
    };
  }

  const [
    whatsappOk,
    clientCount,
    paymentOk,
    invoiceCount,
    userCount,
    maxUsers,
  ] = await Promise.all([
    hasWhatsappConfigured(tenantId),
    countClientsForTenant(tenantId),
    hasActiveCrmPaymentGateway(tenantId),
    countInvoicesForTenant(tenantId),
    countUsersForTenant(tenantId),
    effectiveMaxUsers(tenantId),
  ]);

  const inviteApplicable = maxUsers == null || maxUsers > 1;

  const states: Record<ActivationMissionId, { applicable: boolean; completed: boolean }> = {
    whatsapp: { applicable: true, completed: whatsappOk },
    first_client: { applicable: true, completed: clientCount >= 1 },
    payment_gateway: { applicable: true, completed: paymentOk },
    first_invoice: { applicable: true, completed: invoiceCount >= 1 },
    invite_users: { applicable: inviteApplicable, completed: !inviteApplicable || userCount > 1 },
  };

  const missions: ActivationMissionPublic[] = (
    [
      'whatsapp',
      'first_client',
      'payment_gateway',
      'first_invoice',
      'invite_users',
    ] as ActivationMissionId[]
  ).map((id) => {
    const s = states[id];
    const base = defById(id);
    return {
      ...base,
      isApplicable: s.applicable,
      isCompleted: s.completed,
    };
  });

  const applicable = missions.filter((m) => m.isApplicable);
  const applicableTotal = applicable.length;
  const completedCount = applicable.filter((m) => m.isCompleted).length;
  const progressPercent =
    applicableTotal === 0 ? 100 : Math.round((completedCount / applicableTotal) * 100);

  const pendingMissions = applicable
    .filter((m) => !m.isCompleted)
    .map(({ id, title, description, actionLabel, actionHref }) => ({
      id,
      title,
      description,
      actionLabel,
      actionHref,
    }));

  return {
    dismissed: false,
    applicableTotal,
    completedCount,
    progressPercent,
    pendingMissions,
  };
}

export async function setActivationChecklistDismissed(userId: string): Promise<void> {
  await pool.query(
    `UPDATE profiles SET hide_dashboard_activation_checklist = true, updated_at = now() WHERE id = $1`,
    [userId]
  );
}
