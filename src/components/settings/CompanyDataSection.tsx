import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsSectionProps } from './types';
import { getMyTenantCompany, putMyTenantCompany } from '@/services/tenantCompany';
import { uploadCatalogImageFile } from '@/services/catalogMediaUpload';
import { toast } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';
import { useTenantBrand } from '@/contexts/TenantBrandContext';
import { normalizeCatalogMediaUrlForBrowser } from '@/services/catalogMediaUpload';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';

const empty = '';

export const CompanyDataSection: React.FC<SettingsSectionProps> = () => {
  const { refresh: refreshBrand } = useTenantBrand();
  const { canEdit } = useModulePermissions();
  const canSave = canEdit('settings');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(empty);
  const [cpfCnpj, setCpfCnpj] = useState(empty);
  const [phone, setPhone] = useState(empty);
  const [whatsapp, setWhatsapp] = useState(empty);
  const [address, setAddress] = useState(empty);
  const [city, setCity] = useState(empty);
  const [state, setState] = useState(empty);
  const [zipCode, setZipCode] = useState(empty);
  const [logoLightUrl, setLogoLightUrl] = useState<string | null>(null);
  const [logoDarkUrl, setLogoDarkUrl] = useState<string | null>(null);
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);

  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyTenantCompany();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const d = res.data;
      if (!d) return;
      setName(d.name ?? empty);
      setCpfCnpj(d.cpf_cnpj ?? empty);
      setPhone(d.billing_phone ?? empty);
      setWhatsapp(d.company_whatsapp ?? empty);
      setAddress(d.company_address_line ?? empty);
      setCity(d.company_city ?? empty);
      setState(d.company_state ?? empty);
      setZipCode(d.company_postal_code ?? empty);
      const lightRaw = d.logo_light_url?.trim() || '';
      const darkRaw = d.logo_dark_url?.trim() || '';
      setLogoLightUrl(lightRaw ? normalizeCatalogMediaUrlForBrowser(lightRaw) : null);
      setLogoDarkUrl(darkRaw ? normalizeCatalogMediaUrlForBrowser(darkRaw) : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadLogo = async (file: File, variant: 'light' | 'dark') => {
    const scope = variant === 'light' ? 'tenant_logo_light' : 'tenant_logo_dark';
    const setUpload = variant === 'light' ? setUploadingLight : setUploadingDark;
    setUpload(true);
    try {
      const url = await uploadCatalogImageFile(file, scope);
      if (variant === 'light') setLogoLightUrl(url);
      else setLogoDarkUrl(url);
      toast.success(variant === 'light' ? 'Logo (tema claro) carregada.' : 'Logo (tema escuro) carregada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no upload');
    } finally {
      setUpload(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      toast.error('Sem permissão para alterar configurações.');
      return;
    }
    setSaving(true);
    try {
      const res = await putMyTenantCompany({
        name: name.trim(),
        cpf_cnpj: cpfCnpj.trim() || null,
        billing_phone: phone.trim() || null,
        company_whatsapp: whatsapp.trim() || null,
        company_address_line: address.trim() || null,
        company_city: city.trim() || null,
        company_state: state.trim() || null,
        company_postal_code: zipCode.trim() || null,
        logo_light_url: logoLightUrl,
        logo_dark_url: logoDarkUrl,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Dados da empresa salvos.');
      await refreshBrand();
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar dados…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da Empresa</CardTitle>
        <CardDescription>Configure as informações da sua empresa</CardDescription>
      </CardHeader>
      <CardContent>
        <form id="company-data-form" className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="companyName">Nome da Empresa</Label>
            <Input
              id="companyName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da sua empresa"
              required
              disabled={!canSave}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ/CPF</Label>
            <Input
              id="cnpj"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              placeholder="XX.XXX.XXX/XXXX-XX"
              disabled={!canSave}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(XX) XXXX-XXXX"
                disabled={!canSave}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(XX) XXXXX-XXXX"
                disabled={!canSave}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Endereço completo"
              disabled={!canSave}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" disabled={!canSave} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">Estado</Label>
              <Input id="state" value={state} onChange={(e) => setState(e.target.value)} placeholder="Estado" disabled={!canSave} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">CEP</Label>
              <Input
                id="zipCode"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="XXXXX-XXX"
                disabled={!canSave}
              />
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Logo para tema claro</Label>
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center">
                <input
                  ref={lightInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    ev.target.value = '';
                    if (f) void uploadLogo(f, 'light');
                  }}
                />
                {logoLightUrl ? (
                  <div className="mb-3 flex justify-center">
                    <img src={logoLightUrl} alt="Logo tema claro" className="max-h-20 max-w-full object-contain" />
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canSave || uploadingLight}
                  onClick={() => lightInputRef.current?.click()}
                >
                  {uploadingLight ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {logoLightUrl ? 'Substituir' : 'Enviar'} logo
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">PNG, JPG, WebP ou GIF (máx. sugerido 2&nbsp;MB)</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Logo para tema escuro</Label>
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center">
                <input
                  ref={darkInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    ev.target.value = '';
                    if (f) void uploadLogo(f, 'dark');
                  }}
                />
                {logoDarkUrl ? (
                  <div className="mb-3 flex justify-center rounded-md bg-muted/80 p-2">
                    <img src={logoDarkUrl} alt="Logo tema escuro" className="max-h-20 max-w-full object-contain" />
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canSave || uploadingDark}
                  onClick={() => darkInputRef.current?.click()}
                >
                  {uploadingDark ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {logoDarkUrl ? 'Substituir' : 'Enviar'} logo
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">Recomendado: versão clara/contrastada para fundos escuros</p>
              </div>
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <Button type="submit" form="company-data-form" disabled={!canSave || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar alterações
        </Button>
        {!canSave ? (
          <p className="ml-4 text-sm text-muted-foreground">A sua função não permite editar configurações.</p>
        ) : null}
      </CardFooter>
    </Card>
  );
};
