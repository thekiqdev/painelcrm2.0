import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
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
import { pool } from './utils/db.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.API_PORT || '3001', 10);

// Middleware
app.use(helmet());
// CORS - aceitar FRONTEND_URL e também URLs do Easypanel
const frontendUrl = process.env.FRONTEND_URL;
const corsOrigins: string[] = [
  frontendUrl,
  frontendUrl?.replace(/\/$/, ''), // Remove trailing slash
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081',
].filter((url): url is string => typeof url === 'string' && url.length > 0); // Remove undefined/null e garante que são strings

app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : true, // Se não houver URLs, aceitar todas (apenas para debug)
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Routes
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

// Start server - escutar em 0.0.0.0 para ser acessível em containers
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Listening on 0.0.0.0:${PORT}`);
});


