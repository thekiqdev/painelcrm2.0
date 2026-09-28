import MessageCircle from "lucide-react/dist/esm/icons/message-circle.js";
import Users from "lucide-react/dist/esm/icons/users.js";

type FloatingChatPreviewProps = {
  phase: number;
  showPulse: boolean;
  showAcceptedLine?: boolean;
};

export function FloatingChatPreview({ phase, showPulse, showAcceptedLine }: FloatingChatPreviewProps) {
  return (
    <div className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2" aria-hidden>
      <div className="w-[min(100%,220px)] overflow-hidden rounded-xl border border-border/50 bg-[hsl(222_44%_10%/0.92)] shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-border/40 bg-secondary/40 px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <MessageCircle className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold">WhatsApp · PainelCRM</p>
            <p className="text-[9px] text-muted-foreground">Mariana Souza</p>
          </div>
          <span className="relative flex h-2 w-2">
            {showPulse ? (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </>
            ) : (
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            )}
          </span>
        </div>
        <div className="max-h-[120px] space-y-2 overflow-y-auto p-2.5">
          <div className="flex justify-start">
            <div className="max-w-[92%] rounded-lg rounded-tl-sm bg-secondary/80 px-2.5 py-1.5 text-[10px] leading-snug text-foreground">
              Oi, gostei do plano. Você consegue me enviar uma proposta?
            </div>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[92%] rounded-lg rounded-tr-sm bg-primary/25 px-2.5 py-1.5 text-[10px] leading-snug text-foreground">
              Claro! Vou preparar agora.
            </div>
          </div>
          {showAcceptedLine ? (
            <div className="flex justify-start">
              <div className="max-w-[92%] rounded-lg rounded-tl-sm border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-emerald-100">
                Cliente aceitou a proposta ✓
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1 border-t border-border/30 px-2 py-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/50">
            <Users className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="h-6 flex-1 rounded-md bg-muted/30 text-[9px] leading-6 text-muted-foreground/70">Mensagem…</div>
        </div>
      </div>

      <button
        type="button"
        tabIndex={-1}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[hsl(220_90%_52%)] text-primary-foreground shadow-lg will-change-transform ${showPulse ? "hero-mockup-breathe" : ""}`}
        aria-hidden
      >
        <MessageCircle className="h-5 w-5" />
        {(phase === 0 || showPulse) && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white hero-mockup-badge-pulse">
            1
          </span>
        )}
      </button>
    </div>
  );
}
