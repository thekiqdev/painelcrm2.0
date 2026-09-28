import MessageCircle from "lucide-react/dist/esm/icons/message-circle.js";
import { AutomationToast } from "./AutomationToast";
import { AnimatedDealCard } from "./AnimatedDealCard";
import {
  getCardColumn,
  getDealBadges,
  getGlowColumn,
} from "./heroMockupState";

const STAGES = ["Novo lead", "Em atendimento", "Proposta enviada", "Fechado"] as const;

type MobileCrmMockupProps = {
  phase: number;
};

export function MobileCrmMockup({ phase }: MobileCrmMockupProps) {
  const cardColumn = getCardColumn(phase);
  const glowColumn = getGlowColumn(phase);
  const badges = getDealBadges(phase);
  const showPulse = phase === 0;
  const showAddFunnel = phase >= 1;

  return (
    <div className="mx-auto w-full max-w-[320px] space-y-3" aria-hidden>
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-[hsl(222_44%_10%/0.92)] shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-border/40 bg-secondary/35 px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20">
            <MessageCircle className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">WhatsApp</p>
            <p className="text-[10px] text-muted-foreground">Mariana Souza</p>
          </div>
          {showPulse ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          )}
        </div>
        <div className="space-y-2 p-3">
          <div className="rounded-xl rounded-tl-sm bg-secondary/85 px-3 py-2 text-[11px] leading-snug">
            Oi, gostei do plano. Você consegue me enviar uma proposta?
          </div>
          <div className="flex justify-end">
            <div className="max-w-[88%] rounded-xl rounded-tr-sm bg-primary/25 px-3 py-2 text-[11px] leading-snug">
              Claro! Vou preparar agora.
            </div>
          </div>
          {phase >= 4 ? (
            <div className="rounded-xl rounded-tl-sm border border-emerald-500/35 bg-emerald-500/12 px-3 py-2 text-[11px] text-emerald-100">
              Cliente aceitou a proposta ✓
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-center border-t border-border/35 px-3 py-2">
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-medium transition-all ${
              showAddFunnel
                ? "bg-primary/20 text-primary"
                : "bg-muted/40 text-muted-foreground"
            }`}
          >
            {showAddFunnel ? "✓ No funil comercial" : "Nova mensagem"}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-border/45 bg-secondary/15 p-2.5">
        <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Funil · Kanban
        </p>
        <div className="space-y-2">
          {STAGES.map((label, i) => {
            const active = cardColumn === i;
            const glow = glowColumn === i;
            return (
              <div
                key={label}
                className={`rounded-lg border border-border/35 p-2 transition-all duration-500 ${
                  glow ? "hero-mockup-col-glow border-primary/45 bg-primary/8" : "bg-background/25"
                } ${active ? "ring-1 ring-primary/30" : ""}`}
              >
                <p className="mb-1.5 text-[9px] font-semibold text-muted-foreground">{label}</p>
                {active ? (
                  <AnimatedDealCard badges={badges} emphasis={phase === 5} />
                ) : (
                  <div className="flex h-12 items-center justify-center rounded-md border border-dashed border-border/25 text-[10px] text-muted-foreground/40">
                    —
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-[52px] flex-wrap justify-center gap-2 px-1">
        {phase === 0 ? (
          <AutomationToast visible variant="automation">
            Nova conversa recebida
          </AutomationToast>
        ) : null}
        {phase === 2 ? (
          <AutomationToast visible variant="automation">
            Proposta enviada automaticamente
          </AutomationToast>
        ) : null}
        {phase === 3 ? (
          <AutomationToast visible variant="finance">
            Fatura gerada — R$ 497,00
          </AutomationToast>
        ) : null}
        {phase === 5 ? (
          <AutomationToast visible variant="success">
            Venda concluída automaticamente
          </AutomationToast>
        ) : null}
      </div>

      <div className="flex justify-end pr-1">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[hsl(220_90%_52%)] text-primary-foreground shadow-lg">
          <MessageCircle className="h-5 w-5" />
          {(phase === 0 || showPulse) && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white hero-mockup-badge-pulse">
              1
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
