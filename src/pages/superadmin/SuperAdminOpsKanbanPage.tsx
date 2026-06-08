import ChatKanbanPage from '@/pages/ChatKanbanPage';
import { superadminOpsKanbanService } from '@/services/superadminOpsKanban';

/**
 * Kanban operacional Super Admin.
 * Seed idempotente ocorre no GET /boards (backend); backfill de leads via POST /bootstrap na UI de scripts se necessário.
 */
export default function SuperAdminOpsKanbanPage() {
  return <ChatKanbanPage service={superadminOpsKanbanService} />;
}

