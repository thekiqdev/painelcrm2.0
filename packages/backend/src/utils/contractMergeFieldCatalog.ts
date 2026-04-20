/**
 * Catálogo único de merge fields do módulo de contratos (metadados para UI e documentação).
 * A resolução de valores está em `contractMergeFields.ts`.
 */

export type ContractMergeCategoryId = 'system' | 'contract' | 'client' | 'operator' | 'signer';

export type ContractMergeFieldDefinition = {
  key: string;
  label: string;
  description: string;
  /** Origem lógica do dado (para documentação). */
  source: string;
};

export type ContractMergeFieldCategory = {
  id: ContractMergeCategoryId;
  title: string;
  description?: string;
  fields: ContractMergeFieldDefinition[];
};

export const CONTRACT_MERGE_FIELD_CATEGORIES: ContractMergeFieldCategory[] = [
  {
    id: 'system',
    title: 'Sistema',
    description: 'Contexto da plataforma e do tenant (no congelamento: instante do servidor).',
    fields: [
      {
        key: 'system.name',
        label: 'Nome público do sistema',
        description: 'Nome configurável (env APP_PUBLIC_NAME) ou padrão PainelCRM.',
        source: 'process.env.APP_PUBLIC_NAME ou padrão',
      },
      {
        key: 'system.url',
        label: 'URL base do frontend',
        description: 'FRONTEND_URL (ex.: link da instalação).',
        source: 'process.env.FRONTEND_URL',
      },
      {
        key: 'system.date',
        label: 'Data atual (ISO)',
        description: 'AAAA-MM-DD em UTC.',
        source: 'Relógio do servidor (UTC)',
      },
      {
        key: 'system.date_formatted',
        label: 'Data atual formatada',
        description: 'dd/mm/aaaa (UTC).',
        source: 'Relógio do servidor (UTC)',
      },
      {
        key: 'system.year',
        label: 'Ano atual',
        description: 'Ano numérico (UTC).',
        source: 'Relógio do servidor (UTC)',
      },
      {
        key: 'system.month',
        label: 'Mês atual',
        description: '01–12 (UTC).',
        source: 'Relógio do servidor (UTC)',
      },
      {
        key: 'system.month_name',
        label: 'Nome do mês atual',
        description: 'Ex.: abril (pt-BR, UTC).',
        source: 'Relógio do servidor (UTC)',
      },
      {
        key: 'system.tenant_name',
        label: 'Nome do tenant',
        description: 'Nome da conta (organização) no PainelCRM.',
        source: 'tenants.name via criador do contrato',
      },
      {
        key: 'system.tenant_domain',
        label: 'Domínio do tenant',
        description: 'Campo domain do tenant, se preenchido.',
        source: 'tenants.domain',
      },
      {
        key: 'system.tenant_slug',
        label: 'Slug do tenant',
        description: 'Identificador único slug da conta.',
        source: 'tenants.slug',
      },
    ],
  },
  {
    id: 'contract',
    title: 'Contrato',
    description: 'Dados do registo de contrato no momento do congelamento do documento.',
    fields: [
      {
        key: 'contract.title',
        label: 'Título',
        description: 'Título do contrato.',
        source: 'contracts.title',
      },
      {
        key: 'contract.number',
        label: 'Número do contrato',
        description: 'Código interno exibível (contract_number).',
        source: 'contracts.contract_number',
      },
      {
        key: 'contract.status',
        label: 'Status (código)',
        description: 'Valor enum interno (ex.: DRAFT, ACTIVE).',
        source: 'contracts.status',
      },
      {
        key: 'contract.status_label',
        label: 'Status (legível)',
        description: 'Rótulo em português para o status.',
        source: 'Mapa fixo no backend',
      },
      {
        key: 'contract.created_at',
        label: 'Criado em',
        description: 'Data/hora de criação (ISO).',
        source: 'contracts.created_at',
      },
      {
        key: 'contract.created_at_formatted',
        label: 'Criado em (formatado)',
        description: 'dd/mm/aaaa hh:mm no fuso local do servidor.',
        source: 'contracts.created_at',
      },
      {
        key: 'contract.updated_at',
        label: 'Atualizado em',
        description: 'Data/hora da última atualização (ISO).',
        source: 'contracts.updated_at',
      },
      {
        key: 'contract.updated_at_formatted',
        label: 'Atualizado em (formatado)',
        description: 'dd/mm/aaaa hh:mm no fuso local do servidor.',
        source: 'contracts.updated_at',
      },
      {
        key: 'contract.start_date',
        label: 'Início da vigência',
        description: 'Data de início (dd/mm/aaaa).',
        source: 'contracts.start_date',
      },
      {
        key: 'contract.end_date',
        label: 'Fim da vigência',
        description: 'Data de fim (dd/mm/aaaa).',
        source: 'contracts.end_date',
      },
      {
        key: 'contract.value',
        label: 'Valor (número)',
        description: 'Valor numérico bruto.',
        source: 'contracts.total_value',
      },
      {
        key: 'contract.value_formatted',
        label: 'Valor formatado',
        description: 'Moeda formatada pt-BR.',
        source: 'contracts.total_value + currency',
      },
    ],
  },
  {
    id: 'client',
    title: 'Cliente',
    description:
      'Cadastro CRM vinculado ao contrato (client_id). Sem endereço estruturado no modelo atual de BD.',
    fields: [
      {
        key: 'client.name',
        label: 'Nome',
        description: 'Nome principal do cliente.',
        source: 'clients.name',
      },
      {
        key: 'client.company',
        label: 'Empresa / razão social',
        description: 'Campo company do cadastro (nome empresarial).',
        source: 'clients.company',
      },
      {
        key: 'client.email',
        label: 'E-mail',
        description: 'E-mail do cadastro.',
        source: 'clients.email',
      },
      {
        key: 'client.phone',
        label: 'Telefone',
        description: 'Telefone cadastrado.',
        source: 'clients.phone',
      },
      {
        key: 'client.whatsapp',
        label: 'WhatsApp',
        description: 'Igual ao telefone (não há coluna dedicada no cadastro).',
        source: 'clients.phone',
      },
      {
        key: 'client.document',
        label: 'CPF/CNPJ',
        description: 'Documento sem máscara (cpf_cnpj).',
        source: 'clients.cpf_cnpj',
      },
      {
        key: 'client.status',
        label: 'Status do cliente',
        description: 'Campo status livre do cadastro.',
        source: 'clients.status',
      },
      {
        key: 'client.source',
        label: 'Origem',
        description: 'Fonte do lead/cliente.',
        source: 'clients.source',
      },
      {
        key: 'client.funnel_stage',
        label: 'Etapa do funil',
        description: 'Etapa no funil, se preenchida.',
        source: 'clients.funnel_stage',
      },
      {
        key: 'client.notes',
        label: 'Notas',
        description: 'Observações do cadastro.',
        source: 'clients.notes',
      },
    ],
  },
  {
    id: 'operator',
    title: 'Operador / Responsável',
    description:
      'Utilizador em responsible_id (users + profiles). Não há cargo ou departamento dedicados no modelo atual.',
    fields: [
      {
        key: 'operator.name',
        label: 'Nome completo',
        description: 'first_name + last_name do perfil; senão e-mail.',
        source: 'profiles.first_name, profiles.last_name, users.email',
      },
      {
        key: 'operator.email',
        label: 'E-mail',
        description: 'E-mail de login.',
        source: 'users.email',
      },
      {
        key: 'operator.phone',
        label: 'Telefone / WhatsApp',
        description: 'whatsapp_number do perfil ou do utilizador.',
        source: 'profiles.whatsapp_number, users.whatsapp_number',
      },
      {
        key: 'operator.company',
        label: 'Empresa no perfil',
        description: 'company_name do perfil global.',
        source: 'profiles.company_name',
      },
    ],
  },
  {
    id: 'signer',
    title: 'Signatário (primeiro)',
    description:
      'Apenas o primeiro signatário por signing_order (NULLS LAST), depois created_at. Com vários signatários, use variáveis personalizadas ou não use signer.*.',
    fields: [
      {
        key: 'signer.name',
        label: 'Nome',
        description: 'Nome do primeiro signatário na ordem.',
        source: 'contract_signers.name',
      },
      {
        key: 'signer.status',
        label: 'Estado',
        description: 'signed ou pending.',
        source: 'contract_signers.signed_at',
      },
      {
        key: 'signer.status_label',
        label: 'Estado (legível)',
        description: 'Assinado ou Pendente.',
        source: 'contract_signers.signed_at',
      },
      {
        key: 'signer.signed_at',
        label: 'Data da assinatura',
        description: 'ISO ou vazio se pendente.',
        source: 'contract_signers.signed_at',
      },
      {
        key: 'signer.signed_at_formatted',
        label: 'Data da assinatura (formatada)',
        description: 'dd/mm/aaaa hh:mm ou vazio.',
        source: 'contract_signers.signed_at',
      },
    ],
  },
];

/** Aliases legados → chave canónica (valor copiado do contexto já resolvido). */
export const CONTRACT_MERGE_LEGACY_ALIASES: Record<string, string> = {
  'contract.startDate': 'contract.start_date',
  'contract.endDate': 'contract.end_date',
  'company.name': 'client.company',
  nome_cliente: 'client.name',
  email_cliente: 'client.email',
  cliente_nome: 'client.name',
  cliente_email: 'client.email',
  cpf_cnpj: 'client.document',
  cpf: 'client.document',
  cnpj: 'client.document',
  contract_title: 'contract.title',
  contract_num: 'contract.number',
  contract_number: 'contract.number',
};
