import {
  Bell,
  Kanban as KanbanIcon,
  LayoutDashboard,
  MessageSquare,
  Search,
  Settings,
  Wallet,
} from "lucide-react";
import { AutomationToast } from "./AutomationToast";
import { FloatingChatPreview } from "./FloatingChatPreview";
import { KanbanPreview } from "./KanbanPreview";
import {
  getCardColumn,
  getDealBadges,
  getGlowColumn,
} from "./heroMockupState";

type DesktopCrmMockupProps = {
  phase: number;
};

export function DesktopCrmMockup({ phase }: DesktopCrmMockupProps) {
  const cardColumn = getCardColumn(phase);
  const glowColumn = getGlowColumn(phase);
  const badges = getDealBadges(phase);
  const showPulse = phase === 0;
  const showFinanceToast = phase === 3;
  const showProposalToast = phase === 2;
  const showNewToast = phase === 0;
  const showSaleToast = phase === 5;
  const showAcceptedLine = phase >= 4;
  const cardEmphasis = phase === 5;

  return (
    <div
      className="relative mx-auto w-full max-w-[540px] rounded-2xl border border-border/50 bg-[hsl(222_47%_8%/0.85)] shadow-2xl backdrop-blur-sm lg:max-w-none"
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/[0.06] via-transparent to-violet-500/[0.05]" />

      <header className="relative flex h-10 items-center gap-2 border-b border-border/40 px-3 sm:h-11 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-[10px] font-bold text-primary">
            P
          </div>
          <span className="hidden text-[11px] font-semibold text-foreground sm:inline">PainelCRM</span>
        </div>
        <div className="mx-2 hidden min-w-0 flex-1 sm:block">
          <div className="flex h-7 items-center gap-2 rounded-lg border border-border/40 bg-secondary/30 px-2 text-[10px] text-muted-foreground">
            <Search className="h-3 w-3 shrink-0 opacity-60" />
            Buscar cliente, proposta…
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/80 to-violet-500/70 ring-2 ring-background" />
        </div>
      </header>

      <div className="relative flex min-h-[260px] sm:min-h-[280px]">
        <aside className="flex w-10 shrink-0 flex-col items-center gap-2 border-r border-border/35 bg-secondary/15 py-3 sm:w-11">
          <LayoutDashboard className="h-4 w-4 text-primary" />
          <KanbanIcon className="h-4 w-4 text-muted-foreground" />
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <Settings className="mt-auto h-4 w-4 text-muted-foreground opacity-60" />
        </aside>

        <main className="relative min-w-0 flex-1 p-2.5 sm:p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Funil comercial</p>
              <p className="text-xs font-medium text-foreground">Kanban · Equipe vendas</p>
            </div>
            <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[9px] font-medium text-violet-200">
              Automação ativa
            </span>
          </div>

          <div className="relative">
            <KanbanPreview
              cardColumn={cardColumn}
              glowColumn={glowColumn}
              badges={badges}
              cardEmphasis={cardEmphasis}
            />

            <div className="pointer-events-none absolute left-0 top-0 z-10 flex max-w-[58%] flex-col gap-2 sm:max-w-[220px]">
              {showNewToast ? (
                <AutomationToast visible variant="automation">
                  Nova conversa recebida
                </AutomationToast>
              ) : null}
              {showProposalToast ? (
                <AutomationToast visible variant="automation">
                  Proposta enviada automaticamente
                </AutomationToast>
              ) : null}
              {showFinanceToast ? (
                <AutomationToast visible variant="finance">
                  Fatura gerada — R$ 497,00
                </AutomationToast>
              ) : null}
              {showSaleToast ? (
                <AutomationToast visible variant="success">
                  Venda concluída automaticamente
                </AutomationToast>
              ) : null}
            </div>
          </div>

          <FloatingChatPreview phase={phase} showPulse={showPulse} showAcceptedLine={showAcceptedLine} />
        </main>
      </div>
    </div>
  );
}
