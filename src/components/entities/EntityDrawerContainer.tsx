import { EntityQuickViewDrawer } from "./EntityQuickViewDrawer";

/**
 * Container global do perfil rápido (cliente / lead).
 * Reutiliza `EntityQuickViewDrawer` — apenas centraliza o mount no App.
 */
export function EntityDrawerContainer() {
  return <EntityQuickViewDrawer />;
}
