import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { formatAppMoney } from "@/lib/i18n/formatApp";
import { useLocaleCurrency } from "@/lib/i18n/LocaleProvider";

export type DealCardBadges = {
  whatsapp?: boolean;
  proposta?: boolean;
  fatura?: boolean;
  automacao?: boolean;
};

type AnimatedDealCardProps = {
  name?: string;
  messagePreview?: string;
  valueLabel?: string;
  badges: DealCardBadges;
  emphasis?: boolean;
};

export function AnimatedDealCard({
  name = "Mariana Souza",
  messagePreview,
  valueLabel,
  badges,
  emphasis,
}: AnimatedDealCardProps) {
  const { t } = useTranslation("landing");
  const { currency } = useLocaleCurrency();
  const preview = messagePreview ?? t("mock_deal_message");
  const value = valueLabel ?? formatAppMoney(49700, currency);
  return (
    <div
      className={`rounded-lg border border-border/60 bg-[hsl(222_44%_11%)] p-2.5 shadow-md transition-all duration-500 ${
        emphasis ? "ring-2 ring-primary/50 scale-[1.02] shadow-lg shadow-primary/10" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{name}</p>
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{preview}</p>
          <p className="mt-1.5 text-xs font-semibold tabular-nums text-primary">{value}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {badges.whatsapp && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[9px] font-normal bg-emerald-500/15 text-emerald-300 border-emerald-500/25">
            WhatsApp
          </Badge>
        )}
        {badges.proposta && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[9px] font-normal bg-violet-500/15 text-violet-200 border-violet-500/25">
            {t("mock_badge_proposal")}
          </Badge>
        )}
        {badges.fatura && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[9px] font-normal bg-amber-500/15 text-amber-200 border-amber-500/25">
            {t("mock_badge_invoice")}
          </Badge>
        )}
        {badges.automacao && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[9px] font-normal bg-cyan-500/15 text-cyan-200 border-cyan-500/25">
            {t("mock_badge_automation")}
          </Badge>
        )}
      </div>
    </div>
  );
}
