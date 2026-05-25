/** Evento interno: ações rápidas do compositor → painel compacto / diálogos. */
export const FLOATING_COMPACT_ACTION_EVENT = 'floating-chat:compact-action';

const ACTIONS_REQUIRING_COMPACT_PROFILE = new Set([
  'invoice',
  'invoice_one_off',
  'invoice_recurring',
  'proposal',
  'contract',
  'task',
  'group_manage',
  'convert_lead',
  'create_client',
  'create_lead',
]);

export type DispatchFloatingCompactActionOpts = {
  conversationId: string;
  action: string;
  compactProfileOpen: boolean;
  ensureCompactProfileOpen: (conversationId: string) => void;
  /** Abre painel lateral de agendamento (sem popup). */
  openAppointmentPanel?: (conversationId: string) => void;
};

/**
 * Dispara ação do compositor flutuante.
 * @returns `true` se o caller deve tratar `meet_now` localmente (sem abrir perfil).
 */
export function dispatchFloatingCompactAction(opts: DispatchFloatingCompactActionOpts): boolean {
  const { conversationId, action, compactProfileOpen, ensureCompactProfileOpen, openAppointmentPanel } = opts;

  if (action === 'meet_now') {
    return true;
  }

  if ((action === 'schedule' || action === 'meet_later') && openAppointmentPanel) {
    openAppointmentPanel(conversationId);
    return false;
  }

  if (ACTIONS_REQUIRING_COMPACT_PROFILE.has(action) && !compactProfileOpen) {
    ensureCompactProfileOpen(conversationId);
  }

  queueMicrotask(() => {
    window.dispatchEvent(
      new CustomEvent(FLOATING_COMPACT_ACTION_EVENT, {
        detail: { conversationId, action },
      }),
    );
  });

  return false;
}
