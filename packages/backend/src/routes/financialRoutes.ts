import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import {
  listFinancialAccountsHandler,
  createFinancialAccountHandler,
  getFinancialAccountByIdHandler,
  patchFinancialAccountSettingsHandler,
  getFinancialAccountPermissionsHandler,
  putFinancialAccountPermissionsHandler,
  getFinancialAccountGatewayLinkHandler,
  putFinancialAccountGatewayLinkHandler,
  patchFinancialAccountHandler,
  deleteFinancialAccountHandler,
  listFinancialTransactionsHandler,
  patchFinancialTransactionHandler,
  createFinancialTransactionHandler,
  getPayablesHandler,
  listFinancialTransfersHandler,
  createFinancialTransferHandler,
  listExpenseCategoriesHandler,
  createExpenseCategoryHandler,
  getFinancialSummaryHandler,
  listRecurringExpensesHandler,
  createRecurringExpenseHandler,
  updateRecurringExpenseHandler,
  regenerateRecurringHandler,
  listRecurringOccurrencesHandler,
  payRecurringOccurrenceHandler,
  listCreditCardsHandler,
  getCreditCardHandler,
  createCreditCardHandler,
  patchCreditCardHandler,
  listCreditCardPurchasesHandler,
  createCreditCardPurchaseHandler,
  listCreditCardInstallmentsHandler,
  listCreditCardStatementsHandler,
  getCreditCardStatementHandler,
  payCreditCardStatementHandler,
  getFinancialReportsHandler,
  getFinancialGatewaysAvailableHandler,
  postGatewayReceivablesSyncPaidInvoicesHandler,
} from '../controllers/financialController.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/summary', getFinancialSummaryHandler);
router.get('/reports', getFinancialReportsHandler);
router.get('/gateways/available', getFinancialGatewaysAvailableHandler);
router.post('/gateway-receivables/sync-paid-invoices', postGatewayReceivablesSyncPaidInvoicesHandler);
router.get('/payables', getPayablesHandler);
router.get('/accounts-payable', getPayablesHandler);

router.get('/accounts', listFinancialAccountsHandler);
router.post('/accounts', createFinancialAccountHandler);
router.patch('/accounts/:accountId/settings', patchFinancialAccountSettingsHandler);
router.get('/accounts/:accountId/permissions', getFinancialAccountPermissionsHandler);
router.put('/accounts/:accountId/permissions', putFinancialAccountPermissionsHandler);
router.get('/accounts/:accountId/gateway-link', getFinancialAccountGatewayLinkHandler);
router.put('/accounts/:accountId/gateway-link', putFinancialAccountGatewayLinkHandler);
router.get('/accounts/:accountId', getFinancialAccountByIdHandler);
router.delete('/accounts/:accountId', deleteFinancialAccountHandler);
router.patch('/accounts/:accountId', patchFinancialAccountHandler);

router.get('/transactions', listFinancialTransactionsHandler);
router.post('/transactions', createFinancialTransactionHandler);
router.patch('/transactions/:transactionId', patchFinancialTransactionHandler);
router.get('/transfers', listFinancialTransfersHandler);
router.post('/transfers', createFinancialTransferHandler);

router.get('/categories', listExpenseCategoriesHandler);
router.post('/categories', createExpenseCategoryHandler);

router.get('/recurring-expenses', listRecurringExpensesHandler);
router.post('/recurring-expenses', createRecurringExpenseHandler);
router.post('/recurring-expenses/:recurringId/regenerate', regenerateRecurringHandler);
router.patch('/recurring-expenses/:recurringId', updateRecurringExpenseHandler);

router.get('/recurring-expense-occurrences', listRecurringOccurrencesHandler);
router.post('/recurring-expense-occurrences/:occurrenceId/pay', payRecurringOccurrenceHandler);

router.get('/credit-cards', listCreditCardsHandler);
router.post('/credit-cards', createCreditCardHandler);
router.get('/credit-cards/:cardId', getCreditCardHandler);
router.patch('/credit-cards/:cardId', patchCreditCardHandler);

router.get('/credit-card-purchases', listCreditCardPurchasesHandler);
router.post('/credit-card-purchases', createCreditCardPurchaseHandler);

router.get('/credit-card-installments', listCreditCardInstallmentsHandler);

router.get('/credit-card-statements', listCreditCardStatementsHandler);
router.get('/credit-card-statements/:statementId', getCreditCardStatementHandler);
router.post('/credit-card-statements/:statementId/pay', payCreditCardStatementHandler);

export default router;
