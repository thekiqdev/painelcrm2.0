import type { DealCardBadges } from "./AnimatedDealCard";

/** Coluna do card no Kanban (0–3) ou null só na fase inicial */
export function getCardColumn(phase: number): number | null {
  if (phase === 0) return null;
  if (phase === 1) return 1;
  if (phase === 2 || phase === 3) return 2;
  return 3;
}

export function getGlowColumn(phase: number): number | null {
  return phase === 1 ? 1 : null;
}

export function getDealBadges(phase: number): DealCardBadges {
  return {
    whatsapp: phase >= 1,
    automacao: phase >= 2,
    proposta: phase >= 2,
    fatura: phase >= 3,
  };
}

export const HERO_MOCKUP_CAPTIONS = [
  "Nova mensagem recebida",
  "Conversa adicionada ao funil",
  "Proposta criada automaticamente",
  "Fatura criada — R$ 497,00",
  "Cliente aceitou a proposta",
  "Venda concluída automaticamente",
] as const;
