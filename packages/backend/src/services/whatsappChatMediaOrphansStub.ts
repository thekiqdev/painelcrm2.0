/**
 * STUB — Limpeza futura de ficheiros de mídia do chat (áudio/imagem/PDF em JSON em `chat_messages.media`
 * ou paths em catalog-media). Hoje o CASCADE apaga linhas; ficheiros em disco podem ficar órfãos.
 *
 * TODO seguro (quando existir mapa estável message_id → path físico):
 * - Listar candidatos por tenant_id + instance_id via JOIN chat_conversations.
 * - Apagar apenas sob raiz conhecida (ex.: uploads/catalog-media/tenants/{tenant}/...).
 * - Nunca apagar paths partilhados entre tenants.
 *
 * Não invocar automaticamente até auditoria de storage em produção.
 */
export type ChatMediaOrphanAuditStub = {
  note: string;
};

export function describeChatMediaOrphanRisk(): ChatMediaOrphanAuditStub {
  return {
    note:
      'Mídia WhatsApp costuma vir como URL remota (pps.whatsapp.net) ou payload em chat_messages.media JSON; ' +
      'cache local usa catalog-media/media_assets com FK indirecta. CASCADE remove linhas; órfãos em disco são edge case.',
  };
}
