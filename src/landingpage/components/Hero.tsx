import { ArrowRight, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Hero = () => {
  return (
    <section className="relative overflow-hidden pt-16">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/5 blur-[120px]" />

      <div className="container relative mx-auto px-4 lg:px-8">
        <div className="flex flex-col items-center pt-20 pb-12 text-center lg:pt-28 lg:pb-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-1.5 text-xs text-muted-foreground animate-fade-up">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Plataforma CRM completa para PMEs
          </div>

          <h1 className="max-w-4xl font-display text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl animate-fade-up" style={{ animationDelay: "0.1s" }}>
            Do lead ao contrato, em uma{" "}
            <span className="text-gradient">única plataforma</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-muted-foreground animate-fade-up" style={{ animationDelay: "0.2s" }}>
            CRM, funil de vendas, projetos, WhatsApp e faturamento. Tudo integrado para sua equipe vender mais e operar com clareza.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: "0.3s" }}>
            <Button size="lg" className="gap-2 px-8 text-base font-semibold" asChild>
              <Link to="/register">
                Começar grátis
                <ArrowRight size={18} />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="gap-2 px-8 text-base font-semibold" asChild>
              <Link to="/login">
                <Play size={16} />
                Ver demonstração
              </Link>
            </Button>
          </div>

          <p className="mt-8 text-sm text-muted-foreground animate-fade-up" style={{ animationDelay: "0.4s" }}>
            Usado por <span className="font-semibold text-foreground">+500 empresas</span> · Agências, consultorias e equipes comerciais
          </p>

          <div className="relative mt-12 w-full max-w-5xl animate-fade-up" style={{ animationDelay: "0.5s" }}>
            <div className="rounded-xl border border-border/60 bg-card p-1.5 glow-primary">
              <img
                src="/landingpage/hero-dashboard.jpg"
                alt="Dashboard MultiCRM mostrando funil de vendas, clientes e WhatsApp integrado"
                className="w-full rounded-lg"
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
