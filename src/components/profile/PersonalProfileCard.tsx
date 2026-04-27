import React, { useRef } from 'react';
import {
  Briefcase,
  Camera,
  Clock,
  Globe,
  Loader2,
  Mail,
  Pencil,
  Phone,
  User,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';
import { getPersonalProfileCompletion } from '@/lib/profileForm';

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border/50 bg-background/80 px-4 py-3 shadow-sm/50">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-semibold leading-snug text-foreground">{value || '—'}</p>
      </div>
    </div>
  );
}

export type ProfileRoleLabel = 'super_admin' | 'admin' | 'user';

export type PersonalProfileHeroProps = {
  email: string;
  fullName: string;
  jobTitle: string;
  whatsapp: string;
  avatarUrl: string | null;
  initials: string;
  uploadingAvatar: boolean;
  onAvatarFiles: (files: FileList | null) => void;
  onOpenPassword: () => void;
  roleLabel: ProfileRoleLabel;
};

export type PersonalProfileInfoCardProps = {
  email: string;
  fullName: string;
  onFullNameChange: (v: string) => void;
  whatsapp: string;
  onWhatsappChange: (v: string) => void;
  jobTitle: string;
  onJobTitleChange: (v: string) => void;
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
};

export type PersonalProfilePreferencesCardProps = {
  locale: string;
  onLocaleChange: (v: string) => void;
  timezone: string;
  onTimezoneChange: (v: string) => void;
  editing: boolean;
};

function roleBadge(role: ProfileRoleLabel) {
  if (role === 'super_admin') {
    return (
      <Badge className="border-violet-500/30 bg-violet-500/15 font-medium text-violet-700 dark:text-violet-300">
        Super Admin
      </Badge>
    );
  }
  if (role === 'admin') {
    return (
      <Badge className="border-primary/30 bg-primary/10 font-medium text-primary">
        Administrador
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-medium">
      Usuário
    </Badge>
  );
}

/** Hero premium: em `lg:` assume coluna estreita (grid esquerdo) — layout vertical centrado. */
export function PersonalProfileHeroCard({
  email,
  fullName,
  jobTitle,
  whatsapp,
  avatarUrl,
  initials,
  uploadingAvatar,
  onAvatarFiles,
  onOpenPassword,
  roleLabel,
}: PersonalProfileHeroProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const waDigits = whatsapp.replace(/\D/g, '');
  const { complete, percent } = getPersonalProfileCompletion({
    fullName,
    email,
    whatsappDigits: waDigits,
    avatarUrl,
    jobTitle,
  });
  const hasWhatsappForPwd = waDigits.length >= 10 && waDigits.length <= 13;
  const secureAccount = hasWhatsappForPwd;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/[0.07] via-background to-muted/40 p-6 shadow-sm',
        'md:p-8 lg:p-6',
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <div
        className={cn(
          'relative flex flex-col items-center gap-6',
          'md:flex-row md:items-start md:gap-8 md:text-left',
          'lg:flex-col lg:items-center lg:gap-5 lg:text-center',
        )}
      >
        <div className="relative shrink-0">
          <Avatar
            className={cn(
              'h-28 w-28 border-[3px] border-background shadow-lg ring-2 ring-border/80',
              'md:h-32 md:w-32',
              'lg:h-36 lg:w-36',
              uploadingAvatar && 'opacity-70',
            )}
          >
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" className="object-cover" /> : null}
            <AvatarFallback className="bg-muted text-2xl font-semibold text-muted-foreground">{initials}</AvatarFallback>
          </Avatar>
          <button
            type="button"
            disabled={uploadingAvatar}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-md transition hover:bg-primary/90',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
            aria-label="Trocar foto"
          >
            {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              onAvatarFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center text-center',
            'md:items-start md:text-left',
            'lg:items-center lg:text-center',
          )}
        >
          <div
            className={cn(
              'mb-3 flex flex-wrap items-center justify-center gap-2',
              'md:justify-start',
              'lg:justify-center',
            )}
          >
            {roleBadge(roleLabel)}
            <Badge variant={complete ? 'default' : 'outline'} className="font-normal">
              {complete ? 'Perfil completo' : 'Complete seu perfil'}
            </Badge>
            <Badge
              variant={secureAccount ? 'secondary' : 'outline'}
              className={cn('font-normal', secureAccount && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200')}
            >
              {secureAccount ? 'Conta segura' : 'Reforce sua conta'}
            </Badge>
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{fullName.trim() || 'Seu nome'}</h2>
          <p className="mt-1 break-all text-sm text-muted-foreground">{email}</p>
          {jobTitle.trim() ? (
            <p className="mt-1 text-sm font-medium text-foreground/90">{jobTitle.trim()}</p>
          ) : (
            <p className="mt-1 text-sm italic text-muted-foreground">Cargo não informado</p>
          )}

          {!complete ? (
            <div className="mt-4 w-full max-w-md space-y-2 lg:max-w-full">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Completude do perfil</span>
                <span className="font-medium tabular-nums text-foreground">{percent}%</span>
              </div>
              <Progress value={percent} className="h-2" />
            </div>
          ) : null}

          <div
            className={cn(
              'mt-5 flex w-full max-w-md flex-col gap-2',
              'sm:max-w-none sm:flex-row sm:flex-wrap',
              'md:justify-start',
              'lg:max-w-full lg:grid lg:grid-cols-2 lg:gap-2',
            )}
          >
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full rounded-xl sm:w-auto lg:w-full"
              disabled={uploadingAvatar}
              onClick={() => fileRef.current?.click()}
            >
              {uploadingAvatar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Trocar foto
            </Button>
            <Button type="button" variant="outline" className="h-11 w-full rounded-xl sm:w-auto lg:w-full" onClick={onOpenPassword}>
              Alterar senha
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground md:text-left lg:text-center">
            PNG, JPG, WebP ou GIF · até o limite do catálogo
          </p>
        </div>
      </div>
    </div>
  );
}

export function PersonalProfileInfoCard({
  email,
  fullName,
  onFullNameChange,
  whatsapp,
  onWhatsappChange,
  jobTitle,
  onJobTitleChange,
  editing,
  saving,
  onSave,
  onStartEdit,
  onCancelEdit,
}: PersonalProfileInfoCardProps) {
  const waDisplay = formatPhoneBrDigits(whatsapp) || '—';

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold">Informações pessoais</CardTitle>
        <div
          className={cn(
            'flex w-full flex-col gap-2 sm:w-auto sm:flex-row',
            editing && 'hidden md:flex',
          )}
        >
          {editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 w-full rounded-xl sm:w-auto"
                disabled={saving}
                onClick={onCancelEdit}
              >
                Cancelar
              </Button>
              <Button type="button" size="sm" className="h-10 w-full rounded-xl sm:w-auto" disabled={saving} onClick={onSave}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar alterações
              </Button>
            </>
          ) : (
            <Button type="button" variant="default" size="sm" className="h-10 w-full rounded-xl sm:w-auto" onClick={onStartEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar perfil
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {editing ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="profile-name">Nome</Label>
              <Input
                id="profile-name"
                value={fullName}
                onChange={(e) => onFullNameChange(e.target.value)}
                autoComplete="name"
                className="h-12 rounded-xl text-base sm:text-sm"
                placeholder="Seu nome completo"
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="profile-email">E-mail</Label>
              <Input id="profile-email" value={email} disabled className="h-12 rounded-xl bg-muted/50 text-base sm:text-sm" />
              <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado nesta tela.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-wa">WhatsApp</Label>
              <Input
                id="profile-wa"
                value={whatsapp}
                onChange={(e) => onWhatsappChange(formatPhoneBrDigits(e.target.value))}
                inputMode="tel"
                autoComplete="tel"
                placeholder="(00) 00000-0000"
                className="h-12 rounded-xl text-base sm:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-job">Cargo / função</Label>
              <Input
                id="profile-job"
                value={jobTitle}
                onChange={(e) => onJobTitleChange(e.target.value)}
                className="h-12 rounded-xl text-base sm:text-sm"
                placeholder="Opcional"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow icon={User} label="Nome" value={fullName.trim()} />
            <InfoRow icon={Mail} label="E-mail" value={email} />
            <InfoRow icon={Phone} label="WhatsApp" value={waDisplay} />
            <InfoRow icon={Briefcase} label="Cargo / função" value={jobTitle.trim() || '—'} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PersonalProfilePreferencesCard({
  locale,
  onLocaleChange,
  timezone,
  onTimezoneChange,
  editing,
}: PersonalProfilePreferencesCardProps) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Preferências</CardTitle>
        <p className="text-sm text-muted-foreground">Idioma e fuso horário (opcional).</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-locale">Idioma (locale)</Label>
              <Input
                id="profile-locale"
                value={locale}
                onChange={(e) => onLocaleChange(e.target.value)}
                placeholder="pt-BR"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-tz">Fuso horário</Label>
              <Input
                id="profile-tz"
                value={timezone}
                onChange={(e) => onTimezoneChange(e.target.value)}
                placeholder="America/Sao_Paulo"
                className="h-11 rounded-xl"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow icon={Globe} label="Idioma" value={locale.trim() || 'Padrão do sistema'} />
            <InfoRow icon={Clock} label="Fuso horário" value={timezone.trim() || 'Padrão do sistema'} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
