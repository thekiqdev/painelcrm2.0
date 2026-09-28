/**
 * Adaptador Cloud API (Meta) para o chat multi-provider.
 * Delega para os serviços existentes — ponto único para evoluir send/media/webhook sem acoplar à UazAPI.
 */
import { sendTextMessage as graphOfficialSendText, graphFetch } from '../whatsappOfficial/whatsappOfficialClient.js';
import { getAccountCredentials } from '../whatsappOfficial/whatsappOfficialConfigService.js';
import {
  verifyWebhookSignature,
  processWhatsappOfficialWebhookPayload,
} from '../whatsappOfficial/whatsappOfficialWebhookService.js';
import { matchWebhookVerifyToken } from '../whatsappOfficial/whatsappOfficialConfigService.js';

export const MetaOfficialChatProviderAdapter = {
  sendTextMessage: graphOfficialSendText,
  graphFetch,
  getAccountCredentials,
  verifyWebhookSignature,
  processWhatsappOfficialWebhookPayload,
  matchWebhookVerifyToken,
};
