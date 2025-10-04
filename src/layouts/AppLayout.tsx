
import React, { useState, useEffect } from 'react';
import { useLocation, NavLink, useNavigate } from 'react-router-dom';
import { Bell, User, LayoutDashboard, Users, List, Calendar, Briefcase, FileText, FileSearch, DollarSign, Settings, UserPlus, ClipboardCheck, MessageSquare, LogOut, Search } from 'lucide-react';
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
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from '@/integrations/supabase/client';

interface AppLayoutProps {
  children: React.ReactNode;
}

const Nav = () => {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  
  const getNavClass = ({ isActive }: { isActive: boolean }) => 
    isActive ? "bg-crm-primary/10 text-crm-primary font-medium" : "hover:bg-muted/50";

  return (
    <Sidebar collapsible="icon" className={collapsed ? "w-16 transition-all duration-300" : "w-64 transition-all duration-300"}>
      <SidebarTrigger className="m-2 self-end" />
      
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-start px-4'} pb-2 mb-6`}>
        {collapsed ? (
          <div className="w-8 h-8 rounded-md bg-crm-primary text-white flex items-center justify-center font-bold">M</div>
        ) : (
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-md bg-crm-primary text-white flex items-center justify-center font-bold mr-3">M</div>
            <h1 className="text-lg font-bold">MultiCRM</h1>
          </div>
        )}
      </div>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink to="/dashboard" className={getNavClass}>
                  <LayoutDashboard className="mr-2 h-5 w-5" />
                  {!collapsed && <span>Dashboard</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Vendas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/clients" className={getNavClass}>
                    <Users className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Clientes</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/leads" className={getNavClass}>
                    <UserPlus className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Leads</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/funnel" className={getNavClass}>
                    <List className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Funil de Vendas</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/products" className={getNavClass}>
                    <Briefcase className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Produtos</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Projetos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/projects" className={getNavClass}>
                    <Calendar className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Projetos</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/tasks" className={getNavClass}>
                    <ClipboardCheck className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Tarefas</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Atendimento</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/chat" className={getNavClass}>
                    <MessageSquare className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Chat</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Documentação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/proposals" className={getNavClass}>
                    <FileText className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Propostas</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/contracts" className={getNavClass}>
                    <FileSearch className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Contratos</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>Financeiro</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/billing" className={getNavClass}>
                    <DollarSign className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Faturamento</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/finance" className={getNavClass}>
                    <DollarSign className="mr-2 h-5 w-5" />
                    {!collapsed && <span>Financeiro</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink to="/settings" className={getNavClass}>
                  <Settings className="mr-2 h-5 w-5" />
                  {!collapsed && <span>Configurações</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

const Header = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchGlobal = async () => {
      try {
        const searchTerm = `%${searchQuery}%`;
        
        const [clients, leads, contracts, products] = await Promise.all([
          supabase
            .from('clients')
            .select('id, name, email, company')
            .eq('user_id', user?.id)
            .or(`name.ilike.${searchTerm},email.ilike.${searchTerm},company.ilike.${searchTerm}`)
            .limit(5),
          supabase
            .from('leads')
            .select('id, name, email, company')
            .eq('user_id', user?.id)
            .or(`name.ilike.${searchTerm},email.ilike.${searchTerm},company.ilike.${searchTerm}`)
            .limit(5),
          supabase
            .from('contracts')
            .select('id, title, contract_number')
            .eq('user_id', user?.id)
            .or(`title.ilike.${searchTerm},contract_number.ilike.${searchTerm}`)
            .limit(5),
          supabase
            .from('products')
            .select('id, name, description')
            .eq('user_id', user?.id)
            .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
            .limit(5),
        ]);

        const results = [
          ...(clients.data || []).map(item => ({ ...item, type: 'Cliente', route: `/clients` })),
          ...(leads.data || []).map(item => ({ ...item, type: 'Lead', route: `/leads` })),
          ...(contracts.data || []).map(item => ({ ...item, type: 'Contrato', route: `/contracts/${item.id}` })),
          ...(products.data || []).map(item => ({ ...item, type: 'Produto', route: `/products` })),
        ];

        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
      }
    };

    const debounceTimer = setTimeout(searchGlobal, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, user?.id]);

  const handleSelect = (route: string) => {
    setSearchOpen(false);
    navigate(route);
  };

  return (
    <header className="h-16 border-b flex items-center justify-between px-4">
      <div className="flex items-center flex-1 max-w-xl">
        <Button
          variant="outline"
          className="relative w-full justify-start text-sm text-muted-foreground"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="mr-2 h-4 w-4" />
          <span>Buscar clientes, contratos, produtos...</span>
          <kbd className="pointer-events-none absolute right-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput 
          placeholder="Digite para buscar..." 
          value={searchQuery}
          onValueChange={setSearchQuery}
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
      <div className="flex h-screen w-full overflow-hidden">
        <Nav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
