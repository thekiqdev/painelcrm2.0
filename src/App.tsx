import { Suspense } from "react";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ModulePermissionsProvider } from "./contexts/ModulePermissionsContext";
import AuthLayout from "./layouts/AuthLayout";
import AuthGuard from "./components/AuthGuard";
import SuperAdminGuard from "./components/SuperAdminGuard";
import AppLayout from "./layouts/AppLayout.lazy";
import SuperAdminLayout from "./layouts/SuperAdminLayout.lazy";
import SettingsLayout from "./layouts/SettingsLayout.lazy";
import { RouteLoadingFallback as LoadingFallback } from "@/components/RouteLoadingFallback";
import HomeOrRedirect from "./components/HomeOrRedirect";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { MetaPixelTrackingBridge } from "@/components/MetaPixelTrackingBridge";
import { ChatQueryPersistBridge } from "@/components/chat/ChatQueryPersistBridge";
import { ChatRouteFallback } from "@/components/chat/ChatRouteFallback";
import { ChatRouteTimingListener } from "@/components/chat/ChatRouteTimingListener";
import { loadChatPage } from "@/pages/chatLazy";
import { EntityDrawerContainer } from "@/components/entities/EntityDrawerContainer";

/**
 * Fase 2 — bundle inicial do CRM:
 * - Páginas de domínio (Dashboard, Chat, etc.) já estavam em lazyWithReload.
 * - Layouts pesados (AppLayout, SuperAdmin, Settings) carregam via *.lazy.tsx + Suspense.
 * - Auth (login/registo) e NotFound também em lazy para não ir no chunk de entrada.
 */
/** Slug antigo em inglês (`whatsapp-official`) → rotas reais `whatsapp-oficial` (preserva query). */
function SuperadminLegacyWhatsappOfficialRedirect() {
  const { pathname, search, hash } = useLocation();
  const dest = pathname.includes("whatsapp-official")
    ? pathname.replace(/whatsapp-official/g, "whatsapp-oficial")
    : "/superadmin/conexoes/whatsapp-oficial";
  return <Navigate to={`${dest}${search}${hash}`} replace />;
}

const ForgotPasswordWhatsapp = lazyWithReload(() => import("./pages/ForgotPasswordWhatsapp"));
const AuthWhatsApp = lazyWithReload(() => import("./pages/AuthWhatsApp"));
const Register = lazyWithReload(() => import("./pages/Register"));
const TesteGratis = lazyWithReload(() => import("./pages/TesteGratis"));
const AcquisitionSignupFlow = lazyWithReload(() => import("./pages/AcquisitionSignupFlow"));
const AcquisitionPremiumCheckout = lazyWithReload(() => import("./pages/AcquisitionPremiumCheckout"));
const AcquisitionOperationalOnboarding = lazyWithReload(
  () => import("./pages/AcquisitionOperationalOnboarding"),
);
const SuperAdminSignupAcquisitionPage = lazyWithReload(() => import("./pages/superadmin/SuperAdminSignupAcquisitionPage"));
const OnboardingKickoffPlaceholder = lazyWithReload(() => import("./pages/OnboardingKickoffPlaceholder"));
const RegistrationSteps = lazyWithReload(() => import("./pages/Registration/RegistrationSteps"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));

// Lazy load todas as rotas protegidas para otimizar carregamento inicial
const Dashboard = lazyWithReload(() => import("./pages/Dashboard"));
const Clients = lazyWithReload(() => import("./pages/Clients"));
const ClientProfile = lazyWithReload(() => import("./pages/ClientProfile"));
const Leads = lazyWithReload(() => import("./pages/Leads"));
const Funnel = lazyWithReload(() => import("./pages/Funnel"));
const Tasks = lazyWithReload(() => import("./pages/Tasks"));
const Agenda = lazyWithReload(() => import("./pages/Agenda"));
const Projects = lazyWithReload(() => import("./pages/Projects"));
const ProjectWizardPage = lazyWithReload(() => import("./pages/ProjectWizardPage"));
const ProjectAreaPage = lazyWithReload(() => import("./pages/ProjectAreaPage"));
const ProjectTemplates = lazyWithReload(() => import("./pages/ProjectTemplates"));
const Products = lazyWithReload(() => import("./pages/Products"));
const StoreSettings = lazyWithReload(() => import("./pages/StoreSettings"));
const Proposals = lazyWithReload(() => import("./pages/Proposals"));
const ProposalTemplates = lazyWithReload(() => import("./pages/ProposalTemplates"));
const ProposalTemplateFormPage = lazyWithReload(() => import("./pages/ProposalTemplateFormPage"));
const NewProposal = lazyWithReload(() => import("./pages/NewProposal"));
const EditProposal = lazyWithReload(() => import("./pages/EditProposal"));
const Contracts = lazyWithReload(() => import("./pages/Contracts"));
const ContractTemplates = lazyWithReload(() => import("./pages/ContractTemplates"));
const ContractTemplateFormPage = lazyWithReload(() => import("./pages/ContractTemplateFormPage"));
const NewContract = lazyWithReload(() => import("./pages/NewContract"));
const ContractDetails = lazyWithReload(() => import("./pages/ContractDetails"));
const CustomerInvoices = lazyWithReload(() => import("./pages/CustomerInvoices"));
const CustomerInvoiceNew = lazyWithReload(() => import("./pages/CustomerInvoiceNew"));
const CustomerInvoiceDetail = lazyWithReload(() => import("./pages/CustomerInvoiceDetail"));
const SubscriptionsList = lazyWithReload(() => import("./pages/SubscriptionsList"));
const SubscriptionDetail = lazyWithReload(() => import("./pages/SubscriptionDetail"));
const CustomerInvoicePay = lazyWithReload(() => import("./pages/CustomerInvoicePay"));
const PublicContractView = lazyWithReload(() => import("./pages/PublicContractView"));
const PublicContractSign = lazyWithReload(() => import("./pages/PublicContractSign"));
const PublicProposalView = lazyWithReload(() => import("./pages/PublicProposalView"));
const PublicAppointmentConfirmation = lazyWithReload(() => import("./pages/PublicAppointmentConfirmation"));
const PublicTicketView = lazyWithReload(() => import("./pages/PublicTicketView"));
const SuportePublicOrPlatformTicket = lazyWithReload(() => import("./pages/SuportePublicOrPlatformTicket"));
const CustomerCharges = lazyWithReload(() => import("./pages/CustomerCharges"));
const CustomerChargeDetail = lazyWithReload(() => import("./pages/CustomerChargeDetail"));
const Finance = lazyWithReload(() => import("./pages/Finance"));
const FinanceLayout = lazyWithReload(() => import("./pages/finance/FinanceLayout"));
const FinanceSummaryPage = lazyWithReload(() => import("./pages/finance/FinanceSummaryPage"));
const FinanceAccountsPage = lazyWithReload(() => import("./pages/finance/FinanceAccountsPage"));
const FinanceAccountDetailPage = lazyWithReload(() => import("./pages/finance/FinanceAccountDetailPage"));
const FinanceIncomesPage = lazyWithReload(() => import("./pages/finance/FinanceIncomesPage"));
const FinanceExpensesPage = lazyWithReload(() => import("./pages/finance/FinanceExpensesPage"));
const FinancePlaceholderPage = lazyWithReload(() => import("./pages/finance/FinancePlaceholderPage"));
const FinancialOverviewPage = lazyWithReload(() => import("./pages/finance/FinancialOverviewPage"));
const FinancialUnifiedAccountsPage = lazyWithReload(() => import("./pages/finance/FinancialUnifiedAccountsPage"));
const FinancialUnifiedAccountDetailPage = lazyWithReload(() => import("./pages/finance/FinancialUnifiedAccountDetailPage"));
const FinancialUnifiedTransactionsPage = lazyWithReload(() => import("./pages/finance/FinancialUnifiedTransactionsPage"));
const FinancialUnifiedExpensesPage = lazyWithReload(() => import("./pages/finance/FinancialUnifiedExpensesPage"));
const FinancialCategoriesPage = lazyWithReload(() => import("./pages/finance/FinancialCategoriesPage"));
const FinancialAccountsPayablePage = lazyWithReload(() => import("./pages/finance/FinancialAccountsPayablePage"));
const FinanceCreditCardsPage = lazyWithReload(() => import("./pages/finance/FinanceCreditCardsPage"));
const FinanceCreditCardDetailPage = lazyWithReload(() => import("./pages/finance/FinanceCreditCardDetailPage"));
const FinanceCreditCardStatementPage = lazyWithReload(() => import("./pages/finance/FinanceCreditCardStatementPage"));
const FinancialReportsPage = lazyWithReload(() => import("./pages/finance/FinancialReportsPage"));
const Settings = lazyWithReload(() => import("./pages/Settings"));
const SettingsIndex = lazyWithReload(() => import("./pages/settings/SettingsIndex"));
const SettingsSectionPage = lazyWithReload(() => import("./pages/settings/SettingsSectionPage"));
const PaymentsPanelPage = lazyWithReload(() => import("./pages/settings/PaymentsPanelPage"));
const GatewayConfigPage = lazyWithReload(() => import("./pages/settings/GatewayConfigPage"));
const Chat = lazyWithReload(() => loadChatPage('lazy'));
const ChatKanbanPage = lazyWithReload(() => import("./pages/ChatKanbanPage"));
const SuperAdminOpsKanbanPage = lazyWithReload(() => import("./pages/superadmin/SuperAdminOpsKanbanPage"));
const FunnelDetails = lazyWithReload(() => import("./pages/FunnelDetails"));
const ProposalDetails = lazyWithReload(() => import("./pages/ProposalDetails"));
const PublicStore = lazyWithReload(() => import("./pages/PublicStore").then(m => ({ default: m.PublicStore })));
const PublicProduct = lazyWithReload(() => import("./pages/PublicProduct").then(m => ({ default: m.PublicProduct })));
const StorePublicCheckout = lazyWithReload(() => import("./pages/StorePublicCheckout"));
const ProductForm = lazyWithReload(() => import("./pages/ProductForm"));
const Orders = lazyWithReload(() => import("./pages/Orders"));
const Tickets = lazyWithReload(() => import("./pages/Tickets"));
const TicketDetail = lazyWithReload(() => import("./pages/TicketDetail"));
const TicketsKanban = lazyWithReload(() => import("./pages/TicketsKanban"));
const NewTicket = lazyWithReload(() => import("./pages/NewTicket"));
const SuperAdminDashboard = lazyWithReload(() => import("./pages/superadmin/SuperAdminDashboard"));
const SuperAdminPlans = lazyWithReload(() => import("./pages/superadmin/SuperAdminPlans"));
const SuperAdminClients = lazyWithReload(() => import("./pages/superadmin/SuperAdminClients"));
const SuperAdminClientLayout = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientLayout"));
const SuperAdminClientResumo = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientResumo"));
const SuperAdminClientConfiguracoes = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientConfiguracoes"));
const SuperAdminClientFaturamento = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientFaturamento"));
const SuperAdminClientUsuarios = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientUsuarios"));
const SuperAdminClientPlaceholder = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientPlaceholder"));
const SuperAdminClientRecursos = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientRecursos"));
const SuperAdminClientLimites = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientLimites"));
const SuperAdminClientCommercial = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientCommercial"));
const SuperAdminClientObservacoes = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientObservacoes"));
const SuperAdminClientLogs = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientLogs"));
const SuperAdminClientNew = lazyWithReload(() => import("./pages/superadmin/SuperAdminClientNew"));
const SuperAdminFeatures = lazyWithReload(() => import("./pages/superadmin/SuperAdminFeatures"));
const SuperAdminPlanFeatures = lazyWithReload(() => import("./pages/superadmin/SuperAdminPlanFeatures"));
const SuperAdminTenantFeatures = lazyWithReload(() => import("./pages/superadmin/SuperAdminTenantFeatures"));
const SuperAdminAudit = lazyWithReload(() => import("./pages/superadmin/SuperAdminAudit"));
const SuperAdminReports = lazyWithReload(() => import("./pages/superadmin/SuperAdminReports"));
const SuperAdminUsers = lazyWithReload(() => import("./pages/superadmin/SuperAdminUsers"));
const SuperAdminNotifications = lazyWithReload(() => import("./pages/superadmin/SuperAdminNotifications"));
const SuperAdminPagamentos = lazyWithReload(() => import("./pages/superadmin/SuperAdminPagamentos"));
const SuperAdminNotificationsEngineSettings = lazyWithReload(() => import("./pages/superadmin/SuperAdminNotificationsEngineSettings"));
const SuperAdminCrmNotificationTemplates = lazyWithReload(() => import("./pages/superadmin/SuperAdminCrmNotificationTemplates"));
const SuperAdminPlatformNotifications = lazyWithReload(() => import("./pages/superadmin/SuperAdminPlatformNotifications"));
const SuperAdminPlatformBillings = lazyWithReload(() => import("./pages/superadmin/SuperAdminPlatformBillings"));
const PublicSaasBillingPay = lazyWithReload(() => import("./pages/PublicSaasBillingPay"));
const SuperAdminSubscriptionCyclesSettings = lazyWithReload(() => import("./pages/superadmin/SuperAdminSubscriptionCyclesSettings"));
const SuperAdminBillingOperations = lazyWithReload(() => import("./pages/superadmin/SuperAdminBillingOperations"));
const LifecycleDashboard = lazyWithReload(() => import("./pages/superadmin/LifecycleDashboard"));
const SuperAdminAnnouncements = lazyWithReload(() => import("./pages/superadmin/SuperAdminAnnouncements"));
const SuperAdminAnnouncementEditor = lazyWithReload(() => import("./pages/superadmin/SuperAdminAnnouncementEditor"));
const SuperAdminAnnouncementSend = lazyWithReload(() => import("./pages/superadmin/SuperAdminAnnouncementSend"));
const SuperAdminAnnouncementSends = lazyWithReload(() => import("./pages/superadmin/SuperAdminAnnouncementSends"));
const SuperAdminAnnouncementSendDetail = lazyWithReload(() => import("./pages/superadmin/SuperAdminAnnouncementSendDetail"));
const SuperAdminAnnouncementGroups = lazyWithReload(() => import("./pages/superadmin/SuperAdminAnnouncementGroups"));
const SuperAdminLeads = lazyWithReload(() => import("./pages/superadmin/SuperAdminLeads"));
const SuperAdminLeadGroups = lazyWithReload(() => import("./pages/superadmin/SuperAdminLeadGroups"));
const ConnectionsPage = lazyWithReload(() => import("./pages/superadmin/connections/ConnectionsPage"));
const WhatsappOfficialConnectionPage = lazyWithReload(() => import("./pages/superadmin/connections/WhatsappOfficialConnectionPage"));
const WhatsappOfficialModelosPage = lazyWithReload(() => import("./pages/superadmin/connections/WhatsappOfficialModelosPage"));
const UazapiConnectionPage = lazyWithReload(() => import("./pages/superadmin/connections/UazapiConnectionPage"));
const WhatsappOfficialChatFull = lazyWithReload(() => import("./pages/superadmin/connections/WhatsappOfficialChatFull"));
const SuperAdminLegalPages = lazyWithReload(() => import("./pages/superadmin/SuperAdminLegalPages"));
const SuperAdminHubPage = lazyWithReload(() => import("./pages/superadmin/SuperAdminHubPage"));
const SuperAdminSmtpSettings = lazyWithReload(() => import("./pages/superadmin/SuperAdminSmtpSettings"));
const SuperAdminTrackingSettings = lazyWithReload(() => import("./pages/superadmin/SuperAdminTrackingSettings"));
const SignupSuccess = lazyWithReload(() => import("./pages/SignupSuccess"));
const SuperAdminAdvancedScriptsPage = lazyWithReload(() => import("./pages/superadmin/SuperAdminAdvancedScriptsPage"));
const SuperAdminAdvancedFeatureFlagsPage = lazyWithReload(() => import("./pages/superadmin/SuperAdminAdvancedFeatureFlagsPage"));
const PublicPrivacyPolicyPage = lazyWithReload(() =>
  import("./pages/legal/PublicLegalPage").then((m) => ({ default: m.PublicPrivacyPolicyPage })),
);
const PublicTermsOfServicePage = lazyWithReload(() =>
  import("./pages/legal/PublicLegalPage").then((m) => ({ default: m.PublicTermsOfServicePage })),
);
const UpdatesPage = lazyWithReload(() => import("./pages/UpdatesPage"));
const UpdateDetailPage = lazyWithReload(() => import("./pages/UpdateDetailPage"));

const Profile = lazyWithReload(() => import("./pages/Profile"));
const MeuPlano = lazyWithReload(() => import("./pages/MeuPlano"));
const InternalBillingCheckout = lazyWithReload(() => import("./pages/InternalBillingCheckout"));
const PlanCheckout = lazyWithReload(() => import("./pages/PlanCheckout"));
const Onboarding = lazyWithReload(() => import("./pages/Onboarding"));
const PlatformSupport = lazyWithReload(() => import("./pages/PlatformSupport"));
const SuperAdminPlatformSupport = lazyWithReload(() => import("./pages/superadmin/SuperAdminPlatformSupport"));
const SuperAdminPlatformSupportTicketDetail = lazyWithReload(
  () => import("./pages/superadmin/SuperAdminPlatformSupportTicketDetail"),
);

const LandingPage = lazyWithReload(() => import("./landingpage").then(m => ({ default: m.LandingPage })));

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <ThemeProvider>
        <AuthProvider>
          <ChatQueryPersistBridge />
          <ChatRouteTimingListener />
          <ModulePermissionsProvider>
          <MetaPixelTrackingBridge />
          <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomeOrRedirect />} />
            <Route path="/landing" element={<Suspense fallback={<LoadingFallback />}><LandingPage /></Suspense>} />
            <Route path="/landingpage" element={<Navigate to="/" replace />} />
            
            {/* Alterado: a página de registro não precisa de AuthGuard */}
            <Route
              path="/register"
              element={
                <AuthLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <Register />
                  </Suspense>
                </AuthLayout>
              }
            />

            <Route
              path="/teste-gratis"
              element={
                <AuthLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <TesteGratis />
                  </Suspense>
                </AuthLayout>
              }
            />

            <Route
              path="/cadastro"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <AcquisitionSignupFlow />
                </Suspense>
              }
            />

            <Route
              path="/onboarding/acquisition"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <AcquisitionOperationalOnboarding />
                </Suspense>
              }
            />

            <Route
              path="/ativacao/checkout"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <AcquisitionPremiumCheckout />
                </Suspense>
              }
            />

            <Route
              path="/onboarding/kickoff"
              element={
                <AuthLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <OnboardingKickoffPlaceholder />
                  </Suspense>
                </AuthLayout>
              }
            />
            
            <Route
              path="/register/steps"
              element={
                <AuthGuard requireAuth={true} requireComplete={false} redirectTo="/login">
                  <AuthLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <RegistrationSteps />
                    </Suspense>
                  </AuthLayout>
                </AuthGuard>
              }
            />
            <Route
              path="/login"
              element={
                <AuthLayout>
                  <Suspense fallback={<LoadingFallback />}>
                    <AuthWhatsApp />
                  </Suspense>
                </AuthLayout>
              }
            />
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
            <Route
              path="/signup-success"
              element={
                <AuthGuard requireAuth={true} requireComplete={false} redirectTo="/login">
                  <Suspense fallback={<LoadingFallback />}>
                    <SignupSuccess />
                  </Suspense>
                </AuthGuard>
              }
            />
            <Route
              path="/suporte"
              element={
                <AuthGuard requireAuth={true} redirectTo="/login?redirect=%2Fsuporte">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <PlatformSupport />
                    </Suspense>
                  </AppLayout>
                </AuthGuard>
              }
            />
            <Route
              path="/suporte/:id"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <SuportePublicOrPlatformTicket />
                </Suspense>
              }
            />
            <Route path="/onboarding" element={<Suspense fallback={<LoadingFallback />}><Onboarding /></Suspense>} />
            <Route path="/pay/:token" element={<Suspense fallback={<LoadingFallback />}><CustomerInvoicePay /></Suspense>} />
            <Route path="/saas-pay/:token" element={<Suspense fallback={<LoadingFallback />}><PublicSaasBillingPay /></Suspense>} />
            <Route path="/contract-view/:token" element={<Suspense fallback={<LoadingFallback />}><PublicContractView /></Suspense>} />
            <Route path="/proposal-view/:token" element={<Suspense fallback={<LoadingFallback />}><PublicProposalView /></Suspense>} />
            <Route path="/ticket/:token" element={<Suspense fallback={<LoadingFallback />}><PublicTicketView /></Suspense>} />
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
            <Route path="/projetos/:projectId" element={
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
            <Route path="/projetos/:projectId/area/:areaId" element={
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
                    <Suspense fallback={<ChatRouteFallback />}>
                      <Chat />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/chat" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<ChatRouteFallback />}>
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
                  <SettingsIndex />
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
              <Route path=":sectionSlug" element={
                <Suspense fallback={<LoadingFallback />}>
                  <SettingsSectionPage />
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
            <Route path="/support/tickets/kanban" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <TicketsKanban />
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
                <Route path="chat" element={<Suspense fallback={<LoadingFallback />}><Chat scope="platform" /></Suspense>} />
                <Route path="chat/:conversationId" element={<Suspense fallback={<LoadingFallback />}><Chat scope="platform" /></Suspense>} />
                <Route
                  path="operacao/kanbans"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <SuperAdminOpsKanbanPage />
                    </Suspense>
                  }
                />
                <Route
                  path="operacoes/lifecycle"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <LifecycleDashboard />
                    </Suspense>
                  }
                />
                <Route path="conexoes" element={<Suspense fallback={<LoadingFallback />}><ConnectionsPage /></Suspense>} />
                <Route path="conexoes/whatsapp-oficial" element={<Suspense fallback={<LoadingFallback />}><WhatsappOfficialConnectionPage /></Suspense>} />
                <Route path="conexoes/whatsapp-oficial/modelos" element={<Suspense fallback={<LoadingFallback />}><WhatsappOfficialModelosPage /></Suspense>} />
                <Route path="conexoes/whatsapp-oficial/chat" element={<Suspense fallback={<LoadingFallback />}><WhatsappOfficialChatFull /></Suspense>} />
                <Route path="conexoes/whatsapp-official" element={<SuperadminLegacyWhatsappOfficialRedirect />} />
                <Route path="conexoes/whatsapp-official/modelos" element={<SuperadminLegacyWhatsappOfficialRedirect />} />
                <Route path="conexoes/whatsapp-official/chat" element={<SuperadminLegacyWhatsappOfficialRedirect />} />
                <Route path="conexoes/uazapi" element={<Suspense fallback={<LoadingFallback />}><UazapiConnectionPage /></Suspense>} />
                <Route path="plataforma" element={<Suspense fallback={<LoadingFallback />}><SuperAdminHubPage /></Suspense>} />
                <Route
                  path="plataforma/signup-acquisition"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <SuperAdminSignupAcquisitionPage />
                    </Suspense>
                  }
                />
                <Route path="avancado" element={<Suspense fallback={<LoadingFallback />}><SuperAdminHubPage /></Suspense>} />
                <Route path="avancado/scripts" element={<Suspense fallback={<LoadingFallback />}><SuperAdminAdvancedScriptsPage /></Suspense>} />
                <Route path="avancado/feature-flags" element={<Suspense fallback={<LoadingFallback />}><SuperAdminAdvancedFeatureFlagsPage /></Suspense>} />
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
                  <Route path="comercial" element={<SuperAdminClientCommercial />} />
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
                <Route path="billing/operations" element={<Suspense fallback={<LoadingFallback />}><SuperAdminBillingOperations /></Suspense>} />
                <Route path="platform-notifications" element={<Suspense fallback={<LoadingFallback />}><SuperAdminPlatformNotifications /></Suspense>} />
                <Route path="smtp" element={<Suspense fallback={<LoadingFallback />}><SuperAdminSmtpSettings /></Suspense>} />
                <Route
                  path="marketing/tracking"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <SuperAdminTrackingSettings />
                    </Suspense>
                  }
                />
                <Route
                  path="platform-support"
                  element={<Suspense fallback={<LoadingFallback />}><SuperAdminPlatformSupport /></Suspense>}
                />
                <Route
                  path="platform-support/tickets/:id"
                  element={
                    <Suspense fallback={<LoadingFallback />}>
                      <SuperAdminPlatformSupportTicketDetail />
                    </Suspense>
                  }
                />
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
            
            <Route
              path="*"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <NotFound />
                </Suspense>
              }
            />
          </Routes>
          </Suspense>
          <EntityDrawerContainer />
          </ModulePermissionsProvider>
        </AuthProvider>
        <Toaster />
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
