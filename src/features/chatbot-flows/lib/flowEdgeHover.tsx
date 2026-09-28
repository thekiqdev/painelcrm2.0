import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type EdgeHoverApi = {
  hoveredEdgeId: string | null;
  setHoveredEdgeId: (id: string | null) => void;
};

const EdgeHoverContext = createContext<EdgeHoverApi>({
  hoveredEdgeId: null,
  setHoveredEdgeId: () => {},
});

export function FlowEdgeHoverProvider({ children }: { children: ReactNode }) {
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const value = useMemo(
    () => ({ hoveredEdgeId, setHoveredEdgeId }),
    [hoveredEdgeId]
  );
  return <EdgeHoverContext.Provider value={value}>{children}</EdgeHoverContext.Provider>;
}

export function useFlowEdgeHover() {
  return useContext(EdgeHoverContext);
}
