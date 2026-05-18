export function isValidEntityId(value?: string | null): boolean {
  if (value == null || typeof value !== "string") return false;
  const s = value.trim();
  if (!s) return false;
  if (s.includes("/") || s.includes("..") || s.includes("\\")) return false;
  return true;
}

export function getClientUrl(clientId: string, options?: { tab?: string }): string {
  const base = `/clients/${clientId}`;
  const tab = options?.tab?.trim();
  if (tab) return `${base}/${tab}`;
  return base;
}

export function getLeadUrl(leadId: string): string {
  return `/leads?openLeadId=${encodeURIComponent(leadId)}`;
}
