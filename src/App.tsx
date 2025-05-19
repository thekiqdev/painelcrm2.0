
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Leads from "./pages/Leads";
import Funnel from "./pages/Funnel";
import Tasks from "./pages/Tasks";
import Products from "./pages/Products";
import Proposals from "./pages/Proposals";
import Contracts from "./pages/Contracts";
import Billing from "./pages/Billing";
import Finance from "./pages/Finance";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AppLayout from "./layouts/AppLayout";
import AuthLayout from "./layouts/AuthLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<AuthLayout><Login /></AuthLayout>} />
          <Route path="/register" element={<AuthLayout><Register /></AuthLayout>} />
          <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
          <Route path="/clients" element={<AppLayout><Clients /></AppLayout>} />
          <Route path="/leads" element={<AppLayout><Leads /></AppLayout>} />
          <Route path="/funnel" element={<AppLayout><Funnel /></AppLayout>} />
          <Route path="/tasks" element={<AppLayout><Tasks /></AppLayout>} />
          <Route path="/products" element={<AppLayout><Products /></AppLayout>} />
          <Route path="/proposals" element={<AppLayout><Proposals /></AppLayout>} />
          <Route path="/contracts" element={<AppLayout><Contracts /></AppLayout>} />
          <Route path="/billing" element={<AppLayout><Billing /></AppLayout>} />
          <Route path="/finance" element={<AppLayout><Finance /></AppLayout>} />
          <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
