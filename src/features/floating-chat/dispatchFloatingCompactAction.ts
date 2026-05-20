/** Evento interno: ações rápidas do compositor → painel compacto / diálogos. */
export const FLOATING_COMPACT_ACTION_EVENT = 'floating-chat:compact-action';

const ACTIONS_REQUIRING_COMPACT_PROFILE = new Set([
  'invoice',
  'invoice_one_off',
  'invoice_recurring',
  'proposal',
  'contract',
  'schedule',
  'meet_later',
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
};

/**
 * Dispara ação do compositor flutuante.
 * @returns `true` se o caller deve tratar `meet_now` localmente (sem abrir perfil).
 */
export function dispatchFloatingCompactAction(opts: DispatchFloatingCompactActionOpts): boolean {
  const { conversationId, action, compactProfileOpen, ensureCompactProfileOpen } = opts;

  if (action === 'meet_now') {
    return true;
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
