import { Router } from 'express';
import { getBillingReceipts } from '../controllers/financeController.js';
import {
  listFinanceAccountsHandler,
  getFinanceAccountHandler,
  getFinanceAccountLedgerHandler,
  getFinanceAccountPeriodHandler,
  createFinanceAccountHandler,
  patchFinanceAccountHandler,
  deleteFinanceAccountHandler,
  listFinanceExpenseCategoriesHandler,
  createFinanceExpenseCategoryHandler,
  listFinanceIncomeEntriesHandler,
  createFinanceIncomeEntryHandler,
  patchFinanceIncomeEntryHandler,
  deleteFinanceIncomeEntryHandler,
  listFinanceExpenseEntriesHandler,
  createFinanceExpenseEntryHandler,
  patchFinanceExpenseEntryHandler,
  deleteFinanceExpenseEntryHandler,
} from '../controllers/financeModuleController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();

router.use(...tenantAuthCrm);

router.get('/billing-receipts', getBillingReceipts);

router.get('/accounts', listFinanceAccountsHandler);
router.post('/accounts', createFinanceAccountHandler);
router.get('/accounts/:accountId/ledger', getFinanceAccountLedgerHandler);
router.get('/accounts/:accountId/period', getFinanceAccountPeriodHandler);
router.get('/accounts/:accountId', getFinanceAccountHandler);
router.patch('/accounts/:accountId', patchFinanceAccountHandler);
router.delete('/accounts/:accountId', deleteFinanceAccountHandler);

router.get('/expense-categories', listFinanceExpenseCategoriesHandler);
router.post('/expense-categories', createFinanceExpenseCategoryHandler);

router.get('/income-entries', listFinanceIncomeEntriesHandler);
router.post('/income-entries', createFinanceIncomeEntryHandler);
router.patch('/income-entries/:id', patchFinanceIncomeEntryHandler);
router.delete('/income-entries/:id', deleteFinanceIncomeEntryHandler);

router.get('/expense-entries', listFinanceExpenseEntriesHandler);
router.post('/expense-entries', createFinanceExpenseEntryHandler);
router.patch('/expense-entries/:id', patchFinanceExpenseEntryHandler);
router.delete('/expense-entries/:id', deleteFinanceExpenseEntryHandler);

export default router;
