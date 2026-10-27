import { useTranslation } from "react-i18next";
import { useHeroMockupPhase } from "./useHeroMockupPhase";
import { DesktopCrmMockup } from "./DesktopCrmMockup";
import { MobileCrmMockup } from "./MobileCrmMockup";
import { formatAppMoney } from "@/lib/i18n/formatApp";
import { useLocaleCurrency } from "@/lib/i18n/LocaleProvider";

/**
 * Mockup decorativo da demo — não é UI funcional do produto.
 */
export function HeroInteractiveMockup() {
  const { t } = useTranslation("landing");
  const { currency } = useLocaleCurrency();
  const { phase, reducedMotion } = useHeroMockupPhase();
  const amount = formatAppMoney(49700, currency);
  const captions = [0, 1, 2, 3, 4, 5].map((i) =>
    i === 3 ? t("mock_caption_3", { amount }) : t(`mock_caption_${i}`)
  );
  const caption = captions[phase] ?? captions[0];

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
        {t("mock_sr")}
        {reducedMotion ? t("mock_sr_reduced") : ""}
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
