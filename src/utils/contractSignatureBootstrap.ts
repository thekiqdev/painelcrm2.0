import type { ContractSignatureInviteBootstrapItem } from "@/services/contracts";

/** Mesma chave usada em `ContractDetails` para tokens recentes no browser (operação assistida). */
export const CONTRACT_SIGN_TOKEN_STORAGE_PREFIX = "crm_contract_sig_token:";

export function persistSignatureInviteBootstrap(
  contractId: string,
  items: ContractSignatureInviteBootstrapItem[] | undefined
): void {
  if (!items?.length) return;
  for (const it of items) {
    if ("token" in it && it.token) {
      try {
        sessionStorage.setItem(`${CONTRACT_SIGN_TOKEN_STORAGE_PREFIX}${contractId}:${it.signer_id}`, it.token);
      } catch {
        /* quota / privado */
      }
    }
  }
}

/** Contagens para UX quando o backend devolve `already_active` (token opaco não recuperável). */
export function summarizeSignatureInviteBootstrap(
  items: ContractSignatureInviteBootstrapItem[] | undefined
): { issued: number; alreadyActive: number; errors: number } | null {
  if (!items?.length) return null;
  let issued = 0;
  let alreadyActive = 0;
  let errors = 0;
  for (const it of items) {
    if ("token" in it && it.token) issued += 1;
    else if ("already_active" in it) alreadyActive += 1;
    else if ("error" in it) errors += 1;
  }
  return { issued, alreadyActive, errors };
}
