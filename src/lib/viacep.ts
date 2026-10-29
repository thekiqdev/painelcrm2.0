/** Lookup ViaCEP (client-side). Retorna null se CEP inválido / não encontrado / rede. */

export type ViaCepResult = {
  postal_code: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

export function onlyDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

export function formatCepMask(digitsOrMasked: string): string {
  const d = onlyDigits(digitsOrMasked).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export async function lookupViaCep(cepRaw: string): Promise<ViaCepResult | null> {
  const cep = onlyDigits(cepRaw);
  if (cep.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      erro?: boolean;
      cep?: string;
      logradouro?: string;
      complemento?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro) return null;
    return {
      postal_code: formatCepMask(cep),
      street: String(data.logradouro || "").trim(),
      complement: String(data.complemento || "").trim(),
      neighborhood: String(data.bairro || "").trim(),
      city: String(data.localidade || "").trim(),
      state: String(data.uf || "").trim().toUpperCase(),
    };
  } catch {
    return null;
  }
}
