const STORAGE_PREFIX = 'painelcrm:contract-create-wizard';

export type ContractWizardStep = 'select' | 'edit' | 'pdf_signature';
export type ContractWizardOption = 'blank' | 'template' | 'pdf_signature';

export type ContractCreateWizardPersist = {
  step: ContractWizardStep;
  selectedOption: ContractWizardOption;
  pdfContractId?: string;
};

function storageKey(contractId: string | undefined): string {
  return `${STORAGE_PREFIX}:${contractId?.trim() || 'new'}`;
}

export function readContractCreateWizardPersist(
  contractId: string | undefined,
): Partial<ContractCreateWizardPersist> | null {
  try {
    const raw = sessionStorage.getItem(storageKey(contractId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ContractCreateWizardPersist>;
  } catch {
    return null;
  }
}

export function writeContractCreateWizardPersist(
  contractId: string | undefined,
  data: ContractCreateWizardPersist,
): void {
  try {
    sessionStorage.setItem(storageKey(contractId), JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function clearContractCreateWizardPersist(contractId: string | undefined): void {
  try {
    sessionStorage.removeItem(storageKey(contractId));
  } catch {
    /* ignore */
  }
}
