export type CnpjLookupResult = {
  razao_social: string;
  nome_fantasia: string | null;
};

/**
 * Preenche só o que ainda está vazio.
 * Razão social digitada e nome fantasia digitado permanecem.
 */
export function cnpjLookupFill(input: {
  razaoSocial: string;
  company: string;
  found: CnpjLookupResult;
}): { razao_social?: string; company?: string } {
  const patch: { razao_social?: string; company?: string } = {};
  const razao = input.found.razao_social.trim();
  const fantasia = input.found.nome_fantasia?.trim() ?? "";
  if (!input.razaoSocial.trim() && razao) patch.razao_social = razao.slice(0, 200);
  if (!input.company.trim() && fantasia) patch.company = fantasia.slice(0, 200);
  return patch;
}
