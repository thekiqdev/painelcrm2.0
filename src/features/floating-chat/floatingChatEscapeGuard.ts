/**
 * Evita que o atalho global do chat flutuante (ESC) interfira com overlays Radix.
 * Conteúdos com `data-state="open"` seguem o padrão dos primitives em `@/components/ui/*`.
 */
export function isFloatingChatEscapeBlocked(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.querySelector('[role="dialog"][data-state="open"]')) return true;
  if (document.querySelector('[role="alertdialog"][data-state="open"]')) return true;
  if (document.querySelector('[data-radix-popover-content][data-state="open"]')) return true;
  if (document.querySelector('[data-radix-dropdown-menu-content][data-state="open"]')) return true;
  if (document.querySelector('[data-radix-select-content][data-state="open"]')) return true;
  if (document.querySelector('[data-radix-context-menu-content][data-state="open"]')) return true;
  return false;
}
