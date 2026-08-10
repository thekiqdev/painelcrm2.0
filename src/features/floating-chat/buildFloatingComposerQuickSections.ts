import type { ChatComposerQuickActionSection } from '@/components/chat/ChatComposerQuickActionsPanel';
import type { ChatConversation } from '@/services/chat';
import type { chatCommercialGates } from '@/utils/chatCommercialGates';
import {
  Calendar as CalendarIcon,
  Clock,
  FileSignature,
  FileText,
  LayoutTemplate,
  Images,
  ListTodo,
  Paperclip,
  Receipt,
  Repeat,
  Tag,
  UserCircle,
  UserPlus,
  Users,
  Video,
} from 'lucide-react';

type Commercial = ReturnType<typeof chatCommercialGates>;

export type FloatingComposerQuickCtx = {
  conversation: ChatConversation | null | undefined;
  commercial: Commercial;
  /** Resultado de chatCommercialGates + feature checks nos sites de uso */
  canCreateInvoice: boolean;
  canCreateProposal: boolean;
  canCreateContract: boolean;
  hasSchedulePermission: boolean;
  /** Permissão para gerir grupo (combinação já usada no floating) */
  canManageGroupUi: boolean;
  canManageKanbanTags: boolean;
  permDenied: string;
  /** Desktop: drag-and-drop; mobile: botão Anexar */
  isMobile: boolean;
  canScheduleChatMessage: boolean;
  onAttachFile: () => void;
  /** S33.1 — abrir Media Library picker */
  onMediaLibrary?: () => void;
  onScheduleMessage: () => void;
  onTemplate: () => void;
  /** dispatchCompactAction no floating */
  dispatchAction: (action: string) => void;
  /** Abre painel compacto para gerir tags */
  onOpenProfileForTags: () => void;
  /** Navegar para cliente CRM */
  onOpenClient: () => void;
};

export function buildFloatingComposerQuickSections(
  ctx: FloatingComposerQuickCtx,
): ChatComposerQuickActionSection[] {
  const conv = ctx.conversation;
  const isGroup =
    conv?.conversation_type === 'group' || Boolean(conv?.external_chat_id?.endsWith('@g.us'));
  const crmLinked = Boolean(conv?.client_id || conv?.leadId);

  const messages: ChatComposerQuickActionSection['items'] = [
    ...(ctx.isMobile
      ? [
          {
            id: 'attach',
            label: 'Anexar arquivo',
            description: 'Imagem ou documento',
            icon: Paperclip,
            onSelect: ctx.onAttachFile,
          },
        ]
      : []),
    ...(ctx.onMediaLibrary
      ? [
          {
            id: 'media-library',
            label: 'Biblioteca de mídias',
            description: 'Escolher ou carregar da biblioteca',
            icon: Images,
            onSelect: ctx.onMediaLibrary,
            searchAliases: ['biblioteca', 'midia', 'mídia', 'galeria'],
          },
        ]
      : []),
    ...(ctx.canScheduleChatMessage
      ? [
          {
            id: 'sched-msg',
            label: 'Agendar mensagem',
            description: 'Envio automático futuro',
            icon: Clock,
            onSelect: ctx.onScheduleMessage,
          },
        ]
      : []),
    {
      id: 'tpl',
      label: 'Usar template',
      description: 'Abrir modelos no chat completo',
      icon: LayoutTemplate,
      onSelect: ctx.onTemplate,
    },
  ];

  const financeiro: ChatComposerQuickActionSection['items'] = [];
  if (!isGroup && conv?.client_id && ctx.canCreateInvoice) {
    financeiro.push(
      {
        id: 'inv1',
        label: 'Criar fatura',
        description: 'Cobrança avulsa',
        icon: Receipt,
        onSelect: () => ctx.dispatchAction('invoice_one_off'),
        disabled: !ctx.commercial.canCreateInvoiceFromChatFull,
        disabledReason: ctx.commercial.canCreateInvoiceFromChatFull ? undefined : ctx.permDenied,
      },
      {
        id: 'invsub',
        label: 'Cobrança recorrente',
        description: 'Assinatura com renovações',
        icon: Repeat,
        onSelect: () => ctx.dispatchAction('invoice_recurring'),
        disabled: !ctx.commercial.canCreateInvoiceFromChatFull,
        disabledReason: ctx.commercial.canCreateInvoiceFromChatFull ? undefined : ctx.permDenied,
      },
    );
  }
  if (!isGroup && crmLinked && ctx.canCreateProposal) {
    financeiro.push({
      id: 'prop',
      label: 'Proposta',
      description: 'Orçamento comercial',
      icon: FileText,
      onSelect: () => ctx.dispatchAction('proposal'),
      disabled: !ctx.commercial.canCreateProposalFromChatFull,
      disabledReason: ctx.commercial.canCreateProposalFromChatFull ? undefined : ctx.permDenied,
    });
  }
  if (!isGroup && crmLinked && ctx.canCreateContract && conv?.client_id) {
    financeiro.push({
      id: 'ctr',
      label: 'Contrato',
      description: 'Formalize acordos',
      icon: FileSignature,
      onSelect: () => ctx.dispatchAction('contract'),
      disabled: !ctx.commercial.canCreateContractFromChatFull,
      disabledReason: ctx.commercial.canCreateContractFromChatFull ? undefined : ctx.permDenied,
    });
  }

  const atendimento: ChatComposerQuickActionSection['items'] = [];
  if (ctx.hasSchedulePermission && crmLinked) {
    atendimento.push(
      {
        id: 'sched',
        label: 'Agendar compromisso',
        description: 'Sem sair da conversa',
        icon: CalendarIcon,
        onSelect: () => ctx.dispatchAction('schedule'),
        disabled: !ctx.hasSchedulePermission,
        disabledReason: ctx.hasSchedulePermission ? undefined : ctx.permDenied,
      },
      {
        id: 'mn',
        label: 'Reunião agora',
        description: 'Meet e link no chat',
        icon: Video,
        onSelect: () => ctx.dispatchAction('meet_now'),
        disabled: !ctx.hasSchedulePermission,
        disabledReason: ctx.hasSchedulePermission ? undefined : ctx.permDenied,
      },
      {
        id: 'ml',
        label: 'Reunião depois',
        description: 'Escolher data e hora',
        icon: CalendarIcon,
        onSelect: () => ctx.dispatchAction('meet_later'),
        disabled: !ctx.hasSchedulePermission,
        disabledReason: ctx.hasSchedulePermission ? undefined : ctx.permDenied,
      },
    );
  }
  atendimento.push({
    id: 'task',
    label: 'Criar tarefa',
    description: 'Seguimento interno',
    icon: ListTodo,
    onSelect: () => ctx.dispatchAction('task'),
  });

  if (isGroup && ctx.canManageGroupUi) {
    atendimento.push({
      id: 'grpm',
      label: 'Gerenciar grupo',
      description: 'Definições do grupo',
      icon: Users,
      onSelect: () => ctx.dispatchAction('group_manage'),
      disabled: !ctx.canManageGroupUi,
    });
  }

  const crm: ChatComposerQuickActionSection['items'] = [];

  if (!isGroup && conv?.client_id && ctx.commercial.canViewClientNav) {
    crm.push({
      id: 'cli',
      label: 'Abrir cliente',
      description: 'Ficha no CRM',
      icon: UserCircle,
      onSelect: ctx.onOpenClient,
      disabled: !ctx.commercial.canViewClientNav,
      disabledReason: ctx.commercial.canViewClientNav ? undefined : ctx.permDenied,
    });
  }

  if (!isGroup && ctx.canManageKanbanTags) {
    crm.push({
      id: 'tags',
      label: 'Tags Kanban',
      description: 'Organizar no quadro',
      icon: Tag,
      onSelect: ctx.onOpenProfileForTags,
    });
  }

  if (!isGroup && !crmLinked) {
    crm.push({
      id: 'lead',
      label: 'Criar lead',
      description: 'Qualificar contacto',
      icon: UserPlus,
      onSelect: () => ctx.dispatchAction('create_lead'),
      disabled: !ctx.commercial.canCreateLeadFromChat,
      disabledReason: ctx.commercial.canCreateLeadFromChat ? undefined : ctx.permDenied,
    });
    crm.push({
      id: 'cli-new',
      label: 'Criar cliente',
      description: 'Novo registo e vínculo',
      icon: UserCircle,
      onSelect: () => ctx.dispatchAction('create_client'),
      disabled: !ctx.commercial.canCreateClientFromChat,
      disabledReason: ctx.commercial.canCreateClientFromChat ? undefined : ctx.permDenied,
    });
  }

  if (!isGroup && conv?.leadId && !conv?.client_id) {
    crm.push({
      id: 'conv',
      label: 'Converter para cliente',
      description: 'Promover o lead',
      icon: UserCircle,
      onSelect: () => ctx.dispatchAction('convert_lead'),
      disabled: !ctx.commercial.canConvertLeadToClient,
      disabledReason: ctx.commercial.canConvertLeadToClient ? undefined : ctx.permDenied,
    });
  }

  const sections: ChatComposerQuickActionSection[] = [{ id: 'msg', title: 'Mensagens', items: messages }];
  if (financeiro.length) sections.push({ id: 'fin', title: 'Financeiro', items: financeiro });
  if (atendimento.length) sections.push({ id: 'at', title: 'Atendimento', items: atendimento });
  if (crm.length) sections.push({ id: 'crm', title: 'CRM', items: crm });
  return sections;
}
