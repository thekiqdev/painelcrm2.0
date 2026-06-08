/** Mensagem amigável a partir da resposta da API do wizard. */
export function parseWizardApiError(res: {
  error?: string;
  code?: string;
  details?: unknown;
}): string {
  if (res.code === 'logo_invalid') {
    return res.error ?? 'Logo inválido. Use PNG, JPG ou WebP pelo upload.';
  }
  if (res.code === 'company_name_invalid') {
    return res.error ?? 'Informe o nome da sua operação.';
  }
  if (res.code === 'slug_invalid' || res.code === 'slug_unavailable') {
    return res.error ?? 'Escolha um endereço válido e disponível.';
  }
  if (res.code === 'member_email_invalid') {
    return res.error ?? 'Verifique o e-mail dos membros.';
  }
  if (res.error && res.error !== 'Dados inválidos') {
    return res.error;
  }
  return 'Não foi possível salvar. Revise os campos e tente novamente.';
}
