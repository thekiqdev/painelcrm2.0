const PENDING_DOMAIN = '@signup.painelcrm.local';

export function pendingSignupEmailFromPhoneDigits(phoneDigits: string): string {
  const digits = phoneDigits.replace(/\D/g, '');
  return `pending+${digits}${PENDING_DOMAIN}`;
}

export function isPendingSignupEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.startsWith('pending+') && e.endsWith(PENDING_DOMAIN);
}
