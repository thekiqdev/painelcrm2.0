import https from 'node:https';

import { isValidCnpj, onlyDigits } from '../utils/cpfCnpj.js';

const LOOKUP_TIMEOUT_MS = 8000;

const sourceUrls = (digits: string) => [
  `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
  `https://minhareceita.org/${digits}`,
];

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

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** HTTPS forçando IPv4. Em vários servidores a Brasil API trava no IPv6 até estourar o tempo. */
function fetchCnpjIpv4(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        family: 4,
        headers: { accept: 'application/json', 'user-agent': 'painelcrm' },
        timeout: LOOKUP_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 0 }));
        });
      },
    );
    const onAbort = () => req.destroy(new Error('aborted'));
    init?.signal?.addEventListener('abort', onAbort, { once: true });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.on('close', () => init?.signal?.removeEventListener('abort', onAbort));
    req.end();
  });
}

/**
 * Consulta razão social e nome fantasia. Tenta a Brasil API e, se ela falhar, a Minha Receita.
 * Não grava nada no cliente.
 */
export async function lookupCnpj(
  raw: string,
  fetchImpl: typeof fetch = fetchCnpjIpv4,
): Promise<CnpjLookupResult> {
  const digits = onlyDigits(raw);
  if (!isValidCnpj(digits)) {
    throw new CnpjLookupError('CNPJ inválido.', 400);
  }

  let notFound = false;
  for (const url of sourceUrls(digits)) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: timeoutSignal(LOOKUP_TIMEOUT_MS),
      });
    } catch (error) {
      console.warn('[cnpj-lookup] fonte indisponível', url, error instanceof Error ? error.message : '');
      continue;
    }

    if (response.status === 404) {
      notFound = true;
      continue;
    }
    if (!response.ok) {
      console.warn('[cnpj-lookup] fonte respondeu', response.status, url);
      continue;
    }

    let body: { razao_social?: unknown; nome_fantasia?: unknown };
    try {
      body = (await response.json()) as { razao_social?: unknown; nome_fantasia?: unknown };
    } catch {
      console.warn('[cnpj-lookup] resposta inválida', url);
      continue;
    }

    const razao = textOrNull(body.razao_social, 200);
    if (!razao) continue;
    return {
      razao_social: razao,
      nome_fantasia: textOrNull(body.nome_fantasia, 200),
    };
  }

  if (notFound) {
    throw new CnpjLookupError('CNPJ não encontrado.', 404);
  }
  throw new CnpjLookupError('Consulta de CNPJ indisponível.', 503);
}
