import type { LucideIcon } from 'lucide-react';
import {
  Clock,
  FileText,
  GitBranch,
  Globe,
  Hash,
  Kanban,
  MessageSquareText,
  PauseCircle,
  PhoneCall,
  Play,
  StopCircle,
  Tag,
  UserPlus,
  Users,
  Webhook,
  Receipt,
  ListOrdered,
  ListTree,
  CircleCheckBig,
  Ticket,
} from 'lucide-react';
import type { EssentialNodeType } from '../lib/nodeCatalog';

export type NodeVisual = {
  headerClass: string;
  Icon: LucideIcon;
};

/** Visual Typebot-like: header colorido por tipo. */
export const NODE_VISUALS: Record<EssentialNodeType, NodeVisual> = {
  start: {
    headerClass: 'bg-emerald-600 text-white',
    Icon: Play,
  },
  send_message: {
    headerClass: 'bg-sky-600 text-white',
    Icon: MessageSquareText,
  },
  wait_input: {
    headerClass: 'bg-violet-600 text-white',
    Icon: PauseCircle,
  },
  menu_choice: {
    headerClass: 'bg-violet-700 text-white',
    Icon: ListTree,
  },
  condition: {
    headerClass: 'bg-amber-500 text-white',
    Icon: GitBranch,
  },
  transfer_human: {
    headerClass: 'bg-orange-600 text-white',
    Icon: Users,
  },
  end: {
    headerClass: 'bg-slate-700 text-white',
    Icon: StopCircle,
  },
  conversation_note: {
    headerClass: 'bg-yellow-700 text-white',
    Icon: FileText,
  },
  resolve_conversation: {
    headerClass: 'bg-rose-700 text-white',
    Icon: CircleCheckBig,
  },
  ensure_conversation: {
    headerClass: 'bg-emerald-700 text-white',
    Icon: PhoneCall,
  },
  set_variable: {
    headerClass: 'bg-teal-600 text-white',
    Icon: Hash,
  },
  add_tag: {
    headerClass: 'bg-fuchsia-600 text-white',
    Icon: Tag,
  },
  assign_agent: {
    headerClass: 'bg-indigo-600 text-white',
    Icon: UserPlus,
  },
  move_kanban: {
    headerClass: 'bg-blue-700 text-white',
    Icon: Kanban,
  },
  kanban_add_card: {
    headerClass: 'bg-blue-800 text-white',
    Icon: Kanban,
  },
  delay: {
    headerClass: 'bg-cyan-700 text-white',
    Icon: Clock,
  },
  http_request: {
    headerClass: 'bg-zinc-800 text-white',
    Icon: Globe,
  },
  webhook_out: {
    headerClass: 'bg-stone-700 text-white',
    Icon: Webhook,
  },
  webhook_in: {
    headerClass: 'bg-emerald-800 text-white',
    Icon: Webhook,
  },
  lookup_invoice: {
    headerClass: 'bg-lime-700 text-white',
    Icon: Receipt,
  },
  select_invoice: {
    headerClass: 'bg-lime-800 text-white',
    Icon: ListOrdered,
  },
  invoice_assist: {
    headerClass: 'bg-lime-700 text-white',
    Icon: Receipt,
  },
  ticket_assist: {
    headerClass: 'bg-sky-700 text-white',
    Icon: Ticket,
  },
  lookup_ticket: {
    headerClass: 'bg-sky-800 text-white',
    Icon: Ticket,
  },
  select_ticket: {
    headerClass: 'bg-sky-900 text-white',
    Icon: ListOrdered,
  },
  ticket_lookup_assist: {
    headerClass: 'bg-sky-700 text-white',
    Icon: Ticket,
  },
  crm_link_check: {
    headerClass: 'bg-teal-700 text-white',
    Icon: Users,
  },
  crm_convert: {
    headerClass: 'bg-teal-800 text-white',
    Icon: UserPlus,
  },
};

export function getNodeVisual(type: string): NodeVisual {
  return (
    NODE_VISUALS[type as EssentialNodeType] ?? {
      headerClass: 'bg-slate-600 text-white',
      Icon: MessageSquareText,
    }
  );
}
