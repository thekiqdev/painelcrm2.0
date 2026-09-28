import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ModernProductGallery, ModernProductInfo } from '@/themes/moderno/ModernProductDetail';
import { ModernProductCard } from '@/themes/moderno/ModernProductCard';
import { modernoMockBestSellers, modernoMockProduct } from '@/themes/moderno/mockData';

export function ModernMockProductPage({ storePath }: { storePath: string }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 md:py-12">
      <Link to={storePath} className="mb-6 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ChevronLeft size={14} />
        Voltar à loja
      </Link>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
        <ModernProductGallery images={modernoMockProduct.images} productName={modernoMockProduct.name} />
        <ModernProductInfo {...modernoMockProduct} />
      </div>

      <section className="mt-20 md:mt-28">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-light uppercase tracking-[0.2em] text-muted-foreground">
            Você também pode gostar
          </p>
          <h2 className="heading-section text-3xl text-foreground">Peças Relacionadas</h2>
          <div className="divider-elegant mt-4" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-8">
          {modernoMockBestSellers.map((item) => (
            <ModernProductCard key={item.id} {...item} productHref={`${storePath}/produto/${item.id}`} />
          ))}
        </div>
      </section>
    </main>
  );
}
