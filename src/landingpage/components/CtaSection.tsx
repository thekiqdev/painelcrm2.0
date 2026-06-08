import ArrowRight from "lucide-react/dist/esm/icons/arrow-right.js";
import { Button } from "@/components/ui/button";
import { SignupEntryLink } from "@/components/acquisition/SignupEntryLink";

const CtaSection = () => {
  return (
    <section className="border-t border-border/50 bg-secondary/30 py-24">
      <div className="container mx-auto px-4 text-center lg:px-8">
        <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
          Pronto para centralizar vendas e atendimento?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Crie sua conta grátis em minutos e descubra como o PainelCRM pode simplificar toda a sua operação comercial.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" className="gap-2 px-8 text-base font-semibold" asChild>
            <SignupEntryLink className="inline-flex items-center gap-2">
              Criar conta grátis
              <ArrowRight size={18} />
            </SignupEntryLink>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default CtaSection;
