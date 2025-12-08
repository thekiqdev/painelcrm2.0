import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import AuthLayout from "./layouts/AuthLayout";
import AuthWhatsApp from "./pages/AuthWhatsApp";
import Register from "./pages/Register";
import RegistrationSteps from "./pages/Registration/RegistrationSteps";
import AuthGuard from "./components/AuthGuard";
import AppLayout from "./layouts/AppLayout";
import NotFound from "./pages/NotFound";

// Lazy load todas as rotas protegidas para otimizar carregamento inicial
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientProfile = lazy(() => import("./pages/ClientProfile"));
const Leads = lazy(() => import("./pages/Leads"));
const Funnel = lazy(() => import("./pages/Funnel"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectTemplates = lazy(() => import("./pages/ProjectTemplates"));
const Products = lazy(() => import("./pages/Products"));
const Proposals = lazy(() => import("./pages/Proposals"));
const Contracts = lazy(() => import("./pages/Contracts"));
const NewContract = lazy(() => import("./pages/NewContract"));
const ContractDetails = lazy(() => import("./pages/ContractDetails"));
const Billing = lazy(() => import("./pages/Billing"));
const Finance = lazy(() => import("./pages/Finance"));
const Settings = lazy(() => import("./pages/Settings"));
const Chat = lazy(() => import("./pages/Chat"));
const FunnelDetails = lazy(() => import("./pages/FunnelDetails"));
const ProposalDetails = lazy(() => import("./pages/ProposalDetails"));
const PublicStore = lazy(() => import("./pages/PublicStore").then(m => ({ default: m.PublicStore })));
const PublicProduct = lazy(() => import("./pages/PublicProduct").then(m => ({ default: m.PublicProduct })));
const ProductForm = lazy(() => import("./pages/ProductForm"));
const Orders = lazy(() => import("./pages/Orders"));
const Tickets = lazy(() => import("./pages/Tickets"));
const NewTicket = lazy(() => import("./pages/NewTicket"));

// Loading fallback simples
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-crm-primary"></div>
      <p className="mt-4 text-muted-foreground">Carregando...</p>
    </div>
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<AuthWhatsApp />} />
            
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
            <Route path="/tasks" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Tasks />
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
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Billing />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            <Route path="/finance" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <Finance />
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
                    <Suspense fallback={<LoadingFallback />}>
                      <Settings />
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
            <Route path="/support/tickets/new" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                  <AppLayout>
                    <Suspense fallback={<LoadingFallback />}>
                      <NewTicket />
                    </Suspense>
                  </AppLayout>
              </AuthGuard>
            } />
            
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
            
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
