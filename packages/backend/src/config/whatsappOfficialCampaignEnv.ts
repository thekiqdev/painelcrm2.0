/**
 * Worker de campanhas WhatsApp Oficial (Super Admin).
 */
export function isWhatsappOfficialCampaignWorkerEnabled(): boolean {
  return (process.env.WHATSAPP_OFFICIAL_CAMPAIGN_WORKER_ENABLED || 'false').toLowerCase() === 'true';
}

export function getWhatsappOfficialCampaignBatchSize(): number {
  const n = parseInt(process.env.WHATSAPP_OFFICIAL_CAMPAIGN_BATCH_SIZE || '20', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20;
}

export function getWhatsappOfficialCampaignSendIntervalMs(): number {
  const n = parseInt(process.env.WHATSAPP_OFFICIAL_CAMPAIGN_SEND_INTERVAL_MS || '1000', 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 60_000) : 1000;
}

export function getWhatsappOfficialCampaignMaxAttempts(): number {
  const n = parseInt(process.env.WHATSAPP_OFFICIAL_CAMPAIGN_MAX_ATTEMPTS || '3', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 3;
}

/** Janela deslizante aproximada: máximo de envios por minuto por processo worker. */
export function getWhatsappOfficialCampaignMaxPerMinute(): number {
  const n = parseInt(process.env.WHATSAPP_OFFICIAL_CAMPAIGN_MAX_PER_MINUTE || '60', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 300) : 60;
}

export function getWhatsappOfficialCampaignWorkerPollMs(): number {
  const n = parseInt(process.env.WHATSAPP_OFFICIAL_CAMPAIGN_WORKER_POLL_MS || '5000', 10);
  return Number.isFinite(n) && n >= 1000 ? Math.min(n, 120_000) : 5000;
}
