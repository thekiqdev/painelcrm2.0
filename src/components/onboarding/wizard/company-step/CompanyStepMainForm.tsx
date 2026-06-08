import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CompanyOperationPreview } from './CompanyOperationPreview';
import { CompanyLogoUpload } from './CompanyLogoUpload';
import { CompanySlugField } from './CompanySlugField';
import type { SlugCheckState } from '@/hooks/useOperationalSlugCheck';

type Props = {
  layout: 'mobile' | 'desktop';
  companyName: string;
  slug: string;
  slugCheck: SlugCheckState;
  logoLight: string | null;
  logoDark: string | null;
  uploadingLogo: 'light' | 'dark' | null;
  acceptedImageTypes: string[];
  onCompanyNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onUseSlugSuggestion: (suggestion: string) => void;
  onLogoUpload: (file: File, variant: 'light' | 'dark') => void;
};

export function CompanyStepMainForm({
  layout,
  companyName,
  slug,
  slugCheck,
  logoLight,
  logoDark,
  uploadingLogo,
  acceptedImageTypes,
  onCompanyNameChange,
  onSlugChange,
  onUseSlugSuggestion,
  onLogoUpload,
}: Props) {
  const isMobile = layout === 'mobile';

  return (
    <div className={isMobile ? 'space-y-3.5' : 'space-y-4'}>
      {!isMobile ? (
        <header className="space-y-0.5">
          <h1 className="font-display text-[1.625rem] font-semibold tracking-tight text-foreground">
            Identidade da sua operação
          </h1>
          <p className="text-sm text-muted-foreground">Como sua empresa aparece no workspace.</p>
        </header>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="company-name" className="text-sm text-muted-foreground">
          Nome da operação
        </Label>
        <Input
          id="company-name"
          value={companyName}
          onChange={(e) => onCompanyNameChange(e.target.value)}
          placeholder="Ex.: Clínica Horizonte"
          className="h-11 border-white/10 bg-white/[0.03] text-base lg:h-12"
        />
      </div>

      <CompanySlugField
        slug={slug}
        slugCheck={slugCheck}
        onSlugChange={onSlugChange}
        onUseSuggestion={onUseSlugSuggestion}
      />

      <div className="space-y-1.5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Fundo escuro</Label>
            <CompanyLogoUpload
              logoUrl={logoDark}
              uploading={uploadingLogo === 'dark'}
              acceptedTypes={acceptedImageTypes}
              onUpload={(file) => onLogoUpload(file, 'dark')}
              hint="Usada no painel escuro do sistema."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Fundo claro</Label>
            <CompanyLogoUpload
              logoUrl={logoLight}
              uploading={uploadingLogo === 'light'}
              acceptedTypes={acceptedImageTypes}
              onUpload={(file) => onLogoUpload(file, 'light')}
              hint="Usada em fundos claros, PDFs e documentos."
              surface="light"
            />
          </div>
        </div>
      </div>

      <CompanyOperationPreview
        name={companyName}
        logoDark={logoDark}
        logoLight={logoLight}
        compact={isMobile}
      />
    </div>
  );
}
