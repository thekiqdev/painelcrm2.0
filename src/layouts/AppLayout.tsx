
import React, { useState, useEffect } from 'react';
import { useLocation, NavLink, useNavigate } from 'react-router-dom';
import { Bell, User, LayoutDashboard, Users, List, Calendar, Briefcase, FileText, FileSearch, DollarSign, Settings, UserPlus, ClipboardCheck, MessageSquare, LogOut, Search, LayoutTemplate, Ticket, ShieldCheck, CreditCard } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarProvider,
  useSidebar
} from "@/components/ui/sidebar";
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { searchService } from '@/services/search';
import { Logo } from '@/components/Logo';
import { RequireModuleView } from '@/components/RequireModuleView';
import { routePreload } from '@/routePreload';

interface AppLayoutProps {
  children: React.ReactNode;
}

// Prefetch dos chunks das rotas mais usadas após o layout carregar (evita espera no primeiro clique)
const usePrefetchRoutes = () => {
  useEffect(() => {
    const t = setTimeout(() => {
      routePreload.dashboard();
      routePreload.clients();
      routePreload.tasks();
      routePreload.projects();
      routePreload.products();
    }, 1500);
    return () => clearTimeout(t);
  }, []);
};

const Nav = () => {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { canView } = useModulePermissions();
  usePrefetchRoutes();
  const hasDashboard = useFeatureFlag('dashboard');
  const hasClients = useFeatureFlag('clients');
  const hasLeads = useFeatureFlag('leads');
  const hasFunnels = useFeatureFlag('funnels');
  const hasProducts = useFeatureFlag('products');
  const hasProjects = useFeatureFlag('projects');
  const hasTasks = useFeatureFlag('tasks');
  const hasChat = useFeatureFlag('chat');
  const hasTickets = useFeatureFlag('tickets');
  const hasProposals = useFeatureFlag('proposals');
  const hasContracts = useFeatureFlag('contracts');
  const hasInvoices = useFeatureFlag('invoices');
  const hasExpenses = useFeatureFlag('expenses');
  const hasSettings = useFeatureFlag('settings');

  const show = (feature: boolean, moduleId: string) => feature && canView(moduleId);

  const getNavClass = ({ isActive }: { isActive: boolean }) => 
    isActive ? "bg-crm-primary/10 text-crm-primary font-medium" : "hover:bg-muted/50";

  return (
    <Sidebar collapsible="icon" className={collapsed ? "w-16 transition-all duration-300" : "w-64 transition-all duration-300"}>
      <SidebarTrigger className="m-2 self-end" />
      
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-start px-4'} pb-2 mb-6`}>
        {collapsed ? (
          <Logo size="sm" variant="crm" />
        ) : (
          <div className="flex items-center">
            <Logo size="sm" variant="crm" className="mr-3" />
            <h1 className="text-lg font-bold">PainelCRM</h1>
          </div>
        )}
      </div>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {show(hasDashboard, 'dashboard') && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/dashboard" className={getNavClass} onMouseEnter={() => routePreload.dashboard()}>
                    <LayoutDashboard className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Vendas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {show(hasClients, 'clients') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/clients" className={getNavClass} onMouseEnter={() => routePreload.clients()}>
                      <Users className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Clientes</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {show(hasLeads, 'leads') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/leads" className={getNavClass} onMouseEnter={() => routePreload.leads()}>
                      <UserPlus className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Leads</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {show(hasFunnels, 'funnels') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/funnel" className={getNavClass} onMouseEnter={() => routePreload.funnel()}>
                      <List className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Funil de Vendas</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {show(hasProducts, 'products') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/products" className={getNavClass} onMouseEnter={() => routePreload.products()}>
                      <Briefcase className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Produtos</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Projetos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {show(hasProjects, 'projects') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/projects" className={getNavClass} onMouseEnter={() => routePreload.projects()}>
                      <Calendar className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Projetos</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {show(hasTasks, 'tasks') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/tasks" className={getNavClass} onMouseEnter={() => routePreload.tasks()}>
                      <ClipboardCheck className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Tarefas</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {show(hasTasks, 'project_templates') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/project-templates" className={getNavClass} onMouseEnter={() => routePreload.projectTemplates()}>
                      <LayoutTemplate className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Templates</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Atendimento</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {show(hasChat, 'chat') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/chat" className={getNavClass} onMouseEnter={() => routePreload.chat()}>
                      <MessageSquare className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Chat</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {show(hasTickets, 'tickets') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/support/tickets" className={getNavClass} onMouseEnter={() => routePreload.tickets()}>
                      <Ticket className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Tickets</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Documentação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {show(hasProposals, 'proposals') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/proposals" className={getNavClass} onMouseEnter={() => routePreload.proposals()}>
                      <FileText className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Propostas</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {show(hasContracts, 'contracts') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/contracts" className={getNavClass} onMouseEnter={() => routePreload.contracts()}>
                      <FileSearch className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Contratos</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Financeiro</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {show(hasInvoices, 'billing') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/billing" className={getNavClass} onMouseEnter={() => routePreload.billing()}>
                      <DollarSign className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Faturamento</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {show(hasExpenses, 'finance') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/finance" className={getNavClass} onMouseEnter={() => routePreload.finance()}>
                      <DollarSign className="mr-2 h-5 w-5" />
                      {!collapsed && <span>Financeiro</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarMenu>
            {show(hasSettings, 'settings') && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/settings" className={getNavClass} onMouseEnter={() => routePreload.settings()}>
                    <Settings className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Configurações</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

const Header = () => {
  const { user, profile, signOut } = useAuth();
  const { canView } = useModulePermissions();
  const navigate = useNavigate();
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [commandSearchQuery, setCommandSearchQuery] = useState('');

  const initials = profile ? 
    (profile.first_name?.charAt(0) || '') + (profile.last_name?.charAt(0) || '') : 
    'U';
  
  const displayName = profile ? 
    `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 
    'Usuário';

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandDialogOpen(true);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Search for live input
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setPopoverOpen(false);
      return;
    }

    setPopoverOpen(true);

    const searchGlobal = async () => {
      try {
        const results = await searchService.search(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
      }
    };

    const debounceTimer = setTimeout(searchGlobal, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, user?.id]);

  // Search for command dialog
  useEffect(() => {
    if (commandSearchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchGlobal = async () => {
      try {
        const results = await searchService.search(commandSearchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
      }
    };

    const debounceTimer = setTimeout(searchGlobal, 300);
    return () => clearTimeout(debounceTimer);
  }, [commandSearchQuery, user?.id]);

  const handleSelect = (route: string) => {
    setPopoverOpen(false);
    setCommandDialogOpen(false);
    setSearchQuery('');
    setCommandSearchQuery('');
    navigate(route);
  };

  return (
    <header className="h-16 border-b flex items-center justify-between px-4">
      <div className="flex items-center flex-1 max-w-xl">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar clientes, contratos, produtos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-16"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command>
              <CommandList>
                <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
                {searchResults.length > 0 && (
                  <CommandGroup heading="Resultados">
                    {searchResults.map((result, index) => (
                      <CommandItem
                        key={`${result.type}-${result.id}-${index}`}
                        onSelect={() => handleSelect(result.route)}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{result.name || result.title}</span>
                            <span className="text-xs text-muted-foreground">({result.type})</span>
                          </div>
                          {(result.email || result.company || result.contract_number) && (
                            <span className="text-xs text-muted-foreground">
                              {result.email || result.company || result.contract_number}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <CommandDialog open={commandDialogOpen} onOpenChange={setCommandDialogOpen}>
        <CommandInput 
          placeholder="Digite para buscar..." 
          value={commandSearchQuery}
          onValueChange={setCommandSearchQuery}
        />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          {searchResults.length > 0 && (
            <CommandGroup heading="Resultados">
              {searchResults.map((result, index) => (
                <CommandItem
                  key={`${result.type}-${result.id}-${index}`}
                  onSelect={() => handleSelect(result.route)}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{result.name || result.title}</span>
                      <span className="text-xs text-muted-foreground">({result.type})</span>
                    </div>
                    {(result.email || result.company || result.contract_number) && (
                      <span className="text-xs text-muted-foreground">
                        {result.email || result.company || result.contract_number}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
      
      <div className="flex items-center space-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center bg-red-500 text-white text-xs">3</Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notificações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-96 overflow-y-auto">
              {[1, 2, 3].map(i => (
                <DropdownMenuItem key={i} className="py-3">
                  <div>
                    <p className="text-sm font-medium">Nova tarefa atribuída</p>
                    <p className="text-xs text-muted-foreground">Reunião com cliente XYZ às 15:00</p>
                    <p className="text-xs text-muted-foreground mt-1">Há 5 minutos</p>
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <div className="bg-crm-primary text-white h-full w-full flex items-center justify-center font-medium">
                  {initials || 'U'}
                </div>
              </Avatar>
              <span className="hidden md:inline font-medium">{displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              <span>Perfil</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Configurações</span>
            </DropdownMenuItem>
            {user?.can_manage_plan && canView('meu_plano') && (
              <DropdownMenuItem onClick={() => navigate('/meu-plano')}>
                <CreditCard className="mr-2 h-4 w-4" />
                <span>Planos</span>
              </DropdownMenuItem>
            )}
            {user?.is_super_admin && (
              <DropdownMenuItem onClick={() => navigate('/superadmin')}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                <span>Super Admin</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sair</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Nav />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 min-h-0 p-6">
            <RequireModuleView>{children}</RequireModuleView>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
