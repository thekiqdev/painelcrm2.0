export type AdminScriptKey =
  | 'media.diagnose_system'
  | 'media.test_storage_roundtrip'
  | 'media.diagnose_conversation_avatar'
  | 'media.audit_urls'
  | 'media.strip_localhost_internal_urls'
  | 'media.audit_whatsapp_cdn_avatars'
  | 'media.reprocess_avatar_cache'
  | 'campaigns.recalculate_counters'
  | 'uazapi.review_webhooks';

export type AdminScriptRisk = 'low' | 'medium' | 'high';

export type AdminScriptCategory = 'diagnostic' | 'audit' | 'repair' | 'reprocess';

export type AdminScriptCatalogEntry = {
  key: AdminScriptKey;
  name: string;
  description: string;
  risk: AdminScriptRisk;
  category: AdminScriptCategory;
  /** Se false, preview/execute devolvem 501 até implementação */
  implemented: boolean;
  /** Scripts só leitura: execute não aplicável */
  auditOnly?: boolean;
};

export const ADMIN_SCRIPTS_CATALOG: AdminScriptCatalogEntry[] = [
  {
    key: 'media.diagnose_system',
    name: 'Diagnosticar mídia do sistema',
    description:
      'Ambiente (sem segredos), pasta MEDIA_STORAGE_ROOT, leitura/escrita, espaço em disco, rota esperada /api/media/v1/raw. Apenas preview.',
    risk: 'low',
    category: 'diagnostic',
    implemented: true,
    auditOnly: true,
  },
  {
    key: 'media.test_storage_roundtrip',
    name: 'Testar escrita/leitura de mídia',
    description:
      'Grava PNG mínimo via MediaService, indexa media_assets, valida ficheiro no disco, GET HTTP interno e remove o ficheiro de teste.',
    risk: 'medium',
    category: 'diagnostic',
    implemented: true,
  },
  {
    key: 'media.diagnose_conversation_avatar',
    name: 'Diagnosticar avatar de conversa',
    description:
      'Mostra URLs de avatar na conversa, classifica origem (mídia assinada, catálogo, CDN, proxy) e valida assinatura/ficheiro quando aplicável. Requer conversationId.',
    risk: 'low',
    category: 'diagnostic',
    implemented: true,
  },
  {
    key: 'media.audit_urls',
    name: 'Auditar URLs de mídia',
    description:
      'Contagens e amostras de localhost, CDN WhatsApp em campos finais e avatar-proxy persistido (somente leitura).',
    risk: 'low',
    category: 'audit',
    implemented: true,
    auditOnly: true,
  },
  {
    key: 'media.strip_localhost_internal_urls',
    name: 'Corrigir URLs localhost de mídia',
    description:
      'Normaliza URLs absolutas de dev (localhost:3001/3002) para path relativo em campos de catálogo interno.',
    risk: 'medium',
    category: 'repair',
    implemented: true,
  },
  {
    key: 'media.audit_whatsapp_cdn_avatars',
    name: 'Auditar avatares WhatsApp (CDN)',
    description:
      'Inventário de registos com URL efémera da CDN nos campos de avatar (planeado).',
    risk: 'low',
    category: 'audit',
    implemented: false,
    auditOnly: true,
  },
  {
    key: 'media.reprocess_avatar_cache',
    name: 'Reprocessar cache de avatares WhatsApp',
    description:
      'Baixa avatares ainda apontando para CDN temporária do WhatsApp e salva em mídia interna assinada.',
    risk: 'medium',
    category: 'reprocess',
    implemented: true,
  },
  {
    key: 'campaigns.recalculate_counters',
    name: 'Recalcular contadores de campanha',
    description:
      'Sincroniza métricas agregadas de campanhas WhatsApp oficial (planeado).',
    risk: 'medium',
    category: 'reprocess',
    implemented: false,
  },
  {
    key: 'uazapi.review_webhooks',
    name: 'Revisar webhooks UazAPI',
    description:
      'Audita webhook_secret/webhook_url por instância, sugere ação e marca pendências de reconfiguração (sem chamar UazAPI).',
    risk: 'medium',
    category: 'repair',
    implemented: true,
  },
];

export function getCatalogEntry(key: string): AdminScriptCatalogEntry | undefined {
  return ADMIN_SCRIPTS_CATALOG.find((e) => e.key === key);
}
