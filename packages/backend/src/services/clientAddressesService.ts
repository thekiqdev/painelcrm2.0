/**
 * S10 — CRUD de endereços do cliente (tenant-scoped).
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';

export class ClientAddressDomainError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'bad_request') {
    super(message);
    this.name = 'ClientAddressDomainError';
    this.status = status;
    this.code = code;
  }
}

export type ClientAddressRow = {
  id: string;
  tenant_id: string;
  client_id: string;
  label: string;
  postal_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientAddressInput = {
  label?: string | null;
  postal_code?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  is_default?: boolean;
};

/** Só dígitos; CEP BR = 8. */
export function normalizePostalCodeDigits(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length ? digits : null;
}

export function formatPostalCodeDisplay(digits: string | null | undefined): string | null {
  const d = normalizePostalCodeDigits(digits);
  if (!d) return null;
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return d;
}

function strOrNull(v: unknown, max = 500): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function normalizeState(v: unknown): string | null {
  const s = strOrNull(v, 2);
  return s ? s.toUpperCase() : null;
}

async function assertClientInTenant(tenantId: string, clientId: string): Promise<void> {
  const r = await pool.query(
    `SELECT c.id
     FROM public.clients c
     INNER JOIN public.users u ON u.id = c.user_id AND u.tenant_id = $1
     WHERE c.id = $2
     LIMIT 1`,
    [tenantId, clientId],
  );
  if (!r.rows[0]) {
    throw new ClientAddressDomainError('Cliente não encontrado neste tenant.', 404, 'client_not_found');
  }
}

async function clearOtherDefaults(
  client: PoolClient,
  tenantId: string,
  clientId: string,
  exceptId?: string,
): Promise<void> {
  if (exceptId) {
    await client.query(
      `UPDATE public.client_addresses
       SET is_default = false, updated_at = now()
       WHERE tenant_id = $1 AND client_id = $2 AND id <> $3 AND is_default = true`,
      [tenantId, clientId, exceptId],
    );
  } else {
    await client.query(
      `UPDATE public.client_addresses
       SET is_default = false, updated_at = now()
       WHERE tenant_id = $1 AND client_id = $2 AND is_default = true`,
      [tenantId, clientId],
    );
  }
}

export async function listClientAddresses(
  tenantId: string,
  clientId: string,
): Promise<ClientAddressRow[]> {
  await assertClientInTenant(tenantId, clientId);
  const r = await pool.query<ClientAddressRow>(
    `SELECT *
     FROM public.client_addresses
     WHERE tenant_id = $1 AND client_id = $2
     ORDER BY is_default DESC, created_at ASC`,
    [tenantId, clientId],
  );
  return r.rows;
}

export async function getClientAddressById(
  tenantId: string,
  clientId: string,
  addressId: string,
): Promise<ClientAddressRow | null> {
  await assertClientInTenant(tenantId, clientId);
  const r = await pool.query<ClientAddressRow>(
    `SELECT *
     FROM public.client_addresses
     WHERE tenant_id = $1 AND client_id = $2 AND id = $3
     LIMIT 1`,
    [tenantId, clientId, addressId],
  );
  return r.rows[0] ?? null;
}

export async function createClientAddress(params: {
  tenantId: string;
  clientId: string;
  userId: string;
  input: ClientAddressInput;
}): Promise<ClientAddressRow> {
  await assertClientInTenant(params.tenantId, params.clientId);

  const label = strOrNull(params.input.label, 120) || 'Principal';
  const postal = formatPostalCodeDisplay(normalizePostalCodeDigits(params.input.postal_code));
  const street = strOrNull(params.input.street, 300);
  const number = strOrNull(params.input.number, 40);
  const complement = strOrNull(params.input.complement, 120);
  const neighborhood = strOrNull(params.input.neighborhood, 120);
  const city = strOrNull(params.input.city, 120);
  const state = normalizeState(params.input.state);

  const existing = await listClientAddresses(params.tenantId, params.clientId);
  const wantDefault = params.input.is_default === true || existing.length === 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (wantDefault) {
      await clearOtherDefaults(client, params.tenantId, params.clientId);
    }
    const ins = await client.query<ClientAddressRow>(
      `INSERT INTO public.client_addresses (
         tenant_id, client_id, label, postal_code, street, number, complement,
         neighborhood, city, state, is_default, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        params.tenantId,
        params.clientId,
        label,
        postal,
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        wantDefault,
        params.userId,
      ],
    );
    await client.query('COMMIT');
    return ins.rows[0]!;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function updateClientAddress(params: {
  tenantId: string;
  clientId: string;
  addressId: string;
  input: ClientAddressInput;
}): Promise<ClientAddressRow> {
  const current = await getClientAddressById(params.tenantId, params.clientId, params.addressId);
  if (!current) {
    throw new ClientAddressDomainError('Endereço não encontrado.', 404, 'not_found');
  }

  const next = {
    label:
      params.input.label !== undefined
        ? strOrNull(params.input.label, 120) || current.label
        : current.label,
    postal_code:
      params.input.postal_code !== undefined
        ? formatPostalCodeDisplay(normalizePostalCodeDigits(params.input.postal_code))
        : current.postal_code,
    street: params.input.street !== undefined ? strOrNull(params.input.street, 300) : current.street,
    number: params.input.number !== undefined ? strOrNull(params.input.number, 40) : current.number,
    complement:
      params.input.complement !== undefined
        ? strOrNull(params.input.complement, 120)
        : current.complement,
    neighborhood:
      params.input.neighborhood !== undefined
        ? strOrNull(params.input.neighborhood, 120)
        : current.neighborhood,
    city: params.input.city !== undefined ? strOrNull(params.input.city, 120) : current.city,
    state: params.input.state !== undefined ? normalizeState(params.input.state) : current.state,
    is_default:
      params.input.is_default !== undefined ? params.input.is_default === true : current.is_default,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (next.is_default) {
      await clearOtherDefaults(client, params.tenantId, params.clientId, params.addressId);
    }
    const upd = await client.query<ClientAddressRow>(
      `UPDATE public.client_addresses SET
         label = $4,
         postal_code = $5,
         street = $6,
         number = $7,
         complement = $8,
         neighborhood = $9,
         city = $10,
         state = $11,
         is_default = $12,
         updated_at = now()
       WHERE tenant_id = $1 AND client_id = $2 AND id = $3
       RETURNING *`,
      [
        params.tenantId,
        params.clientId,
        params.addressId,
        next.label,
        next.postal_code,
        next.street,
        next.number,
        next.complement,
        next.neighborhood,
        next.city,
        next.state,
        next.is_default,
      ],
    );
    if (!upd.rows[0]) {
      throw new ClientAddressDomainError('Endereço não encontrado.', 404, 'not_found');
    }
    // Se desmarcou o único default, promove o mais antigo
    if (!next.is_default && current.is_default) {
      const anyDefault = await client.query(
        `SELECT 1 FROM public.client_addresses
         WHERE tenant_id = $1 AND client_id = $2 AND is_default = true
         LIMIT 1`,
        [params.tenantId, params.clientId],
      );
      if (!anyDefault.rows[0]) {
        await client.query(
          `UPDATE public.client_addresses SET is_default = true, updated_at = now()
           WHERE id = (
             SELECT id FROM public.client_addresses
             WHERE tenant_id = $1 AND client_id = $2
             ORDER BY created_at ASC
             LIMIT 1
           )`,
          [params.tenantId, params.clientId],
        );
      }
    }
    await client.query('COMMIT');
    const refreshed = await getClientAddressById(
      params.tenantId,
      params.clientId,
      params.addressId,
    );
    return refreshed ?? upd.rows[0]!;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteClientAddress(params: {
  tenantId: string;
  clientId: string;
  addressId: string;
}): Promise<void> {
  const current = await getClientAddressById(params.tenantId, params.clientId, params.addressId);
  if (!current) {
    throw new ClientAddressDomainError('Endereço não encontrado.', 404, 'not_found');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM public.client_addresses
       WHERE tenant_id = $1 AND client_id = $2 AND id = $3`,
      [params.tenantId, params.clientId, params.addressId],
    );
    if (current.is_default) {
      await client.query(
        `UPDATE public.client_addresses SET is_default = true, updated_at = now()
         WHERE id = (
           SELECT id FROM public.client_addresses
           WHERE tenant_id = $1 AND client_id = $2
           ORDER BY created_at ASC
           LIMIT 1
         )`,
        [params.tenantId, params.clientId],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
