export const CHAT_MIGRATION_FLAG_KEYS = [
  'CHAT_SINGLE_SOCKET',
  'CHAT_WS_PATCH_MESSAGE',
  'CHAT_WS_PATCH_CONVERSATION',
  'CHAT_WS_PATCH_MESSAGE_UPDATED',
  'CHAT_WS_PATCH_DELETE',
  'CHAT_WS_PATCH_ATTENDANCE',
  'CHAT_INSTANCE_REGISTRY',
  'CHAT_UNREAD_ENGINE',
  'CHAT_ATTENDANCE_RECONCILE',
  'CHAT_AGGREGATED_FLOAT',
  'CHAT_AGGREGATED_LEAD',
  'CHAT_AGGREGATED_SIDEBAR',
  'CHAT_AGGREGATED_CHAT',
  'CHAT_AGGREGATED_API_SHADOW',
  'CHAT_AGGREGATED_DEV_LOG',
  'CHAT_CORE_METRICS',
  'CHAT_CORE_STORE',
] as const;

export type ChatMigrationFlagKey = (typeof CHAT_MIGRATION_FLAG_KEYS)[number];

export type ChatMigrationFlagGroupId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'Desenvolvimento';

export type ChatMigrationFlagDef = {
  key: ChatMigrationFlagKey;
  label: string;
  description: string;
};

export type ChatMigrationFlagGroup = {
  id: ChatMigrationFlagGroupId;
  title: string;
  description: string;
  flags: ChatMigrationFlagDef[];
};

export const CHAT_MIGRATION_FLAG_GROUPS: ChatMigrationFlagGroup[] = [
  {
    id: 'F1',
    title: 'F1 — Socket único',
    description: 'Uma conexão Socket.IO por sessão via Chat Realtime Bridge.',
    flags: [
      {
        key: 'CHAT_SINGLE_SOCKET',
        label: 'Socket único',
        description:
          'Elimina sockets dedicados em Chat.tsx, ClientProfile e Kanban; usa o Bridge compartilhado.',
      },
    ],
  },
  {
    id: 'F2',
    title: 'F2 — WebSocket Patch',
    description: 'Aplica eventos WS diretamente no cache, reduzindo invalidate/refetch.',
    flags: [
      {
        key: 'CHAT_WS_PATCH_MESSAGE',
        label: 'Patch message.created',
        description: 'Insere mensagens no cache do Floating Chat sem refetch HTTP.',
      },
      {
        key: 'CHAT_WS_PATCH_CONVERSATION',
        label: 'Patch conversation.updated',
        description: 'Atualiza metadados e ordenação da lista em cache.',
      },
      {
        key: 'CHAT_WS_PATCH_MESSAGE_UPDATED',
        label: 'Patch message.updated',
        description: 'Atualiza status de entrega/leitura de mensagens em cache.',
      },
      {
        key: 'CHAT_WS_PATCH_DELETE',
        label: 'Patch conversation.deleted',
        description: 'Remove conversas deletadas do cache local.',
      },
      {
        key: 'CHAT_WS_PATCH_ATTENDANCE',
        label: 'Patch attendance updated',
        description: 'Atualiza campos de atendimento na conversa em cache.',
      },
    ],
  },
  {
    id: 'F3',
    title: 'F3 — Instance Registry + Unread Engine',
    description: 'Centraliza instâncias e contadores de inbox com reconcile controlado.',
    flags: [
      {
        key: 'CHAT_INSTANCE_REGISTRY',
        label: 'Instance Registry',
        description: 'Cache deduplicado de GET /api/chat/instances com invalidação por WS.',
      },
      {
        key: 'CHAT_UNREAD_ENGINE',
        label: 'Unread Engine',
        description: 'Contadores derivados incrementalmente; reduz polls de attendance-counts.',
      },
      {
        key: 'CHAT_ATTENDANCE_RECONCILE',
        label: 'Reconcile attendance',
        description: 'Reconcilia contadores via HTTP periodicamente e em reconnect.',
      },
    ],
  },
  {
    id: 'F4',
    title: 'F4 — API agregada de conversas',
    description: 'Substitui loops N+1 por um único HTTP agregado por superfície.',
    flags: [
      {
        key: 'CHAT_AGGREGATED_FLOAT',
        label: 'Floating Chat',
        description: 'Lista e bubble do float via chatConversationsRepository agregado.',
      },
      {
        key: 'CHAT_AGGREGATED_LEAD',
        label: 'Lead / CRM resolve',
        description: 'Embedded lead e resolução CRM via API agregada.',
      },
      {
        key: 'CHAT_AGGREGATED_SIDEBAR',
        label: 'Sidebar / Prefetch',
        description: 'Prefetch idle e keys de sidebar via API agregada.',
      },
      {
        key: 'CHAT_AGGREGATED_CHAT',
        label: 'Chat principal',
        description: 'Inbox /chat.tsx sem merge local quando ativo.',
      },
    ],
  },
  {
    id: 'F5',
    title: 'F5 — Domain Store',
    description:
      'Chat Core como Source of Truth. F5.0: infraestrutura apenas — nenhuma UI consome o store ainda.',
    flags: [
      {
        key: 'CHAT_CORE_STORE',
        label: 'Domain Store',
        description:
          'F5.0: fundação do store (sem impacto em runtime). F5.1+: migração gradual de superfícies.',
      },
    ],
  },
  {
    id: 'Desenvolvimento',
    title: 'Desenvolvimento',
    description: 'Instrumentação e shadow mode — uso restrito a staging/diagnóstico.',
    flags: [
      {
        key: 'CHAT_AGGREGATED_API_SHADOW',
        label: 'Shadow API agregada',
        description: 'Backend compara resposta agregada vs legada sem alterar payload ao cliente.',
      },
      {
        key: 'CHAT_AGGREGATED_DEV_LOG',
        label: 'Logs API agregada',
        description: 'Logs detalhados do módulo agregado no backend.',
      },
      {
        key: 'CHAT_CORE_METRICS',
        label: 'Métricas Chat Core',
        description: 'Console metrics F0–F4 (HTTP evitado, patches, fallbacks).',
      },
    ],
  },
];

export type ChatMigrationFlagsMap = Record<ChatMigrationFlagKey, boolean>;

export function createDefaultChatMigrationFlags(): ChatMigrationFlagsMap {
  return Object.fromEntries(CHAT_MIGRATION_FLAG_KEYS.map((k) => [k, false])) as ChatMigrationFlagsMap;
}

export type ChatAggregatedSurface = 'float' | 'lead' | 'sidebar' | 'chat';

export const CHAT_AGGREGATED_SURFACE_TO_FLAG: Record<ChatAggregatedSurface, ChatMigrationFlagKey> = {
  float: 'CHAT_AGGREGATED_FLOAT',
  lead: 'CHAT_AGGREGATED_LEAD',
  sidebar: 'CHAT_AGGREGATED_SIDEBAR',
  chat: 'CHAT_AGGREGATED_CHAT',
};
