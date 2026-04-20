import { AtSign, Share2 } from 'lucide-react';
import type { StoreProfile } from '@/types/products';

export function ModernStoreFooter({ storeProfile: _storeProfile }: { storeProfile: StoreProfile }) {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-8">
          <div className="md:col-span-1">
            <h3 className="mod-heading-display mb-4 text-2xl tracking-[0.08em]">NOVO BRILHO</h3>
            <p className="mb-6 text-sm font-light leading-relaxed text-primary-foreground/60">
              Moda feminina com elegância e personalidade. Peças selecionadas para mulheres que brilham.
            </p>
            <div className="flex gap-3">
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-primary-foreground/20 transition-colors hover:bg-primary-foreground/10"
                aria-label="Instagram"
              >
                <AtSign size={16} />
              </a>
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-primary-foreground/20 transition-colors hover:bg-primary-foreground/10"
                aria-label="Facebook"
              >
                <Share2 size={16} />
              </a>
            </div>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-medium uppercase tracking-[0.15em]">Institucional</h4>
            <ul className="space-y-3">
              {['Sobre Nós', 'Política de Privacidade', 'Termos de Uso', 'Trocas e Devoluções'].map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm font-light text-primary-foreground/60 transition-colors hover:text-primary-foreground">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-medium uppercase tracking-[0.15em]">Ajuda</h4>
            <ul className="space-y-3">
              {['Como Comprar', 'Formas de Pagamento', 'Prazo de Entrega', 'Fale Conosco'].map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm font-light text-primary-foreground/60 transition-colors hover:text-primary-foreground">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-medium uppercase tracking-[0.15em]">Newsletter</h4>
            <p className="mb-4 text-sm font-light leading-relaxed text-primary-foreground/60">
              Receba novidades e ofertas exclusivas.
            </p>
            <div className="flex">
              <input
                type="email"
                placeholder="Seu e-mail"
                className="flex-1 rounded-l-sm border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2.5 text-sm text-primary-foreground placeholder:text-primary-foreground/40 focus:outline-none focus:border-primary-foreground/40"
              />
              <button className="rounded-r-sm bg-primary-foreground px-5 py-2.5 text-xs font-medium uppercase tracking-[0.1em] text-primary transition-colors hover:bg-primary-foreground/90">
                Enviar
              </button>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-primary-foreground/10 pt-8 md:flex-row">
          <p className="text-xs font-light text-primary-foreground/40">
            © 2025 Novo Brilho. Todos os direitos reservados.
          </p>
          <div className="flex gap-4 text-xs font-light text-primary-foreground/40">
            <span>PIX</span>
            <span>•</span>
            <span>Cartão de Crédito</span>
            <span>•</span>
            <span>Boleto</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
