import { useState } from 'react';
import { Heart, Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { StoreProfile } from '@/types/products';

const navLinks = [
  { label: 'Novidades', hash: 'novidades' },
  { label: 'Blusas', hash: 'categorias' },
  { label: 'Conjuntos', hash: 'categorias' },
  { label: 'Manga Longa', hash: 'categorias' },
  { label: 'Mais Vendidos', hash: 'mais-vendidos' },
];

export function ModernStoreHeader({
  storeProfile: _storeProfile,
  logoUrl: _logoUrl,
}: {
  storeProfile: StoreProfile;
  logoUrl: string | null;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const homeTo = '#';
  const sectionHref = (hash: string) => `#${hash}`;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
      <div className="bg-primary px-4 py-2 text-center text-primary-foreground">
        <p className="text-xs font-light uppercase tracking-[0.15em]">
          Frete gratis para compras acima de R$ 299
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between md:h-20">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="p-2 -ml-2 text-foreground md:hidden"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <Link to={homeTo} className="flex-1 text-center md:flex-none md:text-left">
            <h1 className="mod-heading-display text-2xl tracking-[0.08em] text-foreground md:text-3xl">
              NOVO BRILHO
            </h1>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={sectionHref(link.hash)}
                className="text-xs font-light uppercase tracking-[0.1em] text-muted-foreground transition-colors duration-300 hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="p-2 text-foreground/70 transition-colors hover:text-foreground"
              aria-label="Buscar"
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              className="hidden p-2 text-foreground/70 transition-colors hover:text-foreground sm:block"
              aria-label="Conta"
            >
              <User size={18} />
            </button>
            <button
              type="button"
              className="hidden p-2 text-foreground/70 transition-colors hover:text-foreground sm:block"
              aria-label="Favoritos"
            >
              <Heart size={18} />
            </button>
            <button
              type="button"
              className="relative p-2 text-foreground/70 transition-colors hover:text-foreground"
              aria-label="Carrinho"
            >
              <ShoppingBag size={18} />
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose text-[10px] font-medium text-rose-foreground">
                2
              </span>
            </button>
          </div>
        </div>

        {searchOpen ? (
          <div className="animate-in slide-in-from-top-2 pb-4 duration-200">
            <div className="relative mx-auto max-w-lg">
              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="O que voce procura?"
                className="w-full rounded-sm border-0 bg-muted py-3 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-caramel"
              />
            </div>
          </div>
        ) : null}
      </div>

      {mobileMenuOpen ? (
        <div className="animate-in slide-in-from-top-2 border-t border-border bg-card duration-200 md:hidden">
          <nav className="flex flex-col gap-1 px-6 py-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={sectionHref(link.hash)}
                className="border-b border-border/50 py-3 text-sm font-light uppercase tracking-[0.08em] text-foreground last:border-0"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex gap-6 pt-4">
              <a href="#" className="flex items-center gap-2 text-sm text-muted-foreground">
                <User size={16} /> Minha Conta
              </a>
              <a href="#" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Heart size={16} /> Favoritos
              </a>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
