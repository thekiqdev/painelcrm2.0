/**
 * Modelos de mensagem operacional para contratos (Etapas 5–6).
 * Composição centralizada; sem motor de envio — copiar/colar ou WhatsApp manual.
 */

const MAX_FIELD = 4000;

/** Remove control chars e limita tamanho (evita mensagens quebradas por dados estranhos). */
export function sanitizePlainText(s: string, max = MAX_FIELD): string {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
}

export function displayOrFallback(value: string | null | undefined, fallback: string): string {
  const t = sanitizePlainText(String(value ?? ""), 500);
  return t.length > 0 ? t : fallback;
}

export interface ContractMessagingContext {
  /** Origem do painel, ex.: https://app.exemplo.com */
  origin: string;
  organizationName: string;
  clientName: string | null;
  contractTitle: string;
  contractNumber: string;
  contractStatusLabel: string;
  signerName: string;
  signerEmail: string;
  /** URL completa do convite de assinatura, se disponível */
  signatureLink?: string;
  /** URL completa do link de visualização, se disponível */
  viewLink?: string;
}

/** Monta o contexto a partir de partes já conhecidas pelo painel (único ponto de composição). */
export function buildContractMessagingContext(parts: {
  origin: string;
  organizationName: string;
  clientName: string | null;
  contractTitle: string;
  contractNumber: string;
  contractStatusLabel: string;
  signerName: string;
  signerEmail: string;
  signatureLink?: string;
  viewLink?: string;
}): ContractMessagingContext {
  return {
    origin: sanitizePlainText(parts.origin, 500) || "",
    organizationName: displayOrFallback(parts.organizationName, "Organização"),
    clientName: parts.clientName ? displayOrFallback(parts.clientName, "") : null,
    contractTitle: displayOrFallback(parts.contractTitle, "Contrato"),
    contractNumber: displayOrFallback(parts.contractNumber, "—"),
    contractStatusLabel: displayOrFallback(parts.contractStatusLabel, "—"),
    signerName: displayOrFallback(parts.signerName, "Signatário"),
    signerEmail: displayOrFallback(parts.signerEmail, ""),
    signatureLink: parts.signatureLink ? sanitizePlainText(parts.signatureLink, 2000) : undefined,
    viewLink: parts.viewLink ? sanitizePlainText(parts.viewLink, 2000) : undefined,
  };
}

function nl(parts: string[]): string {
  return parts.filter(Boolean).join("\n");
}

/** Primeiro convite: explique e envie o link de assinatura. */
export function buildInviteMessage(ctx: ContractMessagingContext): string {
  const c = ctx;
  return nl([
    `Olá, ${c.signerName},`,
    "",
    `Referente ao contrato «${c.contractTitle}» (nº ${c.contractNumber}) — ${c.organizationName}.`,
    c.clientName ? `Cliente / parte: ${c.clientName}.` : null,
    "",
    "Por favor aceda ao link seguro abaixo para ler e assinar eletronicamente o documento:",
    c.signatureLink || "[obtenha o link com «Gerar e copiar» na aba Assinaturas]",
    "",
    "Este link é pessoal e não deve ser partilhado.",
    "",
    `Estado no sistema: ${c.contractStatusLabel}`,
  ]);
}

/** Lembrete: reutiliza o mesmo convite ativo — o link não muda até regenerar ou revogar. */
export function buildReminderMessage(ctx: ContractMessagingContext): string {
  const c = ctx;
  return nl([
    `Olá, ${c.signerName},`,
    "",
    `Lembramos que o contrato «${c.contractTitle}» (nº ${c.contractNumber}) aguarda a sua assinatura.`,
    "",
    "Pode concluir pelo mesmo link de convite (válido enquanto o convite estiver ativo):",
    c.signatureLink || "[copie o link com «Copiar link» se já tiver sido gerado nesta sessão]",
    "",
    `Estado: ${c.contractStatusLabel}`,
  ]);
}

/** Quando todas as assinaturas foram concluídas (contrato ativo). */
export function buildCompletionMessage(ctx: ContractMessagingContext): string {
  const c = ctx;
  return nl([
    `Olá, ${c.signerName},`,
    "",
    `O contrato «${c.contractTitle}» (nº ${c.contractNumber}) regista agora todas as assinaturas necessárias.`,
    "",
    `Organização: ${c.organizationName}.`,
    c.clientName ? `Cliente / parte: ${c.clientName}.` : null,
    "",
    "Pode solicitar ao responsável uma cópia em PDF ou consultar os detalhes no PainelCRM.",
    "",
    `Estado: ${c.contractStatusLabel}`,
  ]);
}

/** Link apenas de leitura (Etapa 3) — não substitui assinatura. */
export function buildViewOnlyMessage(ctx: ContractMessagingContext): string {
  const c = ctx;
  return nl([
    `Olá, ${c.signerName},`,
    "",
    `Segue o link para visualizar (somente leitura) o contrato «${c.contractTitle}» (nº ${c.contractNumber}).`,
    "Este link não permite assinar; para assinar é necessário o convite de assinatura específico.",
    "",
    c.viewLink || "[gere o link de visualização no menu Ações do contrato]",
    "",
    `Estado: ${c.contractStatusLabel}`,
  ]);
}
