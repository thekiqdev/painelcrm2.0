import type { FC, ReactNode } from 'react';
import type { StoreProfile } from '@/types/products';

export type StorefrontThemeId = 'default' | 'minimal';

export interface StorefrontListThemeProps {
  storeProfile: StoreProfile;
  bannerUrl: string | null;
  logoUrl: string | null;
  children: ReactNode;
}

export interface StorefrontProductThemeProps {
  storeProfile: StoreProfile;
  children: ReactNode;
}

export interface StorefrontThemeModule {
  id: StorefrontThemeId;
  label: string;
  ListShell: FC<StorefrontListThemeProps>;
  ProductShell: FC<StorefrontProductThemeProps>;
}
