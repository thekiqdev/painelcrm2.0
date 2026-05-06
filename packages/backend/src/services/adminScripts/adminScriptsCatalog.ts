export type AdminScriptKey =
  | 'media.audit_urls'
  | 'media.strip_localhost_internal_urls'
  | 'media.audit_whatsapp_cdn_avatars'
  | 'media.reprocess_avatar_cache'
  | 'campaigns.recalculate_counters'
  | 'uazapi.review_webhooks';

export type AdminScriptRisk = 'low' | 'medium' | 'high';

export type AdminScriptCategory = 'audit' | 'repair' | 'reprocess';

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
