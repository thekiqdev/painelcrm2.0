import { Building2, SlidersHorizontal, Rocket } from "lucide-react";

const steps = [
  {
    icon: Building2,
    num: "01",
    title: "Cadastre sua empresa",
    desc: "Crie seu espaço em minutos, sem complicação. Cada empresa tem seu ambiente isolado e seguro.",
  },
  {
    icon: SlidersHorizontal,
    num: "02",
    title: "Configure funil e equipe",
    desc: "Monte seus funis, convide sua equipe e conecte o WhatsApp. Tudo pronto para operar.",
  },
  {
    icon: Rocket,
    num: "03",
    title: "Venda e atenda no mesmo painel",
    desc: "Gerencie leads, propostas, projetos e comunicação — tudo centralizado e com visibilidade total.",
  },
];

const HowItWorks = () => {
  return (
    <section id="como-funciona" className="border-y border-border/50 bg-secondary/30 py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Comece em <span className="text-gradient">3 passos simples</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Do cadastro à primeira venda — rápido e sem fricção.
          </p>
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
              <h3 className="font-display text-xl font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
