import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

describe('Contrato: link público não exclui fatura recurring', () => {
  it('SQL 77 — get_customer_invoice_by_payment_token filtra só por payment_token', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const sqlPath = path.resolve(dir, '../../../../database/init/77_payment_token_customer_invoices.sql');
    if (!existsSync(sqlPath)) {
      throw new Error(`Arquivo SQL não encontrado: ${sqlPath}`);
    }
    const sql = readFileSync(sqlPath, 'utf8');
    expect(sql).toMatch(/WHERE\s+ci\.payment_token\s*=\s*p_token/i);
    expect(sql.toLowerCase()).not.toContain("invoice_type <> 'recurring'");
    expect(sql.toLowerCase()).not.toContain('invoice_type !=');
  });
});
