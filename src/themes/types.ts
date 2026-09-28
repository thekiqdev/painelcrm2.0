import type { FC, ReactNode } from 'react';
import type { PublicCatalogProduct, StoreProfile } from '@/types/products';

/**
 * Contrato de templates da vitrine (código local, versionado).
 *
 * Novo template (ex.: vindo da Lovable):
 * 1. Crie `src/themes/<slug>/` com `meta.ts`, `shells.tsx` (ou divida como preferir).
 * 2. Exporte em `shells.tsx` os componentes `ListShell` e `ProductShell` com as props abaixo.
 * 3. Registre o módulo em `src/themes/registry.tsx` (REGISTRY + lista de definições).
 * 4. Inclua `<slug>` em `THEME_KEYS` no backend `storeProfileController.ts`.
 *
 * Proibido: iframe, eval, HTML/arquivo remoto por URL, código carregado fora do bundle.
 */

/** Chaves conhecidas; ao adicionar template, estenda aqui e no backend. */
export type StorefrontThemeId = 'default' | 'minimal' | 'moderno' | 'luzmodas';

/** Props da página pública da loja (lista de produtos). */
export interface StorefrontListThemeProps {
  storeProfile: StoreProfile;
  bannerUrl: string | null;
  logoUrl: string | null;
  storeSlug?: string;
  products?: PublicCatalogProduct[];
  children: ReactNode;
}

/** Props da página pública de detalhe do produto. */
export interface StorefrontProductThemeProps {
  storeProfile: StoreProfile;
  storeSlug?: string;
  product?: PublicCatalogProduct | null;
  gallery?: string[];
  relatedProducts?: PublicCatalogProduct[];
  children: ReactNode;
}

/**
 * Módulo obrigatório de cada template: metadados + dois shells.
 * Dados vêm só das props (storeProfile, produtos já carregados na página).
 */
export interface StorefrontThemeModule {
  id: StorefrontThemeId;
  label: string;
  ListShell: FC<StorefrontListThemeProps>;
  ProductShell: FC<StorefrontProductThemeProps>;
}

/** Metadados extras para o admin (preview textual / classes). */
export interface StorefrontTemplateAdminMeta {
  id: StorefrontThemeId;
  label: string;
  shortDescription: string;
  /** Classes Tailwind para um bloco de preview (gradiente/mock). */
  previewClassName: string;
}

/** Definição completa: admin + componentes (o registry agrega). */
export interface StorefrontTemplateDefinition extends StorefrontTemplateAdminMeta {
  module: StorefrontThemeModule;
}
