import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Leads from "./pages/Leads";
import Funnel from "./pages/Funnel";
import Tasks from "./pages/Tasks";
import Projects from "./pages/Projects";
import Products from "./pages/Products";
import Proposals from "./pages/Proposals";
import Contracts from "./pages/Contracts";
import Billing from "./pages/Billing";
import Finance from "./pages/Finance";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import AppLayout from "./layouts/AppLayout";
import AuthLayout from "./layouts/AuthLayout";
import AuthWhatsApp from "./pages/AuthWhatsApp";
import RegistrationSteps from "./pages/Registration/RegistrationSteps";
import AuthGuard from "./components/AuthGuard";
import FunnelDetails from "./pages/FunnelDetails";
import ProposalDetails from "./pages/ProposalDetails";
import { PublicStore } from "./pages/PublicStore";
import { PublicProduct } from "./pages/PublicProduct";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <Toaster />
          <Sonner />
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
            
            {/* Protected routes */}
            <Route path="/dashboard" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Dashboard /></AppLayout>
              </AuthGuard>
            } />
            
            <Route path="/clients" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Clients /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/leads" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Leads /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/funnel" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Funnel /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/funnel/:funnelId" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><FunnelDetails /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/funnel/:funnelId/stage/:stageId/proposal/:proposalId" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><ProposalDetails /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/projects" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Projects /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/tasks" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Tasks /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/products" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Products /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/proposals" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Proposals /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/contracts" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Contracts /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/billing" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Billing /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/finance" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Finance /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/chat" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Chat /></AppLayout>
              </AuthGuard>
            } />
            <Route path="/settings" element={
              <AuthGuard requireAuth={true} redirectTo="/">
                <AppLayout><Settings /></AppLayout>
              </AuthGuard>
            } />
            
            {/* Public store routes */}
            <Route path="/:storeSlug/loja" element={<PublicStore />} />
            <Route path="/:storeSlug/loja/produto/:productId" element={<PublicProduct />} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
