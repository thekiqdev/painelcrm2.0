import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, UserRound } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import {
  addressFieldsPayload,
  companyFieldsPayload,
  initialsFromFullName,
  mapBusinessToForm,
  personalDisplayName,
  splitFullName,
  toBusinessPutPayload,
  type BusinessFormState,
} from '@/lib/profileForm';
import {
  PersonalProfileHeroCard,
  PersonalProfileInfoCard,
  PersonalProfilePreferencesCard,
  type ProfileRoleLabel,
} from '@/components/profile/PersonalProfileCard';
import { ProfileSecurityCard } from '@/components/profile/ProfileSecurityCard';
import { BusinessDataCard } from '@/components/profile/BusinessDataCard';
import { BusinessAddressCard } from '@/components/profile/BusinessAddressCard';
import { BusinessLogoCard } from '@/components/profile/BusinessLogoCard';
import { BusinessProfileHero } from '@/components/profile/BusinessProfileHero';
import { PasswordChangeDialog } from '@/components/profile/PasswordChangeDialog';
import {
  getMeBusinessProfile,
  postMeProfileAvatar,
  putMeBusinessProfile,
  putMeProfile,
} from '@/services/profile';
import {
  deleteCatalogMediaFileByKey,
  extractCatalogOrMediaStorageKeyFromUrl,
  normalizeCatalogMediaUrlForBrowser,
  uploadCatalogImageFile,
} from '@/services/catalogMediaUpload';
import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';

type TabKey = 'personal' | 'business';

function resolveRoleLabel(
  u: { is_super_admin?: boolean; is_tenant_admin?: boolean; can_manage_plan?: boolean } | null,
): ProfileRoleLabel {
  if (u?.is_super_admin) return 'super_admin';
  if (u?.is_tenant_admin || u?.can_manage_plan) return 'admin';
  return 'user';
}

const Profile: React.FC = () => {
  const { refreshUser, signOut, user } = useAuth();
  const { loading, error, data, reload } = useProfile();

  const [tab, setTab] = useState<TabKey>('personal');
  const [pwdOpen, setPwdOpen] = useState(false);
  const [personalEditing, setPersonalEditing] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(false);

  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [locale, setLocale] = useState('');
  const [timezone, setTimezone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [savingPersonal, setSavingPersonal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const canBusiness = data?.can_edit_business_profile === true;
  const personal = data?.personal ?? null;

  const [bizLoading, setBizLoading] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [bizForm, setBizForm] = useState<BusinessFormState | null>(null);
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);

  const roleLabel = resolveRoleLabel(user);
  const mobileStickyPersonal = tab === 'personal' && personalEditing;
  const mobileStickyBusiness = tab === 'business' && editingBusiness;

  useEffect(() => {
    if (!personal) return;
    setFullName(personalDisplayName(personal));
    setWhatsapp(formatPhoneBrDigits(personal.whatsapp_number ?? ''));
    setJobTitle(personal.job_title ?? '');
    setLocale(personal.locale ?? '');
    setTimezone(personal.timezone ?? '');
    setAvatarUrl(personal.avatar_url ? normalizeCatalogMediaUrlForBrowser(personal.avatar_url) : null);
  }, [personal]);

  const resetPersonalFromServer = useCallback(() => {
    if (!personal) return;
    setFullName(personalDisplayName(personal));
    setWhatsapp(formatPhoneBrDigits(personal.whatsapp_number ?? ''));
    setJobTitle(personal.job_title ?? '');
    setLocale(personal.locale ?? '');
    setTimezone(personal.timezone ?? '');
    setAvatarUrl(personal.avatar_url ? normalizeCatalogMediaUrlForBrowser(personal.avatar_url) : null);
  }, [personal]);

  const loadBusiness = useCallback(async () => {
    setBizLoading(true);
    try {
      const res = await getMeBusinessProfile();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const b = res.data?.business;
      if (b) setBizForm(mapBusinessToForm(b));
    } finally {
      setBizLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'business' && canBusiness) void loadBusiness();
  }, [tab, canBusiness, loadBusiness]);

  useEffect(() => {
    if (!canBusiness && tab === 'business') setTab('personal');
  }, [canBusiness, tab]);

  const cancelPersonalEdit = () => {
    resetPersonalFromServer();
    setPersonalEditing(false);
  };

  const onSavePersonal = async () => {
    if (!personal) return;
    if (fullName.trim().length < 2) {
      toast.error('Informe seu nome completo.');
      return;
    }
    const wa = whatsapp.replace(/\D/g, '');
    if (wa.length > 0 && (wa.length < 10 || wa.length > 13)) {
      toast.error('Número de WhatsApp inválido.');
      return;
    }
    const { first_name, last_name } = splitFullName(fullName);
    setSavingPersonal(true);
    try {
      const res = await putMeProfile({
        first_name,
        last_name,
        whatsapp_number: wa || null,
        job_title: jobTitle.trim() || null,
        locale: locale.trim() || null,
        timezone: timezone.trim() || null,
        avatar_url: avatarUrl,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await reload();
      await refreshUser();
      setPersonalEditing(false);
      toast.success('Perfil atualizado.');
    } finally {
      setSavingPersonal(false);
    }
  };

  const onAvatarFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const res = await postMeProfileAvatar(file);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.avatar_url) {
        setAvatarUrl(res.avatar_url);
        await reload();
        await refreshUser();
        toast.success('Foto atualizada.');
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const persistBusiness = async (partial: Parameters<typeof putMeBusinessProfile>[0], msg: string) => {
    const res = await putMeBusinessProfile(partial);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    if (res.data?.business) setBizForm(mapBusinessToForm(res.data.business));
    toast.success(msg);
    return true;
  };

  const onSaveBusinessMerged = async () => {
    if (!bizForm) return;
    setSavingBusiness(true);
    try {
      const merged = { ...companyFieldsPayload(bizForm), ...addressFieldsPayload(bizForm) };
      const ok = await persistBusiness(merged, 'Dados da empresa salvos.');
      if (ok) setEditingBusiness(false);
    } finally {
      setSavingBusiness(false);
    }
  };

  const cancelBusinessEdit = () => {
    setEditingBusiness(false);
    void loadBusiness();
  };

  const uploadTenantLogo = async (file: File, variant: 'light' | 'dark') => {
    if (!bizForm) return;
    const scope = variant === 'light' ? 'tenant_logo_light' : 'tenant_logo_dark';
    const prev = variant === 'light' ? bizForm.logo_light_url : bizForm.logo_dark_url;
    const setU = variant === 'light' ? setUploadingLight : setUploadingDark;
    setU(true);
    try {
      const url = await uploadCatalogImageFile(file, scope, { previousUrl: prev });
      const merged: BusinessFormState = {
        ...bizForm,
        logo_light_url: variant === 'light' ? url : bizForm.logo_light_url,
        logo_dark_url: variant === 'dark' ? url : bizForm.logo_dark_url,
      };
      const ok = await persistBusiness(
        toBusinessPutPayload(merged),
        variant === 'light' ? 'Logo (claro) atualizada.' : 'Logo (escuro) atualizada.',
      );
      if (!ok) return;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no upload');
    } finally {
      setU(false);
    }
  };

  const removeTenantLogo = async (variant: 'light' | 'dark') => {
    if (!bizForm) return;
    const url = variant === 'light' ? bizForm.logo_light_url : bizForm.logo_dark_url;
    if (!url) return;
    const key = extractCatalogOrMediaStorageKeyFromUrl(url);
    if (key) {
      try {
        await deleteCatalogMediaFileByKey(key);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Falha ao remover arquivo');
        return;
      }
    }
    const merged: BusinessFormState = {
      ...bizForm,
      logo_light_url: variant === 'light' ? null : bizForm.logo_light_url,
      logo_dark_url: variant === 'dark' ? null : bizForm.logo_dark_url,
    };
    await persistBusiness(toBusinessPutPayload(merged), 'Logo removida.');
  };

  const heroLogoUrl = bizForm?.logo_light_url || bizForm?.logo_dark_url || null;

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Carregando perfil…</p>
      </div>
    );
  }

  if (error && !data?.personal) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-8">
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o perfil</AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-3">
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => void reload()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!personal) {
    return null;
  }

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-10 pt-6 md:px-6 md:pt-8',
        (mobileStickyPersonal || mobileStickyBusiness) && 'pb-28 md:pb-10',
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Perfil</h1>
        <p className="text-sm text-muted-foreground">Sua identidade e dados da empresa em um só lugar.</p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (v === 'business' && !canBusiness) return;
          setTab(v as TabKey);
        }}
        className="w-full"
      >
        <TabsList
          className={cn(
            'flex h-auto w-full flex-nowrap justify-start gap-1.5 overflow-x-auto rounded-2xl bg-muted/70 p-1.5 md:inline-flex md:w-auto',
          )}
        >
          <TabsTrigger
            value="personal"
            className="min-h-11 shrink-0 rounded-xl px-5 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <UserRound className="mr-2 h-4 w-4 opacity-80" />
            Pessoal
          </TabsTrigger>
          {canBusiness ? (
            <TabsTrigger
              value="business"
              className="min-h-11 shrink-0 rounded-xl px-5 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Building2 className="mr-2 h-4 w-4 opacity-80" />
              Negócio
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="personal" className="mt-6 focus-visible:outline-none">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-6">
            <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
              <PersonalProfileHeroCard
                email={personal.email}
                fullName={fullName}
                jobTitle={jobTitle}
                whatsapp={whatsapp}
                avatarUrl={avatarUrl}
                initials={initialsFromFullName(fullName)}
                uploadingAvatar={uploadingAvatar}
                onAvatarFiles={(files) => void onAvatarFiles(files)}
                onOpenPassword={() => setPwdOpen(true)}
                roleLabel={roleLabel}
              />
            </div>
            <div className="order-2 min-w-0 lg:col-start-2 lg:row-start-1">
              <PersonalProfileInfoCard
                email={personal.email}
                fullName={fullName}
                onFullNameChange={setFullName}
                whatsapp={whatsapp}
                onWhatsappChange={setWhatsapp}
                jobTitle={jobTitle}
                onJobTitleChange={setJobTitle}
                editing={personalEditing}
                saving={savingPersonal}
                onSave={() => void onSavePersonal()}
                onStartEdit={() => setPersonalEditing(true)}
                onCancelEdit={cancelPersonalEdit}
              />
            </div>
            <div className="order-3 min-w-0 lg:col-start-2 lg:row-start-2">
              <PersonalProfilePreferencesCard
                locale={locale}
                onLocaleChange={setLocale}
                timezone={timezone}
                onTimezoneChange={setTimezone}
                editing={personalEditing}
              />
            </div>
            <div className="order-4 min-w-0 lg:col-start-1 lg:row-start-2">
              <ProfileSecurityCard onOpenPassword={() => setPwdOpen(true)} whatsappDigits={whatsapp.replace(/\D/g, '')} />
            </div>
          </div>
        </TabsContent>

        {canBusiness ? (
          <TabsContent value="business" className="mt-6 focus-visible:outline-none">
            {bizLoading || !bizForm ? (
              <div className="flex items-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando dados da empresa…
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-6">
                <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
                  <BusinessProfileHero
                    displayName={bizForm.name}
                    legalName={bizForm.company_legal_name}
                    cnpj={bizForm.cpf_cnpj}
                    logoUrl={heroLogoUrl}
                    tenantStatus={user?.tenant_status}
                    editing={editingBusiness}
                    uploadingLogo={uploadingLight}
                    onStartEdit={() => setEditingBusiness(true)}
                    onCancelEdit={cancelBusinessEdit}
                    onLogoFile={(f) => void uploadTenantLogo(f, 'light')}
                  />
                </div>
                <div className="order-2 min-w-0 lg:col-start-2 lg:row-start-1">
                  <BusinessDataCard form={bizForm} onChange={setBizForm} mode={editingBusiness ? 'edit' : 'view'} />
                </div>
                <div className="order-3 min-w-0 lg:col-start-1 lg:row-start-2">
                  <BusinessLogoCard
                    lightUrl={bizForm.logo_light_url}
                    darkUrl={bizForm.logo_dark_url}
                    uploadingLight={uploadingLight}
                    uploadingDark={uploadingDark}
                    onUpload={(f, v) => void uploadTenantLogo(f, v)}
                    onRemove={(v) => void removeTenantLogo(v)}
                  />
                </div>
                <div className="order-4 min-w-0 lg:col-start-2 lg:row-start-2">
                  <BusinessAddressCard form={bizForm} onChange={setBizForm} mode={editingBusiness ? 'edit' : 'view'} />
                </div>
                {editingBusiness ? (
                  <div className="order-5 hidden items-center justify-end gap-2 pt-2 md:flex lg:col-start-2 lg:row-start-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-xl"
                      disabled={savingBusiness}
                      onClick={cancelBusinessEdit}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      className="h-11 rounded-xl"
                      disabled={savingBusiness}
                      onClick={() => void onSaveBusinessMerged()}
                    >
                      {savingBusiness ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Salvar alterações
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </TabsContent>
        ) : null}
      </Tabs>

      {mobileStickyPersonal ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border/80 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
        >
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 rounded-xl"
            disabled={savingPersonal}
            onClick={cancelPersonalEdit}
          >
            Cancelar
          </Button>
          <Button type="button" className="h-12 flex-1 rounded-xl" disabled={savingPersonal} onClick={() => void onSavePersonal()}>
            {savingPersonal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      ) : null}

      {mobileStickyBusiness && bizForm ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border/80 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
        >
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 rounded-xl"
            disabled={savingBusiness}
            onClick={cancelBusinessEdit}
          >
            Cancelar
          </Button>
          <Button type="button" className="h-12 flex-1 rounded-xl" disabled={savingBusiness} onClick={() => void onSaveBusinessMerged()}>
            {savingBusiness ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar alterações
          </Button>
        </div>
      ) : null}

      <PasswordChangeDialog open={pwdOpen} onOpenChange={setPwdOpen} onSuccess={() => signOut()} />
    </div>
  );
};

export default Profile;
