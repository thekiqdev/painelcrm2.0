import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import authRoutes from './routes/authRoutes.js';
import productsRoutes from './routes/productsRoutes.js';
import storeProfileRoutes from './routes/storeProfileRoutes.js';
import catalogMediaRoutes from './routes/catalogMediaRoutes.js';
import clientsRoutes from './routes/clientsRoutes.js';
import clientGroupsRoutes from './routes/clientGroupsRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import registrationStepsRoutes from './routes/registrationStepsRoutes.js';
import leadsRoutes from './routes/leadsRoutes.js';
import leadStatusesRoutes from './routes/leadStatusesRoutes.js';
import leadTasksRoutes from './routes/leadTasksRoutes.js';
import funnelsRoutes from './routes/funnelsRoutes.js';
import funnelStagesRoutes from './routes/funnelStagesRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import ordersRoutes from './routes/ordersRoutes.js';
import ticketsRoutes from './routes/ticketsRoutes.js';
import supportPortalRoutes from './routes/supportPortalRoutes.js';
import ticketCategoriesRoutes from './routes/ticketCategoriesRoutes.js';
import platformSupportRoutes from './routes/platformSupportRoutes.js';
import contractsRoutes from './routes/contractsRoutes.js';
import contractTemplatesRoutes from './routes/contractTemplatesRoutes.js';
import proposalTemplatesRoutes from './routes/proposalTemplatesRoutes.js';
import projectTemplatesRoutes from './routes/projectTemplatesRoutes.js';
import projectsRoutes from './routes/projectsRoutes.js';
import projectListsRoutes from './routes/projectListsRoutes.js';
import projectAreasRoutes from './routes/projectAreasRoutes.js';
import projectVersionsRoutes from './routes/projectVersionsRoutes.js';
import projectTasksRoutes from './routes/projectTasksRoutes.js';
import teamsRoutes from './routes/teamsRoutes.js';
import userProfilesRoutes from './routes/userProfilesRoutes.js';
import profileMembersRoutes from './routes/profileMembersRoutes.js';
import userPermissionsRoutes from './routes/userPermissionsRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import tasksRoutes from './routes/tasksRoutes.js';
import invoicesRoutes from './routes/invoicesRoutes.js';
import expensesRoutes from './routes/expensesRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import financialRoutes from './routes/financialRoutes.js';
import proposalsRoutes from './routes/proposalsRoutes.js';
import membersRoutes from './routes/membersRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import chatKanbanRoutes from './routes/chatKanbanRoutes.js';
import superadminOpsKanbanRoutes from './routes/superadminOpsKanbanRoutes.js';
import kanbanAttachRoutes from './routes/kanbanAttachRoutes.js';
import uazapiWebhookRoutes from './routes/uazapiWebhookRoutes.js';
import asaasWebhookRoutes from './routes/asaasWebhookRoutes.js';
import chatbotFlowsWebhookRoutes from './routes/chatbotFlowsWebhookRoutes.js';
import chatbotFlowsListenWebhookRoutes from './routes/chatbotFlowsListenWebhookRoutes.js';
import chatbotFlowsSampleWebhookRoutes from './routes/chatbotFlowsSampleWebhookRoutes.js';
import notificationsRoutes from './routes/notificationsRoutes.js';
import notificationsEngineRoutes from './routes/notificationsEngineRoutes.js';
import messageTemplatesRoutes from './routes/messageTemplatesRoutes.js';
import tenantChatTemplatesRoutes from './routes/tenantChatTemplatesRoutes.js';
import whatsappTemplateCategoriesRoutes from './routes/whatsappTemplateCategoriesRoutes.js';
import whatsappMessageTemplatesRoutes from './routes/whatsappMessageTemplatesRoutes.js';
import messagesRoutes from './routes/messagesRoutes.js';
import superadminRoutes from './routes/superadminRoutes.js';
import plansRoutes from './routes/plansRoutes.js';
import * as plansController from './controllers/plansController.js';
import myTenantPlanRoutes from './routes/myTenantPlanRoutes.js';
import meProfileRoutes from './routes/meProfileRoutes.js';
import { authenticateToken, setCurrentTenant, setRequestDb } from './middleware/auth.js';
import announcementsUpdatesRoutes from './routes/announcementsUpdatesRoutes.js';
import googleCalendarIntegrationRoutes from './routes/googleCalendarIntegrationRoutes.js';
import googleDriveIntegrationRoutes from './routes/googleDriveIntegrationRoutes.js';
import asaasIntegrationRoutes from './routes/asaasIntegrationRoutes.js';
import mercadoPagoIntegrationRoutes from './routes/mercadoPagoIntegrationRoutes.js';
import * as mercadoPagoIntegrationController from './controllers/mercadoPagoIntegrationController.js';
import { mercadoPagoFeatureGuard } from './middleware/mercadoPagoFeatureGuard.js';
import appointmentsRoutes from './routes/appointmentsRoutes.js';
import chatbotFlowsRoutes from './routes/chatbotFlowsRoutes.js';
import { getCheckoutContext } from './controllers/checkoutContextController.js';
import planPurchaseRoutes from './routes/planPurchaseRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import billingPlatformRoutes from './billingPlatform/api/billingPlatformRoutes.js';
import customerInvoicesRoutes from './routes/customerInvoicesRoutes.js';
import crmSubscriptionsRoutes from './routes/crmSubscriptionsRoutes.js';
import adminSubscriptionsRoutes from './routes/adminSubscriptionsRoutes.js';
import customerChargesRoutes from './routes/customerChargesRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import acquisitionPublicRoutes from './routes/acquisitionPublicRoutes.js';
import platformPublicRoutes from './routes/platformPublicRoutes.js';
import mediaRoutes from './services/media/mediaRoutes.js';
import whatsappOfficialWebhookRoutes from './routes/whatsappOfficialWebhookRoutes.js';
import storeCheckoutRoutes from './routes/storeCheckoutRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import acquisitionOnboardingWizardRoutes from './routes/acquisitionOnboardingWizardRoutes.js';
import tenantsRoutes from './routes/tenantsRoutes.js';
import superadminCompanyUsersRoutes from './routes/superadminCompanyUsersRoutes.js';
import { pool } from './utils/db.js';
import { processProposalWebhookDeliveriesBatch } from './services/proposalWebhookDeliveryService.js';
import { processNotificationOutboundRetriesBatch } from './services/notificationsEngine/notificationOutboundRetryWorker.js';
import { processPlatformNotificationOutboundRetriesBatch } from './services/platformNotifications/platformNotificationOutboundRetryWorker.js';
import {
  getNotificationsEngineOutboundRetryPollMs,
  getNotificationsEngineInvoiceDigestPollMs,
  isNotificationsEngineInvoiceDigestEnabled,
} from './config/notificationsEngineEnv.js';
import { getPlatformNotificationsOutboundRetryPollMs } from './config/platformNotificationsEnv.js';
import { refreshPlatformNotificationsFlagsFromPool } from './services/platformNotifications/platformNotificationsRuntimeFlags.js';
import { runInvoiceDigestTickSafe } from './services/notificationsEngine/notificationInvoiceDigestWorker.js';
import { initializeWebSocket, attachRedisSocketAdapter } from './services/websocketService.js';
import { getCatalogMediaStorageRoot } from './services/catalogMediaUploadService.js';
import {
  getWhatsappTemplateMediaRoot,
  getWhatsappTemplateMediaRootCandidates,
  resolveExistingWhatsappTemplateMediaAbsolutePath,
} from './services/whatsappTemplateMediaStorageService.js';
import { syncOverdueBillingStatuses } from './services/billingOverdueStatusService.js';
import { notifyPlatformTrialsExpiringSoon } from './services/platformNotifications/platformTrialExpiringNotificationService.js';
import { runAppointmentRemindersOnce } from './services/appointmentReminderWorkerService.js';
import { runPendingConfirmationAutomationOnce } from './services/appointmentAutomationService.js';
import { logGoogleCalendarBootDiagnostics } from './config/googleCalendarEnv.js';
import { logGoogleDriveBootDiagnostics } from './config/googleDriveEnv.js';
import { getAllowedCorsOrigins } from './config/corsOrigins.js';
import { runWhatsappOfficialCampaignWorkerTick } from './services/whatsappOfficial/whatsappOfficialCampaignQueueService.js';
import {
  isWhatsappOfficialCampaignWorkerEnabled,
  getWhatsappOfficialCampaignWorkerPollMs,
} from './config/whatsappOfficialCampaignEnv.js';
import { refreshSystemFeatureFlagsFromPool } from './services/systemFeatureFlagsService.js';
import { refreshPlatformFeatureFlagRegistry } from './platform/featureFlagRegistry.js';
import partnerRoutes from './partner/partnerRoutes.js';
import superadminPartnerRoutes from './partner/superadminPartnerRoutes.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import {
  appLogger,
  isHttpAccessLogEnabled,
  refreshLogLevelFromEnv,
} from './observability/appLogger.js';
import {
  installPlatformObservability,
  installSocketObservability,
} from './observability/install.js';
import {
  isHttpSkipDenseWorkers,
  startDenseBackgroundWorkers,
} from './workers/denseWorkerBootstrap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: rootEnv });
dotenv.config();
logGoogleCalendarBootDiagnostics();
logGoogleDriveBootDiagnostics();

const app = express();
const httpServer = createServer(app);
const PORT = parseInt(process.env.API_PORT || '3001', 10);

/** Sem ETag em res.json: evita 304 após executar o handler completo (query à BD já correu). APIs JSON autenticadas não beneficiam. */
app.set('etag', false);

// Trust proxy - necessário quando atrás de Nginx/reverse proxy
// Usar configuração segura para não confiar em qualquer IP arbitrário
const trustProxySetting =
  process.env.TRUST_PROXY_SETTING || 'loopback, linklocal, uniquelocal';
app.set('trust proxy', trustProxySetting);

// Middleware — CORP cross-origin permite <img src> da API em outra porta/origem (dev e admin vs /media/catalog)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
// CORS - aceitar FRONTEND_URL(S) e hosts locais (dev); mesma lista em Socket.IO (corsOrigins.ts)
const corsOrigins = getAllowedCorsOrigins();

app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : true, // Se não houver URLs, aceitar todas (apenas para debug)
  credentials: true,
}));
/** Webhook Meta WhatsApp Cloud API — corpo bruto para assinatura X-Hub-Signature-256 (antes do JSON global). */
app.use('/api/webhooks/whatsapp-official', whatsappOfficialWebhookRoutes);
app.use('/webhooks/whatsapp-official', whatsappOfficialWebhookRoutes);
/** Alias canónico pedido para o painel Meta (mesmo router: verificação GET + POST com assinatura). */
app.use('/api/webhooks/meta/whatsapp', whatsappOfficialWebhookRoutes);
app.use('/webhooks/meta/whatsapp', whatsappOfficialWebhookRoutes);

/** Base64 de imagem no JSON de POST /api/chat/messages excede o padrão do body-parser (100kb). */
const jsonBodyLimit = process.env.API_JSON_BODY_LIMIT || '25mb';
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }));

/** P0 Sprint 1: correlation id + ALS (antes das rotas; não altera body/auth). */
app.use(correlationIdMiddleware);

/** Mídia do catálogo (upload local). Montar volume persistente em getCatalogMediaStorageRoot(). */
try {
  const catalogMediaDir = getCatalogMediaStorageRoot();
  if (!fs.existsSync(catalogMediaDir)) {
    fs.mkdirSync(catalogMediaDir, { recursive: true });
  }
  app.use(
    '/media/catalog',
    express.static(catalogMediaDir, {
      maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
      index: false,
      dotfiles: 'deny',
    })
  );
  app.use(
    '/api/catalog-media/public',
    express.static(catalogMediaDir, {
      maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
      index: false,
      dotfiles: 'deny',
    })
  );
} catch (e) {
  console.error('[catalog-media] Falha ao preparar diretório estático:', e);
}

/** Mídia de Templates WhatsApp (upload local). */
try {
  const waTplMediaDirs = Array.from(new Set([getWhatsappTemplateMediaRoot(), ...getWhatsappTemplateMediaRootCandidates()]));
  for (const waTplMediaDir of waTplMediaDirs) {
    if (!fs.existsSync(waTplMediaDir)) {
      fs.mkdirSync(waTplMediaDir, { recursive: true });
    }
    app.use(
      '/media/whatsapp-templates',
      express.static(waTplMediaDir, {
        maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
        index: false,
        dotfiles: 'deny',
      }),
    );
  }
} catch (e) {
  console.error('[whatsapp-template-media] Falha ao preparar diretório estático:', e);
}

app.get('/media/whatsapp-templates/*', (req, res) => {
  const wildcardParam = (req.params as Record<string, string | undefined>)['0'];
  const relativePath = String(wildcardParam || '').trim();
  const abs = resolveExistingWhatsappTemplateMediaAbsolutePath(relativePath);
  if (!abs) {
    res.status(404).type('text/plain').send('Arquivo não encontrado.');
    return;
  }

  const lower = abs.toLowerCase();
  if (lower.endsWith('.pdf')) {
    res.type('application/pdf');
  } else if (lower.endsWith('.png')) {
    res.type('image/png');
  } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    res.type('image/jpeg');
  } else if (lower.endsWith('.webp')) {
    res.type('image/webp');
  } else if (lower.endsWith('.gif')) {
    res.type('image/gif');
  }

  res.setHeader('Cache-Control', process.env.NODE_ENV === 'production' ? 'public, max-age=604800' : 'no-cache');
  res.sendFile(abs, (err: NodeJS.ErrnoException | undefined) => {
    if (err && !res.headersSent) {
      const statusCode = typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? (err as unknown as { statusCode: number }).statusCode
        : 500;
      res.status(statusCode).type('text/plain').send('Falha ao abrir arquivo.');
    }
  });
});

// Rate limiting mais generoso para endpoints de teste
const testLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 testes por minuto (suficiente para testes)
  message: 'Muitos testes enviados. Aguarde um momento antes de tentar novamente.',
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limite só para login/registro (anti brute-force). Resto da API não conta aqui.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '30', 10), // 30 tentativas de login/registro por 15 min por IP
  message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

// Rate limiting para APIs (geral) - alto para não bloquear uso normal (dashboard faz muitas req paralelas)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '2000', 10), // 2000 req/15min por IP (configurável)
  message: 'Muitas requisições. Aguarde um momento antes de tentar novamente.',
  skip: (req) => {
    if (process.env.NODE_ENV === 'development') return true;
    const p = req.path || req.originalUrl || '';
    // Não contar rotas de auth no limite geral (têm seu próprio authLimiter)
    return (
      p.startsWith('/api/auth/') ||
      p.startsWith('auth/') ||
      p.startsWith('/api/store-checkout') ||
      p.includes('/public/catalog-media/raw') ||
      p.includes('/catalog-media/public/') ||
      p.includes('/test') ||
      p.startsWith('/webhooks/') ||
      p.startsWith('webhooks/')
    );
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting mais generoso para webhooks (podem receber muitos eventos)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // limit each IP to 200 requests per minute (webhooks podem ser frequentes)
  message: 'Too many webhook requests, please try again later.',
});

// Aplicar rate limiting - IMPORTANTE: ordem importa!
// 1. Webhooks primeiro (mais específico)
app.use('/webhooks/', webhookLimiter);
// 2. Limite anti brute-force só em login/registro
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PASSWORD_RESET_MAX || '20', 10),
  message: { ok: false, error: 'Muitas tentativas de recuperação de senha. Aguarde e tente novamente.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});
app.use('/api/auth/password-reset', passwordResetLimiter);
// 3. Testes (específico)
app.use('/api/message-templates/:id/test', testLimiter);
// Checkout público da loja (MVP 1 item): limite dedicado, não contar no limiter geral
const storeCheckoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_STORE_CHECKOUT_MAX || '40', 10),
  message: { ok: false, error: 'Muitas tentativas de checkout. Aguarde e tente novamente.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});
app.use('/api/store-checkout', storeCheckoutLimiter);
// 4. API geral por último (mais genérico)
app.use('/api/', limiter);

// Health check - endpoint simples e rápido
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Root endpoint para verificar se o servidor está rodando
app.get('/', (req, res) => {
  res.json({ 
    message: 'PainelCRM API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Access log /api — opt-in LOG_HTTP=1 (MB-014)
app.use('/api', (req, res, next) => {
  if (isHttpAccessLogEnabled()) {
    appLogger.debug('http', `${req.method} ${req.originalUrl || req.url}`);
  }
  next();
});

// MB-024 — observabilidade de plataforma (opt-in OBS_METRICS=1)
installPlatformObservability(app);

// Routes - IMPORTANTE: Rotas específicas devem vir ANTES do rate limiter geral
// Mas como o rate limiter já foi aplicado acima, vamos garantir que testes tenham tratamento especial
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/public/acquisition', acquisitionPublicRoutes);
app.use('/api/public/platform', platformPublicRoutes);
app.use('/api/store-checkout', storeCheckoutRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/store-profile', storeProfileRoutes);
app.use('/api/catalog-media', catalogMediaRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/client-groups', clientGroupsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/registration-steps', registrationStepsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/lead-statuses', leadStatusesRoutes);
app.use('/api/lead-tasks', leadTasksRoutes);
app.use('/api/funnels', funnelsRoutes);
app.use('/api/funnels', funnelStagesRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/support-portal', supportPortalRoutes);
app.use('/api/ticket-categories', ticketCategoriesRoutes);
app.use('/api/platform-support', platformSupportRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/contract-templates', contractTemplatesRoutes);
app.use('/api/project-templates', projectTemplatesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/projects', projectListsRoutes);
app.use('/api/projects', projectAreasRoutes);
app.use('/api/projects', projectVersionsRoutes);
app.use('/api/projects', projectTasksRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/user-profiles', userProfilesRoutes);
app.use('/api/user-profiles', profileMembersRoutes);
app.use('/api/user-profiles', userPermissionsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/proposal-templates', proposalTemplatesRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chat/kanban', chatKanbanRoutes);
app.use('/api/kanban', kanbanAttachRoutes);
app.use('/api/superadmin/ops/kanban', superadminOpsKanbanRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/notifications-engine', notificationsEngineRoutes);
app.use('/api/message-templates', messageTemplatesRoutes);
app.use('/api/tenant-chat-templates', tenantChatTemplatesRoutes);
app.use('/api/whatsapp-template-categories', whatsappTemplateCategoriesRoutes);
app.use('/api/whatsapp-message-templates', whatsappMessageTemplatesRoutes);
app.use('/api/messages', messagesRoutes);
app.get('/api/plans', plansController.listPublicPlans);
app.use('/api/plan-purchase', planPurchaseRoutes);
app.use('/api/billing', billingRoutes);
app.use(
  '/api/billing-platform',
  authenticateToken,
  setCurrentTenant,
  setRequestDb,
  billingPlatformRoutes
);
app.use('/api/customer-invoices', customerInvoicesRoutes);
app.use('/api/crm-subscriptions', crmSubscriptionsRoutes);
app.use('/api/admin/subscriptions', adminSubscriptionsRoutes);
app.use('/api/customer-charges', customerChargesRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/onboarding/wizard', acquisitionOnboardingWizardRoutes);
app.get(
  '/api/me/tenant/checkout-context',
  authenticateToken,
  setCurrentTenant,
  setRequestDb,
  getCheckoutContext
);
app.use('/api/me/tenant', myTenantPlanRoutes);
/** Perfil pessoal / negócio: GET|PUT /api/me/profile, avatar, senha por WhatsApp, business-profile */
app.use('/api/me', meProfileRoutes);
app.use('/api/integrations/google', googleCalendarIntegrationRoutes);
app.use('/api/integrations/google-drive', googleDriveIntegrationRoutes);
app.use('/api/integrations/asaas', asaasIntegrationRoutes);
app.get('/api/integrations/mercado-pago/callback', mercadoPagoIntegrationController.getMercadoPagoOAuthCallback);
/** Alias legado (notification_url antiga); mesmo handler que POST /api/integrations/mercado-pago/webhook */
app.post('/api/webhooks/mercado-pago', mercadoPagoFeatureGuard, mercadoPagoIntegrationController.postMercadoPagoWebhook);
app.use('/api/integrations/mercado-pago', mercadoPagoIntegrationRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/chatbot-flows', chatbotFlowsRoutes);
app.use('/api/announcements', authenticateToken, setCurrentTenant, announcementsUpdatesRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/superadmin/plans', plansRoutes);
app.use('/api/superadmin/tenants', tenantsRoutes);
app.use('/api/superadmin/partners', superadminPartnerRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/superadmin/companies', superadminCompanyUsersRoutes);
// Alias de compatibilidade: alguns provedores foram configurados com /api/webhooks/...
app.use('/api/webhooks/uazapi', uazapiWebhookRoutes);
app.use('/api/webhooks/asaas', asaasWebhookRoutes);
app.use('/webhooks/uazapi', uazapiWebhookRoutes);
app.use('/webhooks/asaas', asaasWebhookRoutes);
app.use('/webhooks/chatbot-flows', chatbotFlowsWebhookRoutes);
app.use('/api/webhooks/chatbot-flows', chatbotFlowsWebhookRoutes);
app.use('/webhooks/chatbot-flows-listen', chatbotFlowsListenWebhookRoutes);
app.use('/api/webhooks/chatbot-flows-listen', chatbotFlowsListenWebhookRoutes);
app.use('/webhooks/chatbot-flows-sample', chatbotFlowsSampleWebhookRoutes);
app.use('/api/webhooks/chatbot-flows-sample', chatbotFlowsSampleWebhookRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Inicializar WebSocket
const io = initializeWebSocket(httpServer);
installSocketObservability(io);

// Encerramento graceful: libera a porta antes de sair (nodemon envia SIGTERM e aguarda --delay 2)
function shutdown(signal: string) {
  console.log(`\n[${signal}] Encerrando servidor...`);
  if (typeof (httpServer as any).closeIdleConnections === 'function') {
    (httpServer as any).closeIdleConnections();
  }
  httpServer.close(() => {
    console.log('Porta liberada. Até logo.');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server após DB + flags + cifra WhatsApp oficial
void (async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL database');
    console.log(
      '[boot] Runtime target:',
      JSON.stringify({
        API_PORT: PORT,
        POSTGRES_HOST: process.env.POSTGRES_HOST || 'localhost',
        POSTGRES_PORT: process.env.POSTGRES_PORT || '5432',
        POSTGRES_DB: process.env.POSTGRES_DB || 'painelcrm',
        NODE_ENV: process.env.NODE_ENV || 'development',
      }),
    );
    const { ensureWhatsappOfficialEncryptionMaterial } = await import(
      './services/whatsappOfficial/whatsappOfficialEncryptionBootstrap.js'
    );
    await ensureWhatsappOfficialEncryptionMaterial(pool);
    const { ensureSmtpEncryptionMaterial } = await import('./services/smtpEncryptionBootstrap.js');
    await ensureSmtpEncryptionMaterial(pool);
    await refreshSystemFeatureFlagsFromPool(pool);
    await refreshPlatformFeatureFlagRegistry();
    console.log('[boot] Flags globais (system_feature_flags + platform_feature_flags P0) e cifra carregadas.');

    const { ensureSubscriptionsWeeklyBillingInterval } = await import(
      './startup/ensureSubscriptionsWeeklyBillingInterval.js'
    );
    await ensureSubscriptionsWeeklyBillingInterval(pool);

    const { runMigrationGuard } = await import('./startup/migrationGuard.js');
    await runMigrationGuard(pool);

    // MB-026 — Redis Socket.IO adapter (opt-in; fallback memory se Redis indisponível)
    const redisAttach = await attachRedisSocketAdapter(io);
    appLogger.boot('redis-adapter', 'attach result', redisAttach);
  } catch (err) {
    console.error('❌ Falha no arranque (PostgreSQL / flags / cifra / migration guard):', err);
    process.exit(1);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
  refreshLogLevelFromEnv();
  appLogger.boot('http', `Server running on port ${PORT}`, {
    env: process.env.NODE_ENV || 'development',
    listen: `0.0.0.0:${PORT}`,
    websocket: true,
  });

  setInterval(() => {
    void refreshSystemFeatureFlagsFromPool(pool).catch(() => undefined);
    void refreshPlatformFeatureFlagRegistry().catch(() => undefined);
  }, 120_000);

  if (isHttpSkipDenseWorkers()) {
    appLogger.boot('http', 'dense workers skipped (HTTP_SKIP_DENSE_WORKERS=1) — run npm run workers:dense');
  } else {
    startDenseBackgroundWorkers(pool);
  }

  const proposalWhPollMs = Math.max(20_000, parseInt(process.env.PROPOSAL_WEBHOOK_POLL_MS || '60000', 10));
  setInterval(() => {
    void processProposalWebhookDeliveriesBatch(20).catch((err) =>
      appLogger.error('proposalWebhookDelivery', 'batch error', { err: String(err) }),
    );
  }, proposalWhPollMs);

  void refreshPlatformNotificationsFlagsFromPool(pool).catch((err) =>
    appLogger.error('platform-notifications', 'refresh flags on startup', { err: String(err) }),
  );

  const neRetryPollMs = getNotificationsEngineOutboundRetryPollMs();
  setInterval(() => {
    void processNotificationOutboundRetriesBatch(25).catch((err) =>
      appLogger.error('notifications-engine/retry', 'batch error', { err: String(err) }),
    );
  }, neRetryPollMs);

  const pnRetryPollMs = getPlatformNotificationsOutboundRetryPollMs();
  setInterval(() => {
    void processPlatformNotificationOutboundRetriesBatch(25).catch((err) =>
      appLogger.error('platform-notifications/retry', 'batch error', { err: String(err) }),
    );
  }, pnRetryPollMs);

  if (isNotificationsEngineInvoiceDigestEnabled()) {
    const digestMs = getNotificationsEngineInvoiceDigestPollMs();
    setInterval(() => {
      void runInvoiceDigestTickSafe();
    }, digestMs);
  }

  const overdueSyncPollMs = Math.max(
    60_000,
    parseInt(process.env.BILLING_OVERDUE_SYNC_POLL_MS || '300000', 10)
  );
  setInterval(() => {
    void syncOverdueBillingStatuses()
      .then((result) => {
        const total = result.customer_invoices_updated + result.tenant_billing_updated;
        if (total > 0) {
          appLogger.info('billing-overdue-sync', 'updated', {
            total,
            customer_invoices: result.customer_invoices_updated,
            tenant_billing: result.tenant_billing_updated,
          });
        }
      })
      .catch((err) => appLogger.error('billing-overdue-sync', 'batch error', { err: String(err) }));
  }, overdueSyncPollMs);

  const trialExpiringPollMs = Math.max(
    60_000,
    parseInt(process.env.PLATFORM_TRIAL_EXPIRING_NOTIFICATION_POLL_MS || '21600000', 10),
  );
  setInterval(() => {
    void notifyPlatformTrialsExpiringSoon()
      .then((result) => {
        if (result.notified > 0) {
          appLogger.info('platform-trial-expiring', 'notified', { notified: result.notified });
        }
      })
      .catch((err) => appLogger.error('platform-trial-expiring', 'tick error', { err: String(err) }));
  }, trialExpiringPollMs);

  const agendaReminderMs = Math.max(60_000, parseInt(process.env.AGENDA_REMINDER_POLL_MS || '60000', 10));
  setInterval(() => {
    void runAppointmentRemindersOnce().catch((err) =>
      appLogger.error('agenda-reminder', 'tick error', { err: String(err) }),
    );
  }, agendaReminderMs);

  const agendaAutomationMs = Math.max(
    60_000,
    parseInt(process.env.AGENDA_AUTOMATION_POLL_MS || '300000', 10),
  );
  setInterval(() => {
    void runPendingConfirmationAutomationOnce().catch((err) =>
      appLogger.error('agenda-automation', 'tick error', { err: String(err) }),
    );
  }, agendaAutomationMs);

  if (isWhatsappOfficialCampaignWorkerEnabled()) {
    const waCampPoll = getWhatsappOfficialCampaignWorkerPollMs();
    setInterval(() => {
      void runWhatsappOfficialCampaignWorkerTick().catch((err) =>
        appLogger.error('wa-official-campaign-worker', 'tick error', { err: String(err) }),
      );
    }, waCampPoll);
  }

  const ticketAutoResolveMs = Math.max(
    3_600_000,
    parseInt(process.env.TICKET_AUTO_RESOLVE_POLL_MS || String(24 * 3_600_000), 10),
  );
  setInterval(() => {
    void import('./services/ticketAutoResolveService.js')
      .then(({ runTicketAutoResolveBatch }) => runTicketAutoResolveBatch())
      .then((result) => {
        if (result.resolved_count > 0) {
          appLogger.info('tickets-auto-resolve', 'resolved', { resolved: result.resolved_count });
        }
      })
      .catch((err) => appLogger.error('tickets-auto-resolve', 'tick error', { err: String(err) }));
  }, ticketAutoResolveMs);

  const trialRecoveryMs = Math.max(
    3_600_000,
    parseInt(process.env.TRIAL_RECOVERY_LIFECYCLE_POLL_MS || '86400000', 10),
  );
  setInterval(() => {
    void import('./jobs/trialRecoveryLifecycleJob.js')
      .then(({ runTrialRecoveryLifecycleOnce }) => runTrialRecoveryLifecycleOnce())
      .catch((err) => appLogger.error('trial-recovery-lifecycle', 'tick error', { err: String(err) }));
  }, trialRecoveryMs);

  void import('./jobs/trialEngagementLifecycleJob.js')
    .then(({ runTrialEngagementLifecycleOnce }) => runTrialEngagementLifecycleOnce())
    .catch((err) => appLogger.error('trial-engagement-lifecycle', 'startup error', { err: String(err) }));

  setInterval(() => {
    void import('./jobs/trialEngagementLifecycleJob.js')
      .then(({ runTrialEngagementLifecycleOnce }) => runTrialEngagementLifecycleOnce())
      .catch((err) => appLogger.error('trial-engagement-lifecycle', 'tick error', { err: String(err) }));
  }, 3_600_000);

  void import('./jobs/trialExpirationJob.js')
    .then(({ runTrialExpirationOnce }) => runTrialExpirationOnce())
    .catch((err) => appLogger.error('trial-expiration', 'startup error', { err: String(err) }));

  setInterval(() => {
    void import('./jobs/trialExpirationJob.js')
      .then(({ runTrialExpirationOnce }) => runTrialExpirationOnce())
      .catch((err) => appLogger.error('trial-expiration', 'tick error', { err: String(err) }));
  }, 3_600_000);
  });
})();

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Porta ${PORT} já está em uso. Outra instância do backend pode estar rodando.`);
    console.error('   Soluções: feche a outra janela do backend ou execute na raiz do projeto: kill-port-3001.bat\n');
  } else {
    console.error('Server error:', err);
  }
  process.exitCode = 1;
});


