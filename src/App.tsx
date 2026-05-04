import { Suspense, lazy } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ModulePermissionsProvider } from "./contexts/ModulePermissionsContext";
import AuthLayout from "./layouts/AuthLayout";
import AuthWhatsApp from "./pages/AuthWhatsApp";
const ForgotPasswordWhatsapp = lazy(() => import("./pages/ForgotPasswordWhatsapp"));
import Register from "./pages/Register";
import RegistrationSteps from "./pages/Registration/RegistrationSteps";
import AuthGuard from "./components/AuthGuard";
import SuperAdminGuard from "./components/SuperAdminGuard";
import AppLayout from "./layouts/AppLayout";
import SuperAdminLayout from "./layouts/SuperAdminLayout";
import SettingsLayout from "./layouts/SettingsLayout";
import NotFound from "./pages/NotFound";
import HomeOrRedirect from "./components/HomeOrRedirect";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// Lazy load todas as rotas protegidas para otimizar carregamento inicial
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientProfile = lazy(() => import("./pages/ClientProfile"));
const Leads = lazy(() => import("./pages/Leads"));
const Funnel = lazy(() => import("./pages/Funnel"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Agenda = lazy(() => import("./pages/Agenda"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectWizardPage = lazy(() => import("./pages/ProjectWizardPage"));
const ProjectAreaPage = lazy(() => import("./pages/ProjectAreaPage"));
const ProjectTemplates = lazy(() => import("./pages/ProjectTemplates"));
const Products = lazy(() => import("./pages/Products"));
const StoreSettings = lazy(() => import("./pages/StoreSettings"));
const Proposals = lazy(() => import("./pages/Proposals"));
const ProposalTemplates = lazy(() => import("./pages/ProposalTemplates"));
const ProposalTemplateFormPage = lazy(() => import("./pages/ProposalTemplateFormPage"));
const NewProposal = lazy(() => import("./pages/NewProposal"));
const EditProposal = lazy(() => import("./pages/EditProposal"));
const Contracts = lazy(() => import("./pages/Contracts"));
const ContractTemplates = lazy(() => import("./pages/ContractTemplates"));
const ContractTemplateFormPage = lazy(() => import("./pages/ContractTemplateFormPage"));
const NewContract = lazy(() => import("./pages/NewContract"));
const ContractDetails = lazy(() => import("./pages/ContractDetails"));
const CustomerInvoices = lazy(() => import("./pages/CustomerInvoices"));
const CustomerInvoiceNew = lazy(() => import("./pages/CustomerInvoiceNew"));
const CustomerInvoiceDetail = lazy(() => import("./pages/CustomerInvoiceDetail"));
const SubscriptionsList = lazy(() => import("./pages/SubscriptionsList"));
const SubscriptionDetail = lazy(() => import("./pages/SubscriptionDetail"));
const CustomerInvoicePay = lazy(() => import("./pages/CustomerInvoicePay"));
const PublicContractView = lazy(() => import("./pages/PublicContractView"));
const PublicContractSign = lazy(() => import("./pages/PublicContractSign"));
const PublicProposalView = lazy(() => import("./pages/PublicProposalView"));
const PublicAppointmentConfirmation = lazy(() => import("./pages/PublicAppointmentConfirmation"));
const CustomerCharges = lazy(() => import("./pages/CustomerCharges"));
const CustomerChargeDetail = lazy(() => import("./pages/CustomerChargeDetail"));
const Finance = lazy(() => import("./pages/Finance"));
const FinanceLayout = lazy(() => import("./pages/finance/FinanceLayout"));
const FinanceSummaryPage = lazy(() => import("./pages/finance/FinanceSummaryPage"));
const FinanceAccountsPage = lazy(() => import("./pages/finance/FinanceAccountsPage"));
const FinanceAccountDetailPage = lazy(() => import("./pages/finance/FinanceAccountDetailPage"));
const FinanceIncomesPage = lazy(() => import("./pages/finance/FinanceIncomesPage"));
const FinanceExpensesPage = lazy(() => import("./pages/finance/FinanceExpensesPage"));
const FinancePlaceholderPage = lazy(() => import("./pages/finance/FinancePlaceholderPage"));
const FinancialOverviewPage = lazy(() => import("./pages/finance/FinancialOverviewPage"));
const FinancialUnifiedAccountsPage = lazy(() => import("./pages/finance/FinancialUnifiedAccountsPage"));
const FinancialUnifiedAccountDetailPage = lazy(() => import("./pages/finance/FinancialUnifiedAccountDetailPage"));
const FinancialUnifiedTransactionsPage = lazy(() => import("./pages/finance/FinancialUnifiedTransactionsPage"));
const FinancialUnifiedExpensesPage = lazy(() => import("./pages/finance/FinancialUnifiedExpensesPage"));
const FinancialCategoriesPage = lazy(() => import("./pages/finance/FinancialCategoriesPage"));
const FinancialAccountsPayablePage = lazy(() => import("./pages/finance/FinancialAccountsPayablePage"));
const FinanceCreditCardsPage = lazy(() => import("./pages/finance/FinanceCreditCardsPage"));
const FinanceCreditCardDetailPage = lazy(() => import("./pages/finance/FinanceCreditCardDetailPage"));
const FinanceCreditCardStatementPage = lazy(() => import("./pages/finance/FinanceCreditCardStatementPage"));
const FinancialReportsPage = lazy(() => import("./pages/finance/FinancialReportsPage"));
const Settings = lazy(() => import("./pages/Settings"));
const PaymentsPanelPage = lazy(() => import("./pages/settings/PaymentsPanelPage"));
const GatewayConfigPage = lazy(() => import("./pages/settings/GatewayConfigPage"));
const Chat = lazy(() => import("./pages/Chat"));
const ChatKanbanPage = lazy(() => import("./pages/ChatKanbanPage"));
const FunnelDetails = lazy(() => import("./pages/FunnelDetails"));
const ProposalDetails = lazy(() => import("./pages/ProposalDetails"));
const PublicStore = lazy(() => import("./pages/PublicStore").then(m => ({ default: m.PublicStore })));
const PublicProduct = lazy(() => import("./pages/PublicProduct").then(m => ({ default: m.PublicProduct })));
const StorePublicCheckout = lazy(() => import("./pages/StorePublicCheckout"));
const ProductForm = lazy(() => import("./pages/ProductForm"));
const Orders = lazy(() => import("./pages/Orders"));
const Tickets = lazy(() => import("./pages/Tickets"));
const TicketDetail = lazy(() => import("./pages/TicketDetail"));
const NewTicket = lazy(() => import("./pages/NewTicket"));
const SuperAdminDashboard = lazy(() => import("./pages/superadmin/SuperAdminDashboard"));
const SuperAdminPlans = lazy(() => import("./pages/superadmin/SuperAdminPlans"));
const SuperAdminClients = lazy(() => import("./pages/superadmin/SuperAdminClients"));
const SuperAdminClientLayout = lazy(() => import("./pages/superadmin/SuperAdminClientLayout"));
const SuperAdminClientResumo = lazy(() => import("./pages/superadmin/SuperAdminClientResumo"));
const SuperAdminClientConfiguracoes = lazy(() => import("./pages/superadmin/SuperAdminClientConfiguracoes"));
const SuperAdminClientFaturamento = lazy(() => import("./pages/superadmin/SuperAdminClientFaturamento"));
const SuperAdminClientUsuarios = lazy(() => import("./pages/superadmin/SuperAdminClientUsuarios"));
const SuperAdminClientPlaceholder = lazy(() => import("./pages/superadmin/SuperAdminClientPlaceholder"));
const SuperAdminClientRecursos = lazy(() => import("./pages/superadmin/SuperAdminClientRecursos"));
const SuperAdminClientLimites = lazy(() => import("./pages/superadmin/SuperAdminClientLimites"));
const SuperAdminClientObservacoes = lazy(() => import("./pages/superadmin/SuperAdminClientObservacoes"));
const SuperAdminClientLogs = lazy(() => import("./pages/superadmin/SuperAdminClientLogs"));
const SuperAdminClientNew = lazy(() => import("./pages/superadmin/SuperAdminClientNew"));
const SuperAdminFeatures = lazy(() => import("./pages/superadmin/SuperAdminFeatures"));
const SuperAdminPlanFeatures = lazy(() => import("./pages/superadmin/SuperAdminPlanFeatures"));
const SuperAdminTenantFeatures = lazy(() => import("./pages/superadmin/SuperAdminTenantFeatures"));
const SuperAdminAudit = lazy(() => import("./pages/superadmin/SuperAdminAudit"));
const SuperAdminReports = lazy(() => import("./pages/superadmin/SuperAdminReports"));
const SuperAdminUsers = lazy(() => import("./pages/superadmin/SuperAdminUsers"));
const SuperAdminNotifications = lazy(() => import("./pages/superadmin/SuperAdminNotifications"));
const SuperAdminPagamentos = lazy(() => import("./pages/superadmin/SuperAdminPagamentos"));
const SuperAdminNotificationsEngineSettings = lazy(() => import("./pages/superadmin/SuperAdminNotificationsEngineSettings"));
const SuperAdminCrmNotificationTemplates = lazy(() => import("./pages/superadmin/SuperAdminCrmNotificationTemplates"));
const SuperAdminPlatformNotifications = lazy(() => import("./pages/superadmin/SuperAdminPlatformNotifications"));
const SuperAdminPlatformBillings = lazy(() => import("./pages/superadmin/SuperAdminPlatformBillings"));
const PublicSaasBillingPay = lazy(() => import("./pages/PublicSaasBillingPay"));
const SuperAdminSubscriptionCyclesSettings = lazy(() => import("./pages/superadmin/SuperAdminSubscriptionCyclesSettings"));
const SuperAdminAnnouncements = lazy(() => import("./pages/superadmin/SuperAdminAnnouncements"));
const SuperAdminAnnouncementEditor = lazy(() => import("./pages/superadmin/SuperAdminAnnouncementEditor"));
const SuperAdminAnnouncementSend = lazy(() => import("./pages/superadmin/SuperAdminAnnouncementSend"));
const SuperAdminAnnouncementSends = lazy(() => import("./pages/superadmin/SuperAdminAnnouncementSends"));
const SuperAdminAnnouncementSendDetail = lazy(() => import("./pages/superadmin/SuperAdminAnnouncementSendDetail"));
const SuperAdminAnnouncementGroups = lazy(() => import("./pages/superadmin/SuperAdminAnnouncementGroups"));
const SuperAdminLeads = lazy(() => import("./pages/superadmin/SuperAdminLeads"));
const SuperAdminLeadGroups = lazy(() => import("./pages/superadmin/SuperAdminLeadGroups"));
const ConnectionsPage = lazy(() => import("./pages/superadmin/connections/ConnectionsPage"));
const WhatsappOfficialConnectionPage = lazy(() => import("./pages/superadmin/connections/WhatsappOfficialConnectionPage"));
const WhatsappOfficialModelosPage = lazy(() => import("./pages/superadmin/connections/WhatsappOfficialModelosPage"));
const UazapiConnectionPage = lazy(() => import("./pages/superadmin/connections/UazapiConnectionPage"));
const WhatsappOfficialChatFull = lazy(() => import("./pages/superadmin/connections/WhatsappOfficialChatFull"));
const SuperAdminLegalPages = lazy(() => import("./pages/superadmin/SuperAdminLegalPages"));
const SuperAdminHubPage = lazy(() => import("./pages/superadmin/SuperAdminHubPage"));
const SuperAdminSmtpSettings = lazy(() => import("./pages/superadmin/SuperAdminSmtpSettings"));
const PublicPrivacyPolicyPage = lazy(() =>
  import("./pages/legal/PublicLegalPage").then((m) => ({ default: m.PublicPrivacyPolicyPage })),
);
const PublicTermsOfServicePage = lazy(() =>
  import("./pages/legal/PublicLegalPage").then((m) => ({ default: m.PublicTermsOfServicePage })),
);
const UpdatesPage = lazy(() => import("./pages/UpdatesPage"));
const UpdateDetailPage = lazy(() => import("./pages/UpdateDetailPage"));

const Profile = lazy(() => import("./pages/Profile"));
const MeuPlano = lazy(() => import("./pages/MeuPlano"));
const InternalBillingCheckout = lazy(() => import("./pages/InternalBillingCheckout"));
const PlanCheckout = lazy(() => import("./pages/PlanCheckout"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

const LandingPage = lazy(() => import("./landingpage").then(m => ({ default: m.LandingPage })));

// Loading fallback simples
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-crm-primary"></div>
      <p className="mt-4 text-muted-foreground">Carregando...</p>
    </div>
  </div>
);

// Cache agressivo: dados na hora ao voltar; menos refetch e retentativas para evitar lentidão
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 5 min – não refetch ao focar/montar
      gcTime: 15 * 60 * 1000,        // 15 min – dados mantidos em cache
      refetchOnWindowFocus: false,
      refetchOnMount: false,          // nunca refetch só por montar – só invalidação manual
      refetchOnReconnect: false,
      retry: 1,                      // no máximo 1 retry (evita 3x em 401 e duplicatas)
      retryDelay: 1000,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <ThemeProvider>
        <AuthProvider>
          <ModulePermissionsProvider>
          <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomeOrRedirect />} />
            <Route path="/landing" element={<Suspense fallback={<LoadingFallback />}><LandingPage /></Suspense>} />
            <Route path="/landingpage" element={<Navigate to="/" replace />} />
            
            {/* Alterado: a página de registro não precisa de AuthGuard */}
            <Route path="/register" element={<AuthLayout><Register /></AuthLayout>} />
            
            <Route path="/register/steps" element={
              <AuthGuard requireAuth={true} requireComplete={false} redirectTo="/login">
                <AuthLayout>
                  <RegistrationSteps />
                </AuthLayout>
              </AuthGuard>
            } />
            <Route path="/login" element={<AuthLayout><AuthWhatsApp /></AuthLayout>} />
            <Route
              path="/recuperar-senha"
              element={
                <AuthLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <ForgotPasswordWhatsapp />
                  </Suspense>
                </AuthLayout>
              }
            />
            <Route path="/checkout" element={<Suspense fallback={<LoadingFallback />}><PlanCheckout /></Suspense>} />
            <Route path="/onboarding" element={<Suspense fallback={<LoadingFallback />}><Onboarding /></Suspense>} />
            <Route path="/pay/:token" element={<Suspense fallback={<LoadingFallback />}><CustomerInvoicePay /></Suspense>} />
            <Route path="/saas-pay/:token" element={<Suspense fallback={<LoadingFallback />}><PublicSaasBillingPay /></Suspense>} />
            <Route path="/contract-view/:token" element={<Suspense fallback={<LoadingFallback />}><PublicContractView /></Suspense>} />
            <Route path="/proposal-view/:token" element={<Suspense fallback={<LoadingFallback />}><PublicProposalView /></Suspense>} />
            <Route
              path="/confirmar-compromisso/:token"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <PublicAppointmentConfirmation />
                </Suspense>
              }
            />
            <Route path="/contract-sign/:token" element={<Suspense fallback={<LoadingFallback />}><PublicContractSign /></Suspense>} />
            <Route
              path="/legal/privacy-policy"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <PublicPrivacyPolicyPage />
                </Suspense>
              }
            />
            <Route
              path="/legal/terms-of-service"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <PublicTermsOfServicePage />
                </Suspense>
              }
            />
            <Route path="/admin/configuracoes/legal" element={<Navigate to="/superadmin/configuracoes/legal" replace />} />

              {/* Protected routes - lazy loaded */}
            <Route path="/dashboard" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Dashboard />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/updates" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <UpdatesPage />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/updates/:id" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <UpdateDetailPage />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            
            <Route path="/clients" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Clients />
                    </Suspense>
                  </AppLayout>
                </AuthGuard>
              } />
              <Route path="/clients/:id" element={
                <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ClientProfile />
                    </Suspense>
                  </AppLayout>
                </AuthGuard>
              } />
              <Route path="/clients/:id/:tab" element={
                <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ClientProfile />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/leads" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Leads />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/funnel" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Funnel />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/funnel/:funnelId" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <FunnelDetails />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/funnel/:funnelId/stage/:stageId/proposal/:proposalId" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProposalDetails />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/projects" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Projects />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/projects/new" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProjectWizardPage />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/projects/:projectId/area/:areaId" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProjectAreaPage />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/tasks" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Tasks />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/agenda" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Agenda />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/project-templates" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProjectTemplates />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            {/* Admin Products Routes */}
            <Route path="/admin/products" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Products />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/admin/products/new" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProductForm />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/admin/products/:id/edit" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProductForm />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/admin/loja" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <StoreSettings />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            
            {/* Legacy routes - redirect to admin */}
            <Route path="/products" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Products />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/products/new" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProductForm />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/products/edit/:id" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProductForm />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/orders" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Orders />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/proposals" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Proposals />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/proposals/new" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <NewProposal />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/proposals/:proposalId/edit" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <EditProposal />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/proposals/templates" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProposalTemplates />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/proposals/templates/new" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProposalTemplateFormPage />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/proposals/templates/:templateId/edit" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProposalTemplateFormPage />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/proposals/:proposalId" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ProposalDetails />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/contracts" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Contracts />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/contracts/new" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <NewContract />
                    </Suspense>
                  </AppLayout>
                </AuthGuard>
              } />
            <Route path="/contracts/templates" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ContractTemplates />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/contracts/templates/new" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ContractTemplateFormPage />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/contracts/templates/:templateId/edit" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ContractTemplateFormPage />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
              <Route path="/contracts/:id/edit" element={
                <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <NewContract />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/contracts/:id" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ContractDetails />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/billing" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <Navigate to="/customer-invoices" replace />
              </AuthGuard>
            } />
            <Route path="/customer-invoices" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <CustomerInvoices />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/customer-invoices/new" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <CustomerInvoiceNew />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/customer-invoices/:id/edit" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <CustomerInvoiceNew />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/customer-invoices/:id" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <CustomerInvoiceDetail />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/crm-subscriptions" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <SubscriptionsList />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/crm-subscriptions/:id" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <SubscriptionDetail />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/customer-charges" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <CustomerCharges />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/customer-charges/:id" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <CustomerChargeDetail />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/finance" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <FinanceLayout />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            }>
              <Route index element={<FinancialOverviewPage />} />
              <Route path="accounts/:accountId" element={<FinancialUnifiedAccountDetailPage />} />
              <Route path="accounts" element={<FinancialUnifiedAccountsPage />} />
              <Route path="transactions" element={<FinancialUnifiedTransactionsPage />} />
              <Route path="expenses" element={<FinancialUnifiedExpensesPage />} />
              <Route path="accounts-payable" element={<FinancialAccountsPayablePage />} />
              <Route path="categories" element={<FinancialCategoriesPage />} />
              <Route
                path="recurring-expenses"
                element={<Navigate to={{ pathname: "/finance/accounts-payable", hash: "hub-regras-recorrencia" }} replace />}
              />
              <Route path="resumo" element={<FinanceSummaryPage />} />
              <Route path="contas" element={<FinanceAccountsPage />} />
              <Route path="contas/:accountId" element={<FinanceAccountDetailPage />} />
              <Route path="entradas" element={<FinanceIncomesPage />} />
              <Route path="despesas" element={<FinanceExpensesPage />} />
              <Route path="credit-cards" element={<FinanceCreditCardsPage />} />
              <Route path="credit-cards/:cardId" element={<FinanceCreditCardDetailPage />} />
              <Route path="credit-cards/:cardId/faturas/:statementId" element={<FinanceCreditCardStatementPage />} />
              <Route path="cartoes" element={<Navigate to="/finance/credit-cards" replace />} />
              <Route path="relatorios" element={<FinancialReportsPage />} />
              <Route path="notas-internas" element={<Finance />} />
            </Route>
            <Route path="/chat/kanbam" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <ChatKanbanPage />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/chat/:conversationId" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Chat />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/chat" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Chat />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/settings" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <SettingsLayout />
                  </AppLayout>
              </AuthGuard>
            }>
              <Route index element={
                <Suspense fallback={<LoadingFallback />}>
                  <Settings />
                </Suspense>
              } />
              <Route path="integrations" element={
                <Suspense fallback={<LoadingFallback />}>
                  <Settings />
                </Suspense>
              } />
              <Route path="payments" element={
                <Suspense fallback={<LoadingFallback />}>
                  <PaymentsPanelPage />
                </Suspense>
              } />
              <Route path="payments/:gatewayKey" element={
                <Suspense fallback={<LoadingFallback />}>
                  <GatewayConfigPage />
                </Suspense>
              } />
            </Route>
            <Route path="/profile" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Profile />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/meu-plano" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <MeuPlano />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/saas-billing/:billingId/pay" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <InternalBillingCheckout />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/support/tickets/new" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <NewTicket />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/support/tickets/:id" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <TicketDetail />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/support/tickets" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Tickets />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            
            {/* Super Admin - apenas para usuários com is_super_admin */}
            <Route path="/superadmin" element={<AuthGuard requireAuth={true} redirectTo="/"><SuperAdminGuard /></AuthGuard>}>
              <Route element={<SuperAdminLayout />}>
                <Route index element={<Suspense fallback={<LoadingFallback />}><SuperAdminDashboard /></Suspense>} />
                <Route path="comercial" element={<Suspense fallback={<LoadingFallback />}><SuperAdminHubPage /></Suspense>} />
                <Route path="financeiro" element={<Suspense fallback={<LoadingFallback />}><SuperAdminHubPage /></Suspense>} />
                <Route path="comunicacao" element={<Suspense fallback={<LoadingFallback />}><SuperAdminHubPage /></Suspense>} />
                <Route path="conexoes" element={<Suspense fallback={<LoadingFallback />}><ConnectionsPage /></Suspense>} />
                <Route path="conexoes/whatsapp-oficial" element={<Suspense fallback={<LoadingFallback />}><WhatsappOfficialConnectionPage /></Suspense>} />
                <Route path="conexoes/whatsapp-oficial/modelos" element={<Suspense fallback={<LoadingFallback />}><WhatsappOfficialModelosPage /></Suspense>} />
                <Route path="conexoes/whatsapp-oficial/chat" element={<Suspense fallback={<LoadingFallback />}><WhatsappOfficialChatFull /></Suspense>} />
                <Route path="conexoes/uazapi" element={<Suspense fallback={<LoadingFallback />}><UazapiConnectionPage /></Suspense>} />
                <Route path="plataforma" element={<Suspense fallback={<LoadingFallback />}><SuperAdminHubPage /></Suspense>} />
                <Route path="seguranca" element={<Suspense fallback={<LoadingFallback />}><SuperAdminHubPage /></Suspense>} />
                <Route path="plans" element={<Suspense fallback={<LoadingFallback />}><SuperAdminPlans /></Suspense>} />
                <Route path="plans/:id/features" element={<Suspense fallback={<LoadingFallback />}><SuperAdminPlanFeatures /></Suspense>} />
                <Route path="clients" element={<Suspense fallback={<LoadingFallback />}><SuperAdminClients /></Suspense>} />
                <Route path="clients/new" element={<Suspense fallback={<LoadingFallback />}><SuperAdminClientNew /></Suspense>} />
                <Route path="clients/:id" element={<Suspense fallback={<LoadingFallback />}><SuperAdminClientLayout /></Suspense>}>
                  <Route index element={<Navigate to="resumo" replace />} />
                  <Route path="resumo" element={<SuperAdminClientResumo />} />
                  <Route path="configuracoes" element={<SuperAdminClientConfiguracoes />} />
                  <Route path="faturamento" element={<SuperAdminClientFaturamento />} />
                  <Route path="usuarios" element={<SuperAdminClientUsuarios />} />
                  <Route path="recursos" element={<SuperAdminClientRecursos />} />
                  <Route path="limites" element={<SuperAdminClientLimites />} />
                  <Route path="observacoes" element={<SuperAdminClientObservacoes />} />
                  <Route path="logs" element={<SuperAdminClientLogs />} />
                </Route>
                <Route path="tenants/:id/features" element={<Suspense fallback={<LoadingFallback />}><SuperAdminTenantFeatures /></Suspense>} />
                <Route path="features" element={<Suspense fallback={<LoadingFallback />}><SuperAdminFeatures /></Suspense>} />
                <Route path="audit" element={<Suspense fallback={<LoadingFallback />}><SuperAdminAudit /></Suspense>} />
                <Route path="reports" element={<Suspense fallback={<LoadingFallback />}><SuperAdminReports /></Suspense>} />
                <Route path="users" element={<Suspense fallback={<LoadingFallback />}><SuperAdminUsers /></Suspense>} />
                <Route path="notifications" element={<Suspense fallback={<LoadingFallback />}><SuperAdminNotifications /></Suspense>} />
                <Route path="pagamentos" element={<Suspense fallback={<LoadingFallback />}><SuperAdminPagamentos /></Suspense>} />
                <Route path="notifications-engine" element={<Suspense fallback={<LoadingFallback />}><SuperAdminNotificationsEngineSettings /></Suspense>} />
                <Route
                  path="notification-templates"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <SuperAdminCrmNotificationTemplates />
                    </Suspense>
                  }
                />
                <Route path="subscription-cycles" element={<Suspense fallback={<LoadingFallback />}><SuperAdminSubscriptionCyclesSettings /></Suspense>} />
                <Route path="platform-notifications" element={<Suspense fallback={<LoadingFallback />}><SuperAdminPlatformNotifications /></Suspense>} />
                <Route path="smtp" element={<Suspense fallback={<LoadingFallback />}><SuperAdminSmtpSettings /></Suspense>} />
                <Route path="platform-billings" element={<Suspense fallback={<LoadingFallback />}><SuperAdminPlatformBillings /></Suspense>} />
                <Route path="announcements/groups" element={<Suspense fallback={<LoadingFallback />}><SuperAdminAnnouncementGroups /></Suspense>} />
                <Route path="announcements/sends/:sendId" element={<Suspense fallback={<LoadingFallback />}><SuperAdminAnnouncementSendDetail /></Suspense>} />
                <Route path="announcements/sends" element={<Suspense fallback={<LoadingFallback />}><SuperAdminAnnouncementSends /></Suspense>} />
                <Route path="announcements/new" element={<Suspense fallback={<LoadingFallback />}><SuperAdminAnnouncementEditor /></Suspense>} />
                <Route path="announcements/:id/edit" element={<Suspense fallback={<LoadingFallback />}><SuperAdminAnnouncementEditor /></Suspense>} />
                <Route path="announcements/:id/send" element={<Suspense fallback={<LoadingFallback />}><SuperAdminAnnouncementSend /></Suspense>} />
                <Route path="announcements" element={<Suspense fallback={<LoadingFallback />}><SuperAdminAnnouncements /></Suspense>} />
                <Route path="leads/groups" element={<Suspense fallback={<LoadingFallback />}><SuperAdminLeadGroups /></Suspense>} />
                <Route path="leads" element={<Suspense fallback={<LoadingFallback />}><SuperAdminLeads /></Suspense>} />
                <Route path="whatsapp-oficial" element={<Navigate to="/superadmin/conexoes/whatsapp-oficial" replace />} />
                <Route
                  path="configuracoes/legal"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <SuperAdminLegalPages />
                    </Suspense>
                  }
                />
              </Route>
            </Route>
            
            {/* Public store routes */}
              <Route path="/:storeSlug/loja" element={
                <Suspense fallback={<LoadingFallback />}>
                  <PublicStore />
                </Suspense>
              } />
              <Route path="/:storeSlug/loja/produto/:productId" element={
                <Suspense fallback={<LoadingFallback />}>
                  <PublicProduct />
                </Suspense>
              } />
              <Route path="/:storeSlug/loja/checkout" element={
                <Suspense fallback={<LoadingFallback />}>
                  <StorePublicCheckout />
                </Suspense>
              } />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ModulePermissionsProvider>
        </AuthProvider>
        <Toaster />
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
