import { modernoMockCategories } from '@/themes/moderno/mockData';

export function ModernCategoryShowcase() {
  return (
    <section id="categorias" className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-light uppercase tracking-[0.2em] text-muted-foreground">Explore</p>
          <h2 className="mod-heading-section text-3xl text-foreground md:text-4xl">Categorias</h2>
          <div className="mod-divider-elegant mt-4" />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          {modernoMockCategories.map((cat) => (
            <a
              key={cat.name}
              href="#lista-produtos"
              className="mod-category-card group relative aspect-[3/4] overflow-hidden rounded-sm"
            >
              <img
                src={cat.image}
                alt={cat.name}
                className="mod-category-bg h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/10 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                <p className="mb-1 text-[10px] font-light uppercase tracking-[0.15em] text-primary-foreground/70">
                  {cat.count}
                </p>
                <h3 className="mod-heading-section text-2xl text-primary-foreground md:text-3xl">{cat.name}</h3>
                <div className="mt-3 h-[1px] overflow-hidden">
                  <div className="h-full w-0 bg-primary-foreground/60 transition-all duration-500 group-hover:w-12" />
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
