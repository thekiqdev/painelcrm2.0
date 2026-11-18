import { isValidCnpj, onlyDigits } from '../utils/cpfCnpj.js';

const BRASIL_API_CNPJ = 'https://brasilapi.com.br/api/cnpj/v1';
const LOOKUP_TIMEOUT_MS = 4000;

export class CnpjLookupError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'CnpjLookupError';
    this.statusCode = statusCode;
  }
}

export type CnpjLookupResult = {
  razao_social: string;
  nome_fantasia: string | null;
};

function textOrNull(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Consulta a razão social e o nome fantasia de um CNPJ na Brasil API.
 * Não grava nada no cliente. Falha de rede vira erro para a tela ignorar.
 */
export async function lookupCnpj(
  raw: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CnpjLookupResult> {
  const digits = onlyDigits(raw);
  if (!isValidCnpj(digits)) {
    throw new CnpjLookupError('CNPJ inválido.', 400);
  }

  let response: Response;
  try {
    response = await fetchImpl(`${BRASIL_API_CNPJ}/${digits}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
  } catch {
    throw new CnpjLookupError('Consulta de CNPJ indisponível.', 503);
  }

  if (response.status === 404) {
    throw new CnpjLookupError('CNPJ não encontrado.', 404);
  }
  if (!response.ok) {
    throw new CnpjLookupError('Consulta de CNPJ indisponível.', 503);
  }

  let body: { razao_social?: unknown; nome_fantasia?: unknown };
  try {
    body = (await response.json()) as { razao_social?: unknown; nome_fantasia?: unknown };
  } catch {
    throw new CnpjLookupError('Consulta de CNPJ indisponível.', 503);
  }

  const razao = textOrNull(body.razao_social, 200);
  if (!razao) {
    throw new CnpjLookupError('Consulta de CNPJ sem razão social.', 502);
  }
  return {
    razao_social: razao,
    nome_fantasia: textOrNull(body.nome_fantasia, 200),
  };
}
