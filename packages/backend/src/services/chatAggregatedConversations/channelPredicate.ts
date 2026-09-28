import type { AggregatedConversationsRequest, ChatListProvider } from './types.js';

/**
 * F4.1 — escopo de canal da API agregada.
 *
 * Produção atual: somente UazAPI. WhatsApp Oficial entra em sprint futura.
 * `includeWhatsAppOfficial` é legado (significava "segunda request só oficial" no merge
 * client-side) — **não** influencia o SQL agregado.
 */
export type AggregatedChannelFilter = 'uazapi' | 'whatsapp_official';

export type ResolvedAggregatedChannelScope = {
  provider: ChatListProvider;
  filter: AggregatedChannelFilter;
};

/** Resolve filtro efetivo ignorando includeWhatsAppOfficial (deprecated no agregado). */
export function resolveAggregatedChannelScope(
  request: AggregatedConversationsRequest,
): ResolvedAggregatedChannelScope {
  if (request.channelOrigin === 'official') {
    return { provider: 'whatsapp_official', filter: 'whatsapp_official' };
  }

  // F4.1: channelOrigin 'all' | 'uazapi' | ausente → UazAPI (paridade com loop legado por instância).
  return { provider: 'uazapi', filter: 'uazapi' };
}

/**
 * Predicado SQL de canal para inbox agregada.
 * Substitui a combinação conflituosa includeWhatsAppOfficial + instanceIds.
 */
export function appendAggregatedChannelPredicateSql(
  sql: string,
  params: unknown[],
  request: AggregatedConversationsRequest,
): string {
  const { filter } = resolveAggregatedChannelScope(request);

  if (filter === 'uazapi') {
    if (request.instanceIds.length === 0) {
      sql += ` AND c.instance_id IS NOT NULL AND c.whatsapp_official_account_id IS NULL`;
      return sql;
    }
    params.push(request.instanceIds);
    sql += ` AND c.instance_id = ANY($${params.length}::uuid[])`;
    sql += ` AND c.whatsapp_official_account_id IS NULL`;
    return sql;
  }

  // whatsapp_official — preparado para sprint futura; hoje retorna só contas Meta.
  sql += ` AND c.whatsapp_official_account_id IS NOT NULL`;
  return sql;
}
