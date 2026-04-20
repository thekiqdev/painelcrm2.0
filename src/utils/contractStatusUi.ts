/**
 * Rótulos de apresentação para o módulo de contratos (Etapa 6).
 * O enum interno do backend mantém-se; aqui clarificamos ACTIVE vs “concluído” para o operador.
 */
import type { ContractStatus } from "@/types/contracts";

export const CONTRACT_DELETE_ALLOWED_STATUSES: ReadonlySet<ContractStatus> = new Set(["CANCELLED", "INACTIVE"]);

export interface ContractStatusUiInput {
  status: ContractStatus;
  /** Quando true e status ACTIVE: o fluxo de assinaturas está completo do ponto de vista operacional. */
  allSignersSigned: boolean;
}

/** Texto curto para badges e cabeçalhos. */
export function contractStatusShortLabel(input: ContractStatusUiInput): string {
  const { status, allSignersSigned } = input;
  if (status === "ACTIVE" && allSignersSigned) return "Concluído";
  if (status === "ACTIVE") return "Ativo";
  if (status === "DRAFT") return "Rascunho";
  if (status === "PENDING_SIGNATURE") return "Pendente assinatura";
  if (status === "PARTIALLY_SIGNED") return "Parcial";
  if (status === "INACTIVE") return "Inativo";
  if (status === "EXPIRED") return "Expirado";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

/** Descrição para tooltips / texto auxiliar. */
export function contractStatusHint(input: ContractStatusUiInput): string {
  const { status, allSignersSigned } = input;
  if (status === "ACTIVE" && allSignersSigned) {
    return "Todas as assinaturas necessárias foram registadas. O contrato está ativo no sistema.";
  }
  if (status === "ACTIVE") {
    return "Contrato ativo no sistema (verifique se ainda faltam assinaturas operacionais).";
  }
  if (status === "PENDING_SIGNATURE") {
    return "Aguarda assinaturas. Use convites na aba Assinaturas.";
  }
  if (status === "PARTIALLY_SIGNED") {
    return "Parte das assinaturas já foi concluída.";
  }
  if (status === "CANCELLED") {
    return "Cancelado: links públicos de visualização e convites pendentes são invalidados.";
  }
  return "";
}

/** Regra de negócio de exclusão definitiva de contrato (UI). */
export function canDeleteContractStatus(status: ContractStatus): boolean {
  return CONTRACT_DELETE_ALLOWED_STATUSES.has(status);
}
