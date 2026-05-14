import { Router } from 'express';
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from '../controllers/projectsController.js';
import {
  getProjectFinancialExpenses,
  getProjectFinancialInvoices,
  getProjectFinancialSummary,
} from '../controllers/projectFinancialController.js';
import { tenantAuthCrm } from '../middleware/auth.js';
import { requirePermission } from '../permissions/index.js';

const router = Router();

// Todas as rotas requerem autenticação e tenant atual
router.use(...tenantAuthCrm);

// Rotas de projetos
router.get('/', getProjects);
router.get('/:projectId/financial/summary', getProjectFinancialSummary);
router.get('/:projectId/financial/invoices', getProjectFinancialInvoices);
router.get('/:projectId/financial/expenses', getProjectFinancialExpenses);
router.get('/:id', getProjectById);
router.post('/', requirePermission('projects.create'), createProject);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);

export default router;


