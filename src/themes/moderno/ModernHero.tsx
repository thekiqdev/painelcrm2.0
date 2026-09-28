import { modernoStoreMeta } from '@/themes/moderno/meta';
import { modernoMockHeroBanner } from '@/themes/moderno/mockData';
import type { StoreProfile } from '@/types/products';

const MAX_DESC = 180;

function heroSubtitle(storeProfile: StoreProfile): string {
  const raw = storeProfile.store_description?.trim();
  if (raw) return raw.length > MAX_DESC ? `${raw.slice(0, MAX_DESC).trim()}...` : raw;
  return 'Descubra pecas selecionadas com cuidado para realcar sua beleza natural.';
}

export function ModernHero({
  storeProfile,
}: {
  storeProfile: StoreProfile;
  bannerUrl: string | null;
}) {
  const subtitle = heroSubtitle(storeProfile);

  return (
    <section className="relative w-full overflow-hidden">
      <div className="relative h-[70vh] max-h-[900px] md:h-[85vh]">
        {modernoMockHeroBanner ? (
          <img
            src={modernoMockHeroBanner}
            alt={`Banner da loja ${storeProfile.store_name}`}
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#3b2f2a] via-[#58453b] to-[#8a715f]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/40 via-foreground/20 to-transparent" />

        <div className="relative flex h-full items-center">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-lg">
              <p className="mb-4 text-xs font-light uppercase tracking-[0.2em] text-primary-foreground/80">
                Nova Colecao 2025
              </p>
              <h2 className="mod-heading-display mb-6 text-4xl leading-tight text-primary-foreground md:text-5xl lg:text-6xl">
                {modernoStoreMeta.publicTagline.split(' ').slice(0, 2).join(' ')}
                <br />
                {modernoStoreMeta.publicTagline.split(' ').slice(2).join(' ')}
              </h2>
              <p className="mb-8 max-w-sm text-sm font-light leading-relaxed text-primary-foreground/70 md:text-base">
                {subtitle}
              </p>
              <div className="flex flex-wrap gap-4">
                <a href="#lista-produtos" className="mod-btn-premium inline-block rounded-sm">
                  Ver Colecao
                </a>
                <a
                  href="#mais-vendidos"
                  className="mod-btn-outline inline-block rounded-sm border-primary-foreground/60 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  Mais Vendidos
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
