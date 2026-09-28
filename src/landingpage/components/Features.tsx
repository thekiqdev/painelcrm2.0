import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3.js";
import Bell from "lucide-react/dist/esm/icons/bell.js";
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days.js";
import CheckSquare from "lucide-react/dist/esm/icons/check-square.js";
import Cloud from "lucide-react/dist/esm/icons/cloud.js";
import FileSignature from "lucide-react/dist/esm/icons/file-signature.js";
import FileText from "lucide-react/dist/esm/icons/file-text.js";
import FolderKanban from "lucide-react/dist/esm/icons/folder-kanban.js";
import GitBranch from "lucide-react/dist/esm/icons/git-branch.js";
import Headphones from "lucide-react/dist/esm/icons/headphones.js";
import Kanban from "lucide-react/dist/esm/icons/kanban.js";
import Landmark from "lucide-react/dist/esm/icons/landmark.js";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard.js";
import LayoutTemplate from "lucide-react/dist/esm/icons/layout-template.js";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle.js";
import Package from "lucide-react/dist/esm/icons/package.js";
import Receipt from "lucide-react/dist/esm/icons/receipt.js";
import Settings from "lucide-react/dist/esm/icons/settings.js";
import Smartphone from "lucide-react/dist/esm/icons/smartphone.js";
import Target from "lucide-react/dist/esm/icons/target.js";
import TrendingDown from "lucide-react/dist/esm/icons/trending-down.js";
import UserCog from "lucide-react/dist/esm/icons/user-cog.js";
import Users from "lucide-react/dist/esm/icons/users.js";
import Wallet from "lucide-react/dist/esm/icons/wallet.js";

const categories = [
  {
    title: "Vendas e CRM",
    items: [
      { icon: Target, name: "Leads", desc: "Captação, qualificação e pipeline de leads." },
      { icon: Users, name: "Clientes", desc: "Cadastro, histórico e segmentação." },
      { icon: GitBranch, name: "Funil de vendas", desc: "Múltiplos funis e etapas configuráveis." },
      { icon: FileText, name: "Propostas", desc: "Criação e envio de propostas profissionais." },
      { icon: FileSignature, name: "Contratos", desc: "Gestão do ciclo completo de contratos." },
      { icon: Package, name: "Loja e produtos", desc: "Catálogo, vitrine pública e pedidos." },
    ],
  },
  {
    title: "Operação e entrega",
    items: [
      { icon: FolderKanban, name: "Projetos", desc: "Etapas, entregas e acompanhamento." },
      { icon: CheckSquare, name: "Tarefas", desc: "Prazos, lembretes e atribuições." },
      { icon: Headphones, name: "Tickets", desc: "Atendimento e suporte integrados." },
      { icon: CalendarDays, name: "Agenda", desc: "Compromissos, lembretes e confirmações." },
    ],
  },
  {
    title: "Comunicação",
    items: [
      { icon: MessageCircle, name: "Chat / WhatsApp", desc: "Conversas integradas ao CRM." },
      { icon: Smartphone, name: "WhatsApp API", desc: "Conecte múltiplas instâncias." },
      { icon: LayoutTemplate, name: "Templates", desc: "Modelos para e-mail e WhatsApp." },
      { icon: Cloud, name: "WhatsApp Cloud (Meta)", desc: "API oficial, templates e campanhas." },
      { icon: Kanban, name: "Kanban de chat", desc: "Organize atendimentos em colunas." },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { icon: Receipt, name: "Faturas", desc: "Emissão e controle de faturas." },
      { icon: Wallet, name: "Contas a pagar", desc: "Fornecedores, vencimentos e despesas recorrentes." },
      { icon: TrendingDown, name: "Despesas", desc: "Registro e controle financeiro." },
      { icon: BarChart3, name: "Relatórios", desc: "Indicadores de desempenho." },
      { icon: Landmark, name: "Cobrança online", desc: "Gateways, boletos e links de pagamento." },
    ],
  },
];

const extras = [
  { icon: LayoutDashboard, name: "Dashboard", desc: "Visão geral e KPIs." },
  { icon: Settings, name: "Configurações", desc: "Preferências, logo e idioma." },
  { icon: UserCog, name: "Perfis", desc: "Permissões por usuário." },
  { icon: Bell, name: "Notificações", desc: "Alertas em tempo real no painel." },
];

const Features = () => {
  return (
    <section id="recursos" className="relative py-24">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="container relative mx-auto px-4 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Tudo que sua equipe precisa para{" "}
            <span className="text-gradient">vender e entregar</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Uma plataforma, todos os processos — do primeiro contato ao faturamento.
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-2">
          {categories.map((cat) => (
            <div key={cat.title}>
              <h3 className="mb-4 font-display text-lg font-semibold text-foreground">{cat.title}</h3>
              <div className="grid gap-3">
                {cat.items.map((item) => (
                  <div
                    key={item.name}
                    className="group flex items-start gap-4 rounded-lg border border-border/50 bg-card/50 p-4 transition-all hover:border-primary/30 hover:bg-card hover:glow-primary"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <item.icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{item.name}</h4>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {extras.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-4 transition-all hover:border-primary/30"
            >
              <item.icon size={18} className="shrink-0 text-primary" />
              <div>
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="ml-2 text-sm text-muted-foreground">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
