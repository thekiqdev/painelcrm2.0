import { useSyncExternalStore } from "react";
import { resolveEntityIdentity } from "@/lib/entity/resolveEntityIdentity";

export type EntityDrawerEntityType = "client" | "lead";

export type EntityDrawerOpenHints = {
  convertedToClientId?: string | null;
  migratedClientId?: string | null;
};

type DrawerSnapshot = {
  isOpen: boolean;
  entityType: EntityDrawerEntityType | null;
  entityId: string | null;
};

type Listener = () => void;

let snapshot: DrawerSnapshot = {
  isOpen: false,
  entityType: null,
  entityId: null,
};

const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((l) => l());
}

function setSnapshot(partial: Partial<DrawerSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  emit();
}

function open(type: EntityDrawerEntityType, id: string, hints?: EntityDrawerOpenHints): void {
  const entityId = id.trim();
  if (!entityId) return;
  const convertedHint = hints?.convertedToClientId ?? hints?.migratedClientId ?? null;
  const resolved = resolveEntityIdentity({
    entityType: type,
    entityId,
    id: entityId,
    converted_to_client_id: convertedHint,
    migrated_client_id: convertedHint,
  });
  setSnapshot({ isOpen: true, entityType: resolved.entityType, entityId: resolved.entityId });
}

function close(): void {
  setSnapshot({ isOpen: false, entityType: null, entityId: null });
}

/** Store imperativo (fora de React). */
export const entityDrawerStore = {
  getState: (): DrawerSnapshot => snapshot,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  open,
  close,
  /** @deprecated use `open('client', id)` */
  openClientDrawer(clientId: string): void {
    open("client", clientId);
  },
  /** @deprecated use `open('lead', id)` */
  openLeadDrawer(leadId: string): void {
    open("lead", leadId);
  },
  /** @deprecated use `close()` */
  closeEntityDrawer(): void {
    close();
  },
};

export type EntityDrawerStoreState = DrawerSnapshot & {
  open: typeof open;
  close: typeof close;
};

/** Hook React — estado + ações `open` / `close`. */
export function useEntityDrawerStore(): EntityDrawerStoreState {
  const state = useSyncExternalStore(
    entityDrawerStore.subscribe,
    entityDrawerStore.getState,
    entityDrawerStore.getState,
  );
  return {
    ...state,
    open: entityDrawerStore.open,
    close: entityDrawerStore.close,
  };
}
