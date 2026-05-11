import { useHeroMockupPhase } from "./useHeroMockupPhase";
import { DesktopCrmMockup } from "./DesktopCrmMockup";
import { MobileCrmMockup } from "./MobileCrmMockup";
import { HERO_MOCKUP_CAPTIONS } from "./heroMockupState";

/**
 * Mockup decorativo da demo — não é UI funcional do produto.
 */
export function HeroInteractiveMockup() {
  const { phase, reducedMotion } = useHeroMockupPhase();
  const caption = HERO_MOCKUP_CAPTIONS[phase] ?? HERO_MOCKUP_CAPTIONS[0];

  return (
    <div className="relative w-full">
      <div className="hidden md:block">
        <DesktopCrmMockup phase={phase} />
      </div>
      <div className="md:hidden">
        <MobileCrmMockup phase={phase} />
      </div>

      <p
        className={`mt-4 text-center text-xs text-muted-foreground transition-opacity duration-500 sm:text-sm ${
          reducedMotion ? "opacity-90" : ""
        }`}
        aria-live="polite"
      >
        <span className="font-medium text-foreground">{caption}</span>
      </p>
      <p className="sr-only">
        Demonstração animada do fluxo: conversa WhatsApp, Kanban comercial, proposta, fatura e fechamento.
        {reducedMotion ? " Animação reduzida conforme preferências do sistema." : ""}
      </p>
    </div>
  );
}

export { useHeroMockupPhase } from "./useHeroMockupPhase";
export { DesktopCrmMockup } from "./DesktopCrmMockup";
export { MobileCrmMockup } from "./MobileCrmMockup";
export { FloatingChatPreview } from "./FloatingChatPreview";
export { KanbanPreview } from "./KanbanPreview";
export { AutomationToast } from "./AutomationToast";
export { AnimatedDealCard } from "./AnimatedDealCard";
