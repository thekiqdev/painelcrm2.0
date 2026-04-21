/**
 * Persiste o token público da proposta de forma cifrada para o CRM recuperar a URL em GET,
 * sem armazenar o token em claro no banco.
 * Reutiliza PROPOSAL_WEBHOOK_SECRET_KEY (mesmo que webhooks — chave já exigida em muitos ambientes).
 */
import { pool } from '../utils/db.js';
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  isWebhookSecretEncryptionConfigured,
} from './proposalWebhookSecretCrypto.js';

export async function saveProposalPublicLinkCiphertext(proposalId: string, rawToken: string): Promise<void> {
  if (!isWebhookSecretEncryptionConfigured()) {
    console.warn(
      '[proposals] PROPOSAL_WEBHOOK_SECRET_KEY ausente ou curta: token do link público não foi persistido para GET. Configure a chave para habilitar Abrir/Copiar no detalhe sem depender só da resposta do POST.'
    );
    return;
  }
  const ct = encryptWebhookSecret(rawToken);
  await pool.query(`UPDATE proposals SET public_link_token_ciphertext = $1 WHERE id = $2`, [ct, proposalId]);
}

export function decryptProposalPublicLinkToken(ciphertext: string | null | undefined): string | null {
  if (!ciphertext?.trim() || !isWebhookSecretEncryptionConfigured()) return null;
  try {
    return decryptWebhookSecret(ciphertext);
  } catch {
    return null;
  }
}

export async function clearProposalPublicLinkCiphertext(proposalId: string): Promise<void> {
  await pool.query(`UPDATE proposals SET public_link_token_ciphertext = NULL WHERE id = $1`, [proposalId]);
}

export function proposalPublicLinkPathFromRawToken(rawToken: string): string {
  return `/proposal-view/${encodeURIComponent(rawToken)}`;
}
