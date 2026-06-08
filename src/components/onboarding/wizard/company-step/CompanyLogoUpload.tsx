import { Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  logoUrl: string | null;
  uploading?: boolean;
  acceptedTypes: string[];
  onUpload: (file: File) => void;
  hint?: string;
  surface?: 'dark' | 'light';
};

export function CompanyLogoUpload({
  logoUrl,
  uploading,
  acceptedTypes,
  onUpload,
  hint,
  surface = 'dark',
}: Props) {
  const isLight = surface === 'light';

  return (
    <div className="space-y-1.5">
      <label
        className={cn(
          'group relative flex h-[68px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-all lg:h-[72px]',
          logoUrl
            ? isLight
              ? 'border-primary/30 bg-white'
              : 'border-primary/30 bg-[hsl(228,32%,6%)]'
            : isLight
              ? 'border-black/12 bg-white/[0.96] hover:border-primary/25 hover:bg-white'
              : 'border-white/12 bg-white/[0.02] hover:border-primary/25 hover:bg-white/[0.03]',
        )}
      >
        {uploading ? (
          <Loader2 className={cn('h-5 w-5 animate-spin text-primary', isLight && 'text-primary')} />
        ) : logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-2" />
        ) : (
          <div
            className={cn(
              'flex flex-col items-center gap-1',
              isLight ? 'text-[hsl(228,20%,42%)]' : 'text-muted-foreground',
            )}
          >
            <Upload className="h-5 w-5 group-hover:text-primary/80" />
            <span className="text-[10px]">Enviar logo</span>
          </div>
        )}
        <input
          type="file"
          accept={acceptedTypes.join(',')}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
        />
      </label>
      {hint ? <p className="text-[10px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
