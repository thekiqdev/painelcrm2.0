import { ModernProductCard } from '@/themes/moderno/ModernProductCard';
import { modernoMockBestSellers, modernoMockNewArrivals } from '@/themes/moderno/mockData';

function ProductSection({
  id,
  title,
  subtitle,
  products,
  baseProductPath,
}: {
  id: string;
  title: string;
  subtitle: string;
  baseProductPath: string;
  products: Array<{
    id: string;
    image: string;
    name: string;
    price: number;
    originalPrice?: number;
    colors?: string[];
    isNew?: boolean;
  }>;
}) {
  return (
    <section id={id} className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-light uppercase tracking-[0.2em] text-muted-foreground">{subtitle}</p>
          <h2 className="mod-heading-section text-3xl text-foreground md:text-4xl">{title}</h2>
          <div className="mod-divider-elegant mt-4" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-8">
          {products.map((product) => (
            <ModernProductCard
              key={product.id}
              {...product}
              productHref={`${baseProductPath}/${product.id}`}
            />
          ))}
        </div>
        <div className="mt-12 text-center">
          <a href="#" className="mod-btn-outline inline-block rounded-sm">
            Ver Todos
          </a>
        </div>
      </div>
    </section>
  );
}

export function ModernNewArrivals({ baseProductPath }: { baseProductPath: string }) {
  return (
    <ProductSection
      id="novidades"
      title="Lancamentos"
      subtitle="Recem chegados"
      products={modernoMockNewArrivals}
      baseProductPath={baseProductPath}
    />
  );
}

export function ModernBestSellers({ baseProductPath }: { baseProductPath: string }) {
  return (
    <div className="bg-muted">
      <ProductSection
        id="mais-vendidos"
        title="Mais Vendidos"
        subtitle="Favoritos das clientes"
        products={modernoMockBestSellers}
        baseProductPath={baseProductPath}
      />
    </div>
  );
}
