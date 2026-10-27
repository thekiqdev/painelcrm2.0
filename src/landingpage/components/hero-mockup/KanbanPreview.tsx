import { useTranslation } from "react-i18next";
import type { DealCardBadges } from "./AnimatedDealCard";
import { AnimatedDealCard } from "./AnimatedDealCard";

const COL_KEYS = ["new", "service", "proposal", "won"] as const;

type KanbanPreviewProps = {
  cardColumn: number | null;
  glowColumn: number | null;
  badges: DealCardBadges;
  cardEmphasis?: boolean;
  compact?: boolean;
};

export function KanbanPreview({
  cardColumn,
  glowColumn,
  badges,
  cardEmphasis,
  compact,
}: KanbanPreviewProps) {
  const { t } = useTranslation("landing");
  return (
    <div className={`grid gap-1.5 sm:gap-2 ${compact ? "grid-cols-2" : "grid-cols-4"}`}>
      {COL_KEYS.map((key, id) => {
        const active = cardColumn === id;
        const glow = glowColumn === id;
        return (
          <div
            key={key}
            className={`flex min-h-[112px] flex-col rounded-lg border border-border/40 bg-secondary/20 p-1.5 transition-all duration-700 sm:min-h-[128px] sm:p-2 ${
              glow ? "hero-mockup-col-glow border-primary/40 bg-primary/5" : ""
            }`}
          >
            <p className="mb-1.5 truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px]">
              {compact ? t(`mock_stage_${key}_short`) : t(`mock_stage_${key}`)}
            </p>
            <div className="flex-1">
              {active ? (
                <AnimatedDealCard badges={badges} emphasis={cardEmphasis} />
              ) : (
                <div className="flex h-full min-h-[72px] items-center justify-center rounded-md border border-dashed border-border/30 bg-background/20">
                  <span className="text-[9px] text-muted-foreground/50">—</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
