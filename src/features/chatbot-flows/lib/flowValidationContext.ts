import { createContext, useContext } from 'react';
import type { GraphValidationIssue } from './nodeCatalog';

export type FlowValidationContextValue = {
  issues: GraphValidationIssue[];
  openIssueNodeId: string | null;
  setOpenIssueNodeId: (id: string | null) => void;
  autofixIssue: (issue: GraphValidationIssue) => void;
  focusNode: (nodeId: string) => void;
};

const FlowValidationContext = createContext<FlowValidationContextValue | null>(null);

export function useFlowValidation(): FlowValidationContextValue | null {
  return useContext(FlowValidationContext);
}

export { FlowValidationContext };
