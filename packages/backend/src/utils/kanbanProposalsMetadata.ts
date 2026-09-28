/**
 * Bloco opcional em `chat_kanban_columns.metadata.kanban_proposals` — exibição de totais e automação ao aceitar proposta.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type KanbanProposalsMetadata = {
  show_pending: boolean;
  show_accepted: boolean;
  /** Etapa 2: ao aceitar proposta (status accepted), mover cartão da conversa para outra coluna. */
  move_on_proposal_accept: boolean;
  target_column_id: string | null;
  /**
   * Quando verdadeiro, ao o cartão **entrar** nesta coluna (move ou criação no quadro), o backend cria proposta
   * automaticamente a partir do modelo — exige `default_proposal_model_id` ou legado `default_proposal_template_id`.
   */
  auto_create_proposal_on_enter: boolean;
  /** Modelo oficial (`proposal_templates`); preferido face ao legado abaixo. */
  default_proposal_model_id: string | null;
  /**
   * Legado (Etapa 3 inicial): UUID de rascunho em `proposals`. Mantido só para compatibilidade até reconfigurar a coluna.
   */
  default_proposal_template_id: string | null;
};

export function parseKanbanProposalsMetadata(metadata: unknown): KanbanProposalsMetadata {
  const empty = (): KanbanProposalsMetadata => ({
    show_pending: false,
    show_accepted: false,
    move_on_proposal_accept: false,
    target_column_id: null,
    auto_create_proposal_on_enter: false,
    default_proposal_model_id: null,
    default_proposal_template_id: null,
  });
  if (!metadata || typeof metadata !== 'object') {
    return empty();
  }
  const root = metadata as Record<string, unknown>;
  const raw = root.kanban_proposals;
  if (!raw || typeof raw !== 'object') {
    return empty();
  }
  const o = raw as Record<string, unknown>;
  const tid = o.target_column_id;
  const targetStr = typeof tid === 'string' && UUID_RE.test(tid.trim()) ? tid.trim() : null;
  const tplRaw = o.default_proposal_template_id;
  const templateStr =
    typeof tplRaw === 'string' && UUID_RE.test(tplRaw.trim()) ? tplRaw.trim() : null;
  const modelRaw = o.default_proposal_model_id;
  const modelStr =
    typeof modelRaw === 'string' && UUID_RE.test(modelRaw.trim()) ? modelRaw.trim() : null;
  return {
    show_pending: o.show_pending === true,
    show_accepted: o.show_accepted === true,
    move_on_proposal_accept: o.move_on_proposal_accept === true,
    target_column_id: targetStr,
    auto_create_proposal_on_enter: o.auto_create_proposal_on_enter === true,
    default_proposal_model_id: modelStr,
    default_proposal_template_id: templateStr,
  };
}

/** Validação ao gravar coluna: automação de criação exige modelo configurado. */
export function validateKanbanProposalAutoCreateOnEnter(kp: KanbanProposalsMetadata): string[] {
  if (!kp.auto_create_proposal_on_enter) {
    return [];
  }
  if (!kp.default_proposal_model_id && !kp.default_proposal_template_id) {
    return [
      'Automação «criar proposta ao entrar na coluna»: selecione um modelo de proposta ou desligue a opção.',
    ];
  }
  return [];
}

/** Validação ao gravar coluna (mesmo quadro; destino ≠ coluna atual quando `currentColumnId` definido). */
export function validateKanbanProposalAcceptAutomation(
  currentColumnId: string | null,
  meta: Record<string, unknown>,
  boardColumnIds: Set<string>,
): string[] {
  const kp = parseKanbanProposalsMetadata(meta);
  if (!kp.move_on_proposal_accept) {
    return [];
  }
  if (!kp.target_column_id) {
    return ['Automação «mover ao aceitar proposta»: defina a coluna de destino ou desligue a opção.'];
  }
  if (!boardColumnIds.has(kp.target_column_id)) {
    return ['Automação «mover ao aceitar proposta»: coluna de destino inválida neste quadro.'];
  }
  if (currentColumnId && kp.target_column_id === currentColumnId) {
    return ['Automação «mover ao aceitar proposta»: a coluna de destino não pode ser a mesma coluna.'];
  }
  return [];
}

/** Normaliza e remove chaves inválidas antes de persistir. */
export function sanitizeKanbanProposalsInMetadata(meta: Record<string, unknown>): void {
  const raw = meta.kanban_proposals;
  if (raw === undefined) return;
  if (raw === null || typeof raw !== 'object') {
    delete meta.kanban_proposals;
    return;
  }
  const o = raw as Record<string, unknown>;
  const tid = o.target_column_id;
  const targetStr = typeof tid === 'string' && UUID_RE.test(tid.trim()) ? tid.trim() : null;
  const tplRaw = o.default_proposal_template_id;
  const templateStr =
    typeof tplRaw === 'string' && UUID_RE.test(tplRaw.trim()) ? tplRaw.trim() : null;
  const modelRaw = o.default_proposal_model_id;
  const modelStr =
    typeof modelRaw === 'string' && UUID_RE.test(modelRaw.trim()) ? modelRaw.trim() : null;
  const moveOn = o.move_on_proposal_accept === true;
  const showPending = o.show_pending === true;
  const showAccepted = o.show_accepted === true;
  const autoCreate = o.auto_create_proposal_on_enter === true;

  if (!showPending && !showAccepted && !moveOn && !autoCreate) {
    delete meta.kanban_proposals;
    return;
  }

  const next: Record<string, unknown> = {
    show_pending: showPending,
    show_accepted: showAccepted,
    move_on_proposal_accept: moveOn,
    auto_create_proposal_on_enter: autoCreate,
  };
  if (moveOn && targetStr) {
    next.target_column_id = targetStr;
  }
  if (autoCreate && modelStr) {
    next.default_proposal_model_id = modelStr;
  } else if (autoCreate && templateStr) {
    next.default_proposal_template_id = templateStr;
  }
  meta.kanban_proposals = next;
}
