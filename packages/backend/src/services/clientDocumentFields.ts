import { isValidCnpj, isValidCpf, onlyDigits } from '../utils/cpfCnpj.js';

export class ClientDocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientDocumentValidationError';
  }
}

export type BillingDocumentKind = 'cpf' | 'cnpj';

export type ClientDocumentExisting = {
  cpf: string | null;
  cnpj: string | null;
  billing_document: BillingDocumentKind | null;
  cpf_cnpj: string | null;
};

export type ClientDocumentBody = {
  cpf?: string | null;
  cnpj?: string | null;
  rg?: string | null;
  razao_social?: string | null;
  billing_document?: string | null;
  cpf_cnpj?: string | null;
};

export type ClientDocumentPatch = {
  cpf?: string | null;
  cnpj?: string | null;
  rg?: string | null;
  razao_social?: string | null;
  billing_document?: BillingDocumentKind | null;
  cpf_cnpj?: string | null;
};

const DOCUMENT_KEYS = ['cpf', 'cnpj', 'rg', 'razao_social', 'billing_document', 'cpf_cnpj'] as const;

export function presentDocumentKeys(body: object): Set<string> {
  return new Set(DOCUMENT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(body, key)));
}

function optionalText(value: string | null | undefined, max: number, label: string): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new ClientDocumentValidationError(`${label} deve ter no máximo ${max} caracteres.`);
  }
  return trimmed;
}

function parseCpf(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = onlyDigits(value);
  if (!digits) return null;
  if (!isValidCpf(digits)) throw new ClientDocumentValidationError('CPF inválido.');
  return digits;
}

function parseCnpj(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = onlyDigits(value);
  if (!digits) return null;
  if (!isValidCnpj(digits)) throw new ClientDocumentValidationError('CNPJ inválido.');
  return digits;
}

/** Campo único antigo: só o tamanho. O cadastro atual ainda grava por aqui. */
function parseLegacyCpfCnpj(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digits = onlyDigits(value);
  if (!digits) return null;
  if (digits.length !== 11 && digits.length !== 14) {
    throw new ClientDocumentValidationError('CPF/CNPJ deve ter 11 (CPF) ou 14 (CNPJ) dígitos.');
  }
  return digits;
}

function starredDigits(
  kind: BillingDocumentKind | null,
  cpf: string | null,
  cnpj: string | null,
): string | null {
  if (kind === 'cpf') return cpf;
  if (kind === 'cnpj') return cnpj;
  return null;
}

/**
 * Monta o patch de documentos do cliente.
 * O primeiro CPF ou CNPJ define a cobrança. O segundo não troca a estrela.
 * `cpf_cnpj` segue o documento da estrela.
 */
export function resolveClientDocumentPatch(
  body: ClientDocumentBody,
  present: Set<string>,
  existing: ClientDocumentExisting | null,
): ClientDocumentPatch {
  const base: ClientDocumentExisting = existing ?? {
    cpf: null,
    cnpj: null,
    billing_document: null,
    cpf_cnpj: null,
  };
  const patch: ClientDocumentPatch = {};

  if (present.has('rg')) patch.rg = optionalText(body.rg, 20, 'RG');
  if (present.has('razao_social')) {
    patch.razao_social = optionalText(body.razao_social, 200, 'Razão social');
  }

  const splitTouched = present.has('cpf') || present.has('cnpj') || present.has('billing_document');
  const legacyTouched = present.has('cpf_cnpj') && !splitTouched;
  if (!splitTouched && !legacyTouched) return patch;

  if (legacyTouched) {
    const digits = parseLegacyCpfCnpj(body.cpf_cnpj);
    if (!digits) {
      patch.cpf_cnpj = null;
      patch.billing_document = null;
      if (base.billing_document === 'cpf') patch.cpf = null;
      if (base.billing_document === 'cnpj') patch.cnpj = null;
      return patch;
    }
    if (digits.length === 11) {
      patch.cpf = digits;
      patch.billing_document = 'cpf';
      patch.cpf_cnpj = digits;
    } else {
      patch.cnpj = digits;
      patch.billing_document = 'cnpj';
      patch.cpf_cnpj = digits;
    }
    return patch;
  }

  const nextCpf = present.has('cpf') ? parseCpf(body.cpf) : base.cpf;
  const nextCnpj = present.has('cnpj') ? parseCnpj(body.cnpj) : base.cnpj;
  if (present.has('cpf')) patch.cpf = nextCpf;
  if (present.has('cnpj')) patch.cnpj = nextCnpj;

  let nextBilling: BillingDocumentKind | null = base.billing_document;
  if (present.has('billing_document')) {
    const requested = body.billing_document == null || body.billing_document === ''
      ? null
      : body.billing_document;
    if (requested != null && requested !== 'cpf' && requested !== 'cnpj') {
      throw new ClientDocumentValidationError('Documento de cobrança inválido.');
    }
    if (requested === 'cpf' && !nextCpf) {
      throw new ClientDocumentValidationError('A cobrança em CPF pede um CPF preenchido.');
    }
    if (requested === 'cnpj' && !nextCnpj) {
      throw new ClientDocumentValidationError('A cobrança em CNPJ pede um CNPJ preenchido.');
    }
    nextBilling = requested;
  } else if (nextBilling === 'cpf' && !nextCpf) {
    nextBilling = nextCnpj ? 'cnpj' : null;
  } else if (nextBilling === 'cnpj' && !nextCnpj) {
    nextBilling = nextCpf ? 'cpf' : null;
  } else if (!nextBilling) {
    if (nextCpf) nextBilling = 'cpf';
    else if (nextCnpj) nextBilling = 'cnpj';
  }

  const previousStar = starredDigits(base.billing_document, base.cpf, base.cnpj);
  const nextStar = starredDigits(nextBilling, nextCpf, nextCnpj);
  if (nextBilling !== base.billing_document || nextStar !== previousStar) {
    patch.billing_document = nextBilling;
    patch.cpf_cnpj = nextStar;
  }

  return patch;
}

export type ClientBillingSource = {
  cpf?: string | null;
  cnpj?: string | null;
  billing_document?: string | null;
  cpf_cnpj?: string | null;
};

/** Dígitos que a fatura envia ao gateway. A estrela ganha do espelho `cpf_cnpj`. */
export function clientBillingDigits(row: ClientBillingSource | null | undefined): string | null {
  if (!row) return null;
  const cpf = onlyDigits(row.cpf ?? '');
  const cnpj = onlyDigits(row.cnpj ?? '');
  if (row.billing_document === 'cpf' && cpf.length === 11) return cpf;
  if (row.billing_document === 'cnpj' && cnpj.length === 14) return cnpj;
  const mirror = onlyDigits(row.cpf_cnpj ?? '');
  if (mirror.length === 11 || mirror.length === 14) return mirror;
  if (cpf.length === 11 && cnpj.length !== 14) return cpf;
  if (cnpj.length === 14 && cpf.length !== 11) return cnpj;
  return null;
}

export type NewClientDocumentColumns = {
  cpf: string | null;
  cnpj: string | null;
  billing_document: BillingDocumentKind | null;
  cpf_cnpj: string | null;
};

/** Cliente novo a partir de um único documento (link, loja ou lead). */
export function newClientDocumentColumns(incomingRaw: string | null | undefined): NewClientDocumentColumns {
  const incoming = onlyDigits(incomingRaw ?? '');
  if (incoming.length === 11) {
    return { cpf: incoming, cnpj: null, billing_document: 'cpf', cpf_cnpj: incoming };
  }
  if (incoming.length === 14) {
    return { cpf: null, cnpj: incoming, billing_document: 'cnpj', cpf_cnpj: incoming };
  }
  return { cpf: null, cnpj: null, billing_document: null, cpf_cnpj: incoming || null };
}

/**
 * Documento único em cliente que já existe.
 * 11 grava em cpf e 14 em cnpj. Com estrela definida, o outro campo pode ser preenchido,
 * mas `billing_document` e `cpf_cnpj` não mudam.
 */
export function externalDocumentPatch(
  existing: ClientDocumentExisting,
  incomingRaw: string | null | undefined,
): ClientDocumentPatch {
  const incoming = onlyDigits(incomingRaw ?? '');
  const kind: BillingDocumentKind | null =
    incoming.length === 11 ? 'cpf' : incoming.length === 14 ? 'cnpj' : null;
  if (!kind) return {};

  const star = lockedBillingKind(existing);
  if (star) {
    const patch: ClientDocumentPatch = {};
    if (!existing.billing_document) {
      const locked = clientBillingDigits(existing);
      patch.billing_document = star;
      if (locked && star === 'cpf' && onlyDigits(existing.cpf ?? '') !== locked) patch.cpf = locked;
      if (locked && star === 'cnpj' && onlyDigits(existing.cnpj ?? '') !== locked) patch.cnpj = locked;
    }
    if (kind === star) return patch;
    const currentOther = kind === 'cpf' ? existing.cpf : existing.cnpj;
    if (onlyDigits(currentOther ?? '') === incoming) return patch;
    if (kind === 'cpf') patch.cpf = incoming;
    else patch.cnpj = incoming;
    return patch;
  }

  const cpfDigits = onlyDigits(existing.cpf ?? '');
  const cnpjDigits = onlyDigits(existing.cnpj ?? '');
  if (cpfDigits.length === 11 && cnpjDigits.length === 14) return {};

  return {
    ...(kind === 'cpf' ? { cpf: incoming } : { cnpj: incoming }),
    billing_document: kind,
    cpf_cnpj: incoming,
  };
}

function lockedBillingKind(existing: ClientDocumentExisting): BillingDocumentKind | null {
  if (existing.billing_document === 'cpf' || existing.billing_document === 'cnpj') {
    return existing.billing_document;
  }
  const mirror = onlyDigits(existing.cpf_cnpj ?? '');
  if (mirror.length === 11) return 'cpf';
  if (mirror.length === 14) return 'cnpj';
  const cpf = onlyDigits(existing.cpf ?? '');
  const cnpj = onlyDigits(existing.cnpj ?? '');
  if (cpf.length === 11 && cnpj.length !== 14) return 'cpf';
  if (cnpj.length === 14 && cpf.length !== 11) return 'cnpj';
  return null;
}

const DOCUMENT_PATCH_COLUMNS = ['cpf', 'cnpj', 'rg', 'razao_social', 'billing_document', 'cpf_cnpj'] as const;

export function documentPatchSql(
  patch: ClientDocumentPatch,
  clientId: string,
): { text: string; values: unknown[] } | null {
  const entries = DOCUMENT_PATCH_COLUMNS.flatMap((key) =>
    Object.prototype.hasOwnProperty.call(patch, key) ? [[key, patch[key]] as const] : [],
  );
  if (entries.length === 0) return null;
  const values: unknown[] = entries.map(([, value]) => value);
  values.push(clientId);
  const sets = entries.map(([key], index) => `${key} = $${index + 1}`);
  return {
    text: `UPDATE clients SET ${sets.join(', ')}, updated_at = now() WHERE id = $${entries.length + 1}`,
    values,
  };
}
