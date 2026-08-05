import { createContext, useContext } from 'react';

const FlowEditorDirtyContext = createContext<(() => void) | null>(null);

export const FlowEditorDirtyProvider = FlowEditorDirtyContext.Provider;

/** Marca o draft como dirty a partir de nós custom (sticky/seta/duplicar). */
export function useFlowEditorDirty(): () => void {
  return useContext(FlowEditorDirtyContext) ?? (() => undefined);
}

/** Alias usado por sticky/seta. */
export const useMarkFlowDirty = useFlowEditorDirty;
