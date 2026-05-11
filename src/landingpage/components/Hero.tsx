import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { HeroInteractiveMockup } from "./hero-mockup/HeroInteractiveMockup";

const Hero = () => {
  return (
    <section className="relative overflow-hidden pt-16">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/5 blur-[120px]" />

      <div className="container relative mx-auto px-4 lg:px-8">
        <div className="grid items-center gap-10 pb-16 pt-12 lg:grid-cols-11 lg:gap-12 lg:pb-20 lg:pt-20">
          <div className="text-center lg:col-span-5 lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-1.5 text-xs text-muted-foreground animate-fade-up">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Plataforma CRM completa para PMEs
            </div>

            <h1
              className="font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[2.35rem] xl:text-5xl animate-fade-up"
              style={{ animationDelay: "0.1s" }}
            >
              Transforme conversas em vendas e{" "}
              <span className="text-gradient">
                gerencie toda sua{" "}
                <span className="font-black tracking-tight text-[1.14em] sm:text-[1.12em] xl:text-[1.1em]">
                  empresa
                </span>
              </span>
            </h1>

            <p
              className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0 lg:max-w-none animate-fade-up"
              style={{ animationDelay: "0.15s" }}
            >
              Atenda seus clientes pelo WhatsApp, organize oportunidades no Kanban e automatize etapas comerciais
              dentro do PainelCRM.
            </p>

            <div
              className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start animate-fade-up"
              style={{ animationDelay: "0.25s" }}
            >
              <Button size="lg" className="gap-2 px-8 text-base font-semibold" asChild>
                {import.meta.env.VITE_LANDING_STANDALONE === "1" ? (
                  <a href="/checkout" className="inline-flex items-center gap-2">
                    Começar agora
                    <ArrowRight size={18} />
                  </a>
                ) : (
                  <Link to="/checkout">
                    Começar agora
                    <ArrowRight size={18} />
                  </Link>
                )}
              </Button>
            </div>

            <p
              className="mt-8 text-sm text-muted-foreground animate-fade-up lg:mt-10"
              style={{ animationDelay: "0.35s" }}
            >
              Usado por <span className="font-semibold text-foreground">+500 empresas</span> · Agências, consultorias e
              equipes comerciais
            </p>
          </div>

          <div
            className="relative mx-auto w-full max-w-xl animate-fade-up lg:col-span-6 lg:mx-0 lg:max-w-none"
            style={{ animationDelay: "0.2s" }}
          >
            <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-violet-500/10 blur-2xl" />
            <div className="relative rounded-2xl border border-border/40 bg-card/30 p-2 shadow-xl backdrop-blur-sm sm:p-3">
              <HeroInteractiveMockup />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
