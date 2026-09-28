/** Logo principal exibida no onboarding (painel escuro). */
export function resolveCompanyLogoUrl(logoDark: string | null, logoLight: string | null): string | null {
  return logoDark ?? logoLight;
}
