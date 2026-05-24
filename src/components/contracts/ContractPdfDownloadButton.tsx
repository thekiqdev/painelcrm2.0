import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ContractPdfDownloadButtonProps = {
  label: string;
  onDownload: () => Promise<void>;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  prominent?: boolean;
};

export function ContractPdfDownloadButton({
  label,
  onDownload,
  variant = 'default',
  size = 'default',
  className,
  prominent = false,
}: ContractPdfDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={loading}
      className={cn(
        prominent && 'gap-2 shadow-md font-semibold',
        prominent && variant === 'default' && 'bg-primary hover:bg-primary/90',
        className,
      )}
      onClick={() => {
        setLoading(true);
        void onDownload().finally(() => setLoading(false));
      }}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className={cn('h-4 w-4', prominent && 'h-5 w-5')} />
      )}
      {label}
    </Button>
  );
}
