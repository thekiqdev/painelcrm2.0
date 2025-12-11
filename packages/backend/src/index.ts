import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRoutes from './routes/authRoutes.js';
import productsRoutes from './routes/productsRoutes.js';
import storeProfileRoutes from './routes/storeProfileRoutes.js';
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
import ticketCategoriesRoutes from './routes/ticketCategoriesRoutes.js';
import contractsRoutes from './routes/contractsRoutes.js';
import contractTemplatesRoutes from './routes/contractTemplatesRoutes.js';
import projectTemplatesRoutes from './routes/projectTemplatesRoutes.js';
import projectsRoutes from './routes/projectsRoutes.js';
import projectListsRoutes from './routes/projectListsRoutes.js';
import projectTasksRoutes from './routes/projectTasksRoutes.js';
import userProfilesRoutes from './routes/userProfilesRoutes.js';
import profileMembersRoutes from './routes/profileMembersRoutes.js';
import userPermissionsRoutes from './routes/userPermissionsRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import tasksRoutes from './routes/tasksRoutes.js';
import invoicesRoutes from './routes/invoicesRoutes.js';
import expensesRoutes from './routes/expensesRoutes.js';
import proposalsRoutes from './routes/proposalsRoutes.js';
import membersRoutes from './routes/membersRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import uazapiWebhookRoutes from './routes/uazapiWebhookRoutes.js';
import notificationsRoutes from './routes/notificationsRoutes.js';
import messageTemplatesRoutes from './routes/messageTemplatesRoutes.js';
import messagesRoutes from './routes/messagesRoutes.js';
import { pool } from './utils/db.js';
import { initializeWebSocket } from './services/websocketService.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = parseInt(process.env.API_PORT || '3001', 10);

// Trust proxy - necessário quando atrás de Nginx/reverse proxy
// Usar configuração segura para não confiar em qualquer IP arbitrário
const trustProxySetting =
  process.env.TRUST_PROXY_SETTING || 'loopback, linklocal, uniquelocal';
app.set('trust proxy', trustProxySetting);

// Middleware
app.use(helmet());
// CORS - aceitar FRONTEND_URL e também URLs do Easypanel
const extraOrigins = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '';
const parsedExtraOrigins = extraOrigins
  .split(',')
  .map((url) => url.trim())
  .filter((url) => url.length > 0)
  .flatMap((url) => [url, url.replace(/\/$/, '')]);

const corsOrigins: string[] = [
  ...new Set([
    ...parsedExtraOrigins,
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8081',
  ]),
];

app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : true, // Se não houver URLs, aceitar todas (apenas para debug)
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting mais generoso para endpoints de teste
const testLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 testes por minuto (suficiente para testes)
  message: 'Muitos testes enviados. Aguarde um momento antes de tentar novamente.',
  skip: (req) => {
    // Não aplicar rate limit em desenvolvimento
    return process.env.NODE_ENV === 'development';
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting para APIs (geral)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: (req) => {
    // Pular rate limit para endpoints de teste, webhooks e autenticação
    return req.path.includes('/test') || 
           req.path.startsWith('/webhooks/') ||
           req.path.startsWith('/api/auth/');
  },
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
// 2. Testes (específico)
app.use('/api/message-templates/:id/test', testLimiter);
// 3. API geral por último (mais genérico)
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

// Log all requests for debugging
app.use('/api', (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes - IMPORTANTE: Rotas específicas devem vir ANTES do rate limiter geral
// Mas como o rate limiter já foi aplicado acima, vamos garantir que testes tenham tratamento especial
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/store-profile', storeProfileRoutes);
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
app.use('/api/ticket-categories', ticketCategoriesRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/contract-templates', contractTemplatesRoutes);
app.use('/api/project-templates', projectTemplatesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/projects', projectListsRoutes);
app.use('/api/projects', projectTasksRoutes);
app.use('/api/user-profiles', userProfilesRoutes);
app.use('/api/user-profiles', profileMembersRoutes);
app.use('/api/user-profiles', userPermissionsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/message-templates', messageTemplatesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/webhooks/uazapi', uazapiWebhookRoutes);

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

// Test database connection on startup
pool.query('SELECT NOW()')
  .then(() => {
    console.log('✅ Connected to PostgreSQL database');
  })
  .catch((err) => {
    console.error('❌ Failed to connect to PostgreSQL:', err.message);
  });

// Inicializar WebSocket
initializeWebSocket(httpServer);

// Start server - escutar em 0.0.0.0 para ser acessível em containers
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Listening on 0.0.0.0:${PORT}`);
  console.log(`📡 WebSocket server initialized`);
});


