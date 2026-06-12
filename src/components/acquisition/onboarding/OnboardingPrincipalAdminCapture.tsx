import { useCallback, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { prepareOnboardingAvatarDataUrl } from '@/lib/onboardingAvatarImage';
import { activationInputClass } from './activationAppStyles';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  avatarUrl: string | null;
  onAvatarChange: (url: string | null) => void;
  onChange: (patch: {
    lead_name?: string;
    lead_email?: string;
    signup_password?: string;
    signup_password_confirm?: string;
  }) => void;
};

function AdminAvatarPicker({
  avatarUrl,
  uploadingAvatar,
  onFile,
  showUploadHint = true,
}: {
  avatarUrl: string | null;
  uploadingAvatar: boolean;
  onFile: (file: File) => void;
  showUploadHint?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <label
        className={cn(
          'group relative flex h-[100px] w-[100px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition-all lg:h-[120px] lg:w-[120px]',
          avatarUrl
            ? 'border-primary/35 border-solid shadow-[0_0_32px_-10px_hsl(var(--primary)/0.45)]'
            : 'border-dashed border-white/18 bg-white/[0.03] hover:border-primary/30',
        )}
      >
        {uploadingAvatar ? (
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        ) : avatarUrl ? (
          <>
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              Alterar
            </span>
          </>
        ) : (
          <Plus className="h-7 w-7 text-primary/85" strokeWidth={2.5} />
        )}
        <input
          type="file"
          accept={ACCEPTED.join(',')}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </label>
      {showUploadHint && !avatarUrl && !uploadingAvatar ? (
        <p className="mt-3 text-center text-xs text-muted-foreground lg:mt-2">Enviar foto</p>
      ) : null}
    </div>
  );
}

function AdminFields({
  name,
  email,
  password,
  confirmPassword,
  onChange,
  autoFocus,
}: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  onChange: Props['onChange'];
  autoFocus?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="space-y-1">
        <Label htmlFor="admin-full-name" className="text-sm text-muted-foreground">
          Nome completo
        </Label>
        <Input
          id="admin-full-name"
          className={cn(activationInputClass, 'w-full')}
          value={name}
          onChange={(e) => onChange({ lead_name: e.target.value })}
          placeholder="Nome do responsável"
          autoComplete="name"
          autoFocus={autoFocus}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="admin-email" className="text-sm text-muted-foreground">
          E-mail
        </Label>
        <Input
          id="admin-email"
          type="email"
          className={cn(activationInputClass, 'w-full')}
          value={email}
          onChange={(e) => onChange({ lead_email: e.target.value })}
          placeholder="voce@empresa.com"
          autoComplete="email"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="admin-password" className="text-sm text-muted-foreground">
          Senha
        </Label>
        <Input
          id="admin-password"
          type="password"
          className={cn(activationInputClass, 'w-full')}
          value={password}
          onChange={(e) => onChange({ signup_password: e.target.value })}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="admin-password-confirm" className="text-sm text-muted-foreground">
          Confirmar senha
        </Label>
        <Input
          id="admin-password-confirm"
          type="password"
          className={cn(activationInputClass, 'w-full')}
          value={confirmPassword}
          onChange={(e) => onChange({ signup_password_confirm: e.target.value })}
          placeholder="Repita a senha"
          autoComplete="new-password"
        />
      </div>
    </div>
  );
}

export function OnboardingPrincipalAdminCapture({
  name,
  email,
  password,
  confirmPassword,
  avatarUrl,
  onAvatarChange,
  onChange,
}: Props) {
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const onFile = useCallback(
    async (file: File) => {
      if (uploadingAvatar) return;
      if (!ACCEPTED.includes(file.type)) {
        toast.error('Use JPG, PNG ou WebP.');
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error('Imagem muito grande. Máximo 5 MB.');
        return;
      }
      setUploadingAvatar(true);
      try {
        const url = await prepareOnboardingAvatarDataUrl(file);
        if (!url) {
          toast.error('Não foi possível processar a imagem. Tente outro arquivo.');
          return;
        }
        onAvatarChange(url);
      } catch {
        toast.error('Não foi possível processar a imagem.');
      } finally {
        setUploadingAvatar(false);
      }
    },
    [onAvatarChange, uploadingAvatar],
  );

  const handleFile = (file: File) => {
    void onFile(file);
  };

  return (
    <div className="min-w-0 w-full">
      <div className="flex w-full flex-col gap-5 lg:hidden">
        <div className="flex w-full flex-col items-center gap-3">
          <Label className="text-sm text-muted-foreground">Foto do administrador</Label>
          <AdminAvatarPicker
            avatarUrl={avatarUrl}
            uploadingAvatar={uploadingAvatar}
            onFile={handleFile}
            showUploadHint={false}
          />
          {!avatarUrl && !uploadingAvatar ? (
            <p className="text-center text-xs text-muted-foreground">Enviar foto</p>
          ) : null}
        </div>
        <div className="w-full">
          <AdminFields
            name={name}
            email={email}
            password={password}
            confirmPassword={confirmPassword}
            onChange={onChange}
            autoFocus
          />
        </div>
      </div>

      <div className="hidden min-w-0 lg:grid lg:grid-cols-[160px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="flex flex-col items-center gap-1.5 pt-0.5">
          <Label className="text-center text-sm text-muted-foreground">Foto do administrador</Label>
          <AdminAvatarPicker avatarUrl={avatarUrl} uploadingAvatar={uploadingAvatar} onFile={handleFile} />
        </div>
        <AdminFields
          name={name}
          email={email}
          password={password}
          confirmPassword={confirmPassword}
          onChange={onChange}
          autoFocus
        />
      </div>
    </div>
  );
}
