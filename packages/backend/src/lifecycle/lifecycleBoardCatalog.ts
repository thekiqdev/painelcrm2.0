/**
 * Catálogo de boards/colunas conhecidos (seed atual + colunas alvo Sprint H).
 * Usado apenas para validação em resolve — não altera Kanban.
 */
import { OPS_KANBAN_CANONICAL_BOARD_NAMES } from '../services/superadminOpsKanbanFoundation.js';

export const LIFECYCLE_KNOWN_BOARD_NAMES: readonly string[] = OPS_KANBAN_CANONICAL_BOARD_NAMES;

/** Colunas seedadas hoje + destinos futuros do router. */
export const LIFECYCLE_KNOWN_COLUMNS_BY_BOARD: Readonly<Record<string, readonly string[]>> = {
  Aquisição: [
    'Novo lead',
    'Novo Lead',
    'Qualificado',
    'Iniciou cadastro',
    'Checkout',
    'Checkout abandonado',
    'Trial iniciado',
    'Onboarding incompleto',
    'Ativado',
    'Perdido',
  ],
  Recovery: ['Novo caso', 'Contato tentado', 'Em recuperação', 'Reengajado', 'Perdido'],
  Onboarding: [
    'Aguardando kickoff',
    'Em progresso',
    'Incompleto',
    'Ativado',
    'Provisionado',
    'Onboarding concluído',
  ],
  Expansão: ['Oportunidade', 'Negociação', 'Expandido', 'Novo Cliente'],
  Reativação: [
    'Inativo detectado',
    'Campanha enviada',
    'Reativado',
    'Trial expirado',
    'Dia 1',
    'Dia 3',
    'Dia 7',
    'Última tentativa',
    'Cancelado',
  ],
};

export function isKnownLifecycleBoard(boardName: string): boolean {
  const n = boardName.trim();
  return LIFECYCLE_KNOWN_BOARD_NAMES.some((b) => b.toLowerCase() === n.toLowerCase());
}

export function isKnownLifecycleColumn(boardName: string, columnName: string): boolean {
  const boardKey = LIFECYCLE_KNOWN_BOARD_NAMES.find(
    (b) => b.toLowerCase() === boardName.trim().toLowerCase(),
  );
  if (!boardKey) return false;
  const cols = LIFECYCLE_KNOWN_COLUMNS_BY_BOARD[boardKey];
  if (!cols) return false;
  const col = columnName.trim().toLowerCase();
  return cols.some((c) => c.toLowerCase() === col);
}
