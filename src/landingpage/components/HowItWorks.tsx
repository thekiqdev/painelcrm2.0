import { useTranslation } from "react-i18next";
import Building2 from "lucide-react/dist/esm/icons/building-2.js";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal.js";
import Rocket from "lucide-react/dist/esm/icons/rocket.js";

const steps = [
  { icon: Building2, num: "01", key: "1" },
  { icon: SlidersHorizontal, num: "02", key: "2" },
  { icon: Rocket, num: "03", key: "3" },
];

const HowItWorks = () => {
  const { t } = useTranslation("landing");
  return (
    <section id="como-funciona" className="border-y border-border/50 bg-secondary/30 py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            {t("how_title_before")} <span className="text-gradient">{t("how_title_em")}</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">{t("how_lead")}</p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.num} className="relative text-center">
              {i < steps.length - 1 && (
                <div className="absolute right-0 top-12 hidden h-px w-full translate-x-1/2 bg-border md:block" />
              )}
              <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-card">
                <step.icon size={28} className="text-primary" />
                <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {step.num}
                </span>
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground">{t(`how_${step.key}_title`)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(`how_${step.key}_desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
