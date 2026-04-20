import { HeadphonesIcon, Shield, Sparkles, Truck } from 'lucide-react';

const highlights = [
  {
    icon: Truck,
    title: 'Envio para Todo Brasil',
    description: 'Entrega rapida e segura para todas as regioes',
  },
  {
    icon: Shield,
    title: 'Compra Segura',
    description: 'Pagamento protegido e dados criptografados',
  },
  {
    icon: Sparkles,
    title: 'Pecas Selecionadas',
    description: 'Curadoria cuidadosa de cada item da loja',
  },
  {
    icon: HeadphonesIcon,
    title: 'Atendimento Premium',
    description: 'Suporte dedicado para tirar todas as duvidas',
  },
];

export function ModernBrandHighlights() {
  return (
    <section id="beneficios" className="bg-warm py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 md:gap-12">
          {highlights.map((item) => (
            <div key={item.title} className="text-center">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-card">
                <item.icon size={20} className="text-caramel" strokeWidth={1.5} />
              </div>
              <h3 className="mb-2 text-sm font-medium tracking-wide text-foreground">{item.title}</h3>
              <p className="text-xs font-light leading-relaxed text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
