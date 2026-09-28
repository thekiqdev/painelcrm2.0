import { createContext, useContext, type ReactNode } from 'react';
import { chatKanbanService, type ChatKanbanService } from '@/services/chatKanban';

const KanbanServiceContext = createContext<ChatKanbanService>(chatKanbanService);

type Props = {
  service: ChatKanbanService;
  children: ReactNode;
};

/** Permite reutilizar o Kanban UI com base API tenant ou Super Admin ops. */
export function KanbanServiceProvider({ service, children }: Props) {
  return <KanbanServiceContext.Provider value={service}>{children}</KanbanServiceContext.Provider>;
}

export function useKanbanService(): ChatKanbanService {
  return useContext(KanbanServiceContext);
}
