import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as wa from '../controllers/superadminWhatsappOfficialController.js';

const router = Router();

const writeLimit = rateLimit({
  windowMs: 60_000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

router.get('/account', wa.getWhatsappOfficialAccount);
router.put('/account', writeLimit, wa.putWhatsappOfficialAccount);
router.post('/validate', writeLimit, wa.postWhatsappOfficialValidate);
router.post('/templates/sync', writeLimit, wa.postWhatsappOfficialTemplatesSync);
router.post('/templates', writeLimit, wa.postWhatsappOfficialTemplatesCreate);
router.get('/templates', wa.getWhatsappOfficialTemplates);
router.get('/campaigns', wa.getWhatsappOfficialCampaigns);
router.post('/campaigns', writeLimit, wa.postWhatsappOfficialCampaign);
router.post('/campaigns/test-send', writeLimit, wa.postWhatsappOfficialCampaignTestSend);
router.post('/campaigns/preview-audience', writeLimit, wa.postWhatsappOfficialCampaignPreviewAudience);
router.post('/campaigns/import-csv', writeLimit, wa.postWhatsappOfficialCampaignImportCsv);
router.get('/campaigns/:id/export', wa.getWhatsappOfficialCampaignExport);
router.get('/campaigns/:id', wa.getWhatsappOfficialCampaignById);
router.post('/campaigns/:id/start', writeLimit, wa.postWhatsappOfficialCampaignStart);
router.post('/campaigns/:id/pause', writeLimit, wa.postWhatsappOfficialCampaignPause);
router.post('/campaigns/:id/resume', writeLimit, wa.postWhatsappOfficialCampaignResume);
router.post('/campaigns/:id/cancel', writeLimit, wa.postWhatsappOfficialCampaignCancel);
router.post('/campaigns/:id/retry-failed', writeLimit, wa.postWhatsappOfficialCampaignRetryFailed);
router.post('/campaigns/:id/dispatch', writeLimit, wa.postWhatsappOfficialCampaignDispatch);
router.get('/conversations', wa.getWhatsappOfficialConversations);
router.post('/messages/text', writeLimit, wa.postWhatsappOfficialSendText);

export default router;
