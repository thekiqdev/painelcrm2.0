const PREFIX = "proposal_public_link_";

export function getStoredProposalPublicUrl(proposalId: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + proposalId);
  } catch {
    return null;
  }
}

export function setStoredProposalPublicUrl(proposalId: string, url: string): void {
  try {
    sessionStorage.setItem(PREFIX + proposalId, url);
  } catch {
    /* ignore */
  }
}

export function clearStoredProposalPublicUrl(proposalId: string): void {
  try {
    sessionStorage.removeItem(PREFIX + proposalId);
  } catch {
    /* ignore */
  }
}
