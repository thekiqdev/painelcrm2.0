import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  Heart,
  Menu,
  MessageCircle,
  Search,
  ShoppingBag,
  User,
  X,
} from 'lucide-react';
import type { PublicCatalogProduct } from '@/types/products';
import type { StorefrontListThemeProps, StorefrontProductThemeProps } from '@/themes/types';
import { getPublicProductThumbnailUrl } from '@/utils/publicCatalogImages';
import '@/themes/luzmodas/theme.css';

function formatPrice(v: number | null | undefined) {
  if (v == null) return null;
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
}

function LuzHeader({ storeName, storePath }: { storeName: string; storePath: string }) {
  const [open, setOpen] = useState(false);
  const nav = ['Novidades', 'Vestidos', 'Regatas', 'Ciganinhas', 'Calças', 'Macacões'];
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur-md">
      <div className="lz-topbar py-1.5 text-center text-xs font-medium uppercase tracking-wider">
        Frete grátis para compras acima de R$ 299
      </div>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-20 sm:px-6">
        <button onClick={() => setOpen(!open)} className="p-2 -ml-2 md:hidden">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        <Link to={storePath} className="lz-heading text-2xl font-bold tracking-tight md:text-3xl">
          {storeName.slice(0, 3).toUpperCase()}<span className="text-[var(--lz-primary)]">{storeName.slice(3).toUpperCase()}</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((n) => (
            <a key={n} href="#lista-produtos" className="text-sm font-medium uppercase tracking-wide text-zinc-500 hover:text-[var(--lz-primary)]">{n}</a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <button className="p-2"><Search className="h-5 w-5" /></button>
          <button className="hidden p-2 sm:block"><Heart className="h-5 w-5" /></button>
          <button className="hidden p-2 sm:block"><User className="h-5 w-5" /></button>
          <button className="relative p-2"><ShoppingBag className="h-5 w-5" /><span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--lz-primary)] text-[10px] font-bold text-white">0</span></button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-zinc-200 bg-white md:hidden">
          <nav className="flex flex-col gap-1 px-4 py-4">
            {nav.map((n) => <a key={n} href="#lista-produtos" className="rounded-lg px-2 py-3 text-sm font-medium uppercase tracking-wide">{n}</a>)}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function ProductCard({ p, storePath }: { p: PublicCatalogProduct; storePath: string }) {
  const thumb = getPublicProductThumbnailUrl(p);
  return (
    <div className="group">
      <Link to={`${storePath}/produto/${p.id}`} className="lz-card-image relative mb-4 block">
        {thumb ? <img src={thumb} alt={p.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" /> : <div className="h-full w-full bg-zinc-100" />}
      </Link>
      <h3 className="line-clamp-2 text-sm font-medium">{p.name}</h3>
      <div className="mt-1 text-lg font-bold">{formatPrice(p.price)}</div>
      {p.category ? <div className="mt-1 text-xs text-zinc-500">{p.category}</div> : null}
    </div>
  );
}

export function LuzmodasListShell({ storeProfile, bannerUrl, storeSlug, products = [], children }: StorefrontListThemeProps) {
  const storePath = storeSlug ? `/${storeSlug}/loja` : '/';
  const categories = useMemo(() => {
    const map = new Map<string, PublicCatalogProduct>();
    products.forEach((p) => {
      const c = p.category?.trim();
      if (c && !map.has(c)) map.set(c, p);
    });
    return Array.from(map.entries()).slice(0, 5);
  }, [products]);

  return (
    <div className="storefront-theme-luzmodas min-h-screen bg-white">
      <LuzHeader storeName={storeProfile.store_name || 'LUZMODAS'} storePath={storePath} />
      <main>
        <section className="relative h-[60vh] overflow-hidden md:h-[75vh]">
          {bannerUrl ? <img src={bannerUrl} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-gradient-to-r from-zinc-700 to-zinc-400" />}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
              <div className="max-w-lg">
                <span className="inline-block text-sm font-medium uppercase tracking-[0.25em] text-white/90">Nova Coleção</span>
                <h1 className="lz-heading mt-4 text-4xl font-bold leading-tight text-white md:text-6xl lg:text-7xl">Primavera<br /><span className="text-[var(--lz-pink-soft)]">Verão 2026</span></h1>
                {storeProfile.store_description ? <p className="mt-4 max-w-md text-base text-white/80 md:text-lg">{storeProfile.store_description}</p> : null}
                <div className="mt-8 flex gap-4">
                  <a href="#lista-produtos" className="lz-btn-primary">Ver Coleção</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {categories.length > 0 ? (
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24">
            <div className="mb-12 text-center">
              <h2 className="lz-heading text-3xl font-bold md:text-4xl">Categorias</h2>
              <p className="mt-3 text-base text-zinc-500">Encontre exatamente o que você procura</p>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5 md:gap-6">
              {categories.map(([name, p]) => (
                <a key={name} href="#lista-produtos" className="group relative aspect-[4/5] overflow-hidden rounded-2xl">
                  {getPublicProductThumbnailUrl(p) ? <img src={getPublicProductThumbnailUrl(p)!} alt={name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" /> : <div className="h-full w-full bg-zinc-100" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 text-left">
                    <h3 className="lz-heading text-lg font-semibold text-white">{name}</h3>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section id="lista-produtos" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mb-12 flex items-end justify-between">
            <div>
              <h2 className="lz-heading text-3xl font-bold md:text-4xl">Destaques</h2>
              <p className="mt-3 text-base text-zinc-500">Peças mais desejadas da temporada</p>
            </div>
          </div>
          {products.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-8">
              {products.slice(0, 9).map((p) => <ProductCard key={p.id} p={p} storePath={storePath} />)}
            </div>
          ) : (
            <div>{children}</div>
          )}
        </section>

        <section className="bg-pink-50 py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--lz-primary)]">Coleção</span>
            <h2 className="lz-heading mt-4 text-3xl font-bold md:text-5xl">Descubra Novidades</h2>
          </div>
        </section>
      </main>

      <footer className="lz-footer">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
            <div className="md:col-span-1">
              <span className="lz-heading text-2xl font-bold">{storeProfile.store_name.toUpperCase()}</span>
              {storeProfile.store_description ? <p className="mt-4 text-sm leading-relaxed text-white/60">{storeProfile.store_description}</p> : null}
              <div className="mt-6 flex gap-3">
                <a href="#" className="rounded-full bg-white/10 p-2.5"><MessageCircle className="h-4 w-4" /></a>
              </div>
            </div>
            <div><h4 className="mb-4 text-sm font-semibold uppercase tracking-wider">Institucional</h4><ul className="space-y-3 text-sm text-white/60"><li>Sobre Nós</li><li>Política de Privacidade</li><li>Termos de Uso</li><li>Trabalhe Conosco</li></ul></div>
            <div><h4 className="mb-4 text-sm font-semibold uppercase tracking-wider">Ajuda</h4><ul className="space-y-3 text-sm text-white/60"><li>Central de Ajuda</li><li>Trocas e Devoluções</li><li>Rastrear Pedido</li><li>Tabela de Medidas</li></ul></div>
            <div><h4 className="mb-4 text-sm font-semibold uppercase tracking-wider">Contato</h4><ul className="space-y-3 text-sm text-white/60">{storeProfile.contact_whatsapp ? <li>{storeProfile.contact_whatsapp}</li> : null}{storeProfile.contact_email ? <li>{storeProfile.contact_email}</li> : null}{storeProfile.contact_phone ? <li>{storeProfile.contact_phone}</li> : null}</ul></div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Detalhe: chrome Luzmodas + corpo real de PublicProduct (variantes, preço, checkout).
 * Não usar mock de tamanhos — a grade Cor/Tamanho vem do seletor em children.
 */
export function LuzmodasProductShell({
  storeProfile,
  storeSlug,
  product,
  relatedProducts = [],
  children,
}: StorefrontProductThemeProps) {
  if (!product) {
    return <div className="storefront-theme-luzmodas min-h-screen bg-white">{children as ReactNode}</div>;
  }
  const storePath = storeSlug ? `/${storeSlug}/loja` : '/';

  return (
    <div className="storefront-theme-luzmodas min-h-screen bg-white">
      <LuzHeader storeName={storeProfile.store_name || 'LUZMODAS'} storePath={storePath} />
      <main>
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 md:pt-10">
          <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500 md:mb-6">
            <Link to={storePath}>Home</Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>{product.category || 'Produto'}</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-zinc-900">{product.name}</span>
          </nav>
        </div>
        {children as ReactNode}
        {relatedProducts.length > 0 ? (
          <section className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 md:pb-28 md:pt-12">
            <h2 className="lz-heading mb-8 text-2xl font-bold md:text-3xl">Você também pode gostar</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} p={p} storePath={storePath} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <footer className="lz-footer">
        <div className="mx-auto max-w-7xl px-4 py-12 text-xs text-white/60 sm:px-6">
          © {new Date().getFullYear()} {storeProfile.store_name}. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
