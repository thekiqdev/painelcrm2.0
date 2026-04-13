import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StoreProfile, StorefrontThemeKey } from "@/types/products";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";
import { uploadCatalogImageFile } from "@/services/catalogMediaUpload";
import { STOREFRONT_THEME_OPTIONS } from "@/themes/registry";
import { ImageIcon, Trash2, Upload } from "lucide-react";

export function generateStoreSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

interface StoreSettingsFormProps {
  storeProfile: StoreProfile | null;
  onSuccess: (profile: StoreProfile) => void;
}

export const StoreSettingsForm = ({ storeProfile, onSuccess }: StoreSettingsFormProps) => {
  const [formData, setFormData] = useState({
    store_name: "",
    store_description: "",
    store_slug: "",
    contact_phone: "",
    contact_email: "",
    contact_whatsapp: "",
    is_active: true,
  });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [themeKey, setThemeKey] = useState<StorefrontThemeKey>("default");
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (storeProfile) {
      setFormData({
        store_name: storeProfile.store_name || "",
        store_description: storeProfile.store_description || "",
        store_slug: storeProfile.store_slug || "",
        contact_phone: storeProfile.contact_phone || "",
        contact_email: storeProfile.contact_email || "",
        contact_whatsapp: storeProfile.contact_whatsapp || "",
        is_active: storeProfile.is_active,
      });
      setLogoUrl(storeProfile.store_logo?.trim() || null);
      setBannerUrl(storeProfile.store_banner_url?.trim() || null);
      const tk = storeProfile.theme_key;
      setThemeKey(tk === "minimal" ? "minimal" : "default");
    } else {
      setFormData({
        store_name: "",
        store_description: "",
        store_slug: "",
        contact_phone: "",
        contact_email: "",
        contact_whatsapp: "",
        is_active: true,
      });
      setLogoUrl(null);
      setBannerUrl(null);
      setThemeKey("default");
    }
  }, [storeProfile]);

  const handleStoreNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      store_name: name,
      store_slug: prev.store_slug || generateStoreSlug(name),
    }));
  };

  const handleImageUpload = async (
    file: File | undefined,
    scope: "store_logo" | "store_banner",
    setBusy: (v: boolean) => void,
    setUrl: (u: string | null) => void
  ) => {
    if (!file) return;
    try {
      setBusy(true);
      const url = await uploadCatalogImageFile(file, scope);
      setUrl(url);
      toast({ title: "Upload concluído" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no upload";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const buildPayload = () => ({
    ...formData,
    store_logo: logoUrl || null,
    store_banner_url: bannerUrl || null,
    theme_key: themeKey,
    theme_options: {},
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.store_name.trim()) {
      toast({
        title: "Erro",
        description: "Nome da loja é obrigatório",
        variant: "destructive",
      });
      return;
    }

    if (!formData.store_slug.trim()) {
      toast({
        title: "Erro",
        description: "URL da loja é obrigatória",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const payload = buildPayload();

      let result: StoreProfile;
      if (storeProfile) {
        result = await productsService.updateStoreProfile(payload);
      } else {
        result = await productsService.createStoreProfile(
          payload as Omit<StoreProfile, "id" | "user_id" | "created_at" | "updated_at">
        );
      }

      toast({
        title: "Sucesso",
        description: storeProfile ? "Loja atualizada com sucesso" : "Loja criada com sucesso",
      });

      onSuccess(result);
    } catch (error: unknown) {
      console.error("Erro ao salvar loja:", error);
      let message = "Não foi possível salvar a configuração da loja";
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes("duplicate key") || errMsg.includes("unique constraint")) {
        message = "Esta URL de loja já está sendo utilizada. Escolha outra.";
      }
      toast({
        title: "Erro",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Identidade visual</h3>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Logo da loja</Label>
            <div className="flex flex-wrap items-center gap-2">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain border rounded p-1" />
              ) : (
                <div className="h-16 w-24 border border-dashed rounded flex items-center justify-center text-xs text-muted-foreground">
                  Sem logo
                </div>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) =>
                  handleImageUpload(e.target.files?.[0], "store_logo", setUploadingLogo, setLogoUrl)
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1" />
                {uploadingLogo ? "Enviando…" : logoUrl ? "Trocar" : "Enviar"}
              </Button>
              {logoUrl ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Banner da loja</Label>
            <div className="space-y-2">
              {bannerUrl ? (
                <img src={bannerUrl} alt="" className="w-full max-h-24 object-cover rounded border" />
              ) : (
                <div className="h-20 border border-dashed rounded flex items-center justify-center text-xs text-muted-foreground">
                  Sem banner
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) =>
                    handleImageUpload(
                      e.target.files?.[0],
                      "store_banner",
                      setUploadingBanner,
                      setBannerUrl
                    )
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingBanner}
                  onClick={() => bannerInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {uploadingBanner ? "Enviando…" : bannerUrl ? "Trocar" : "Enviar"}
                </Button>
                {bannerUrl ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setBannerUrl(null)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Tema da vitrine</Label>
        <Select value={themeKey} onValueChange={(v) => setThemeKey(v as StorefrontThemeKey)}>
          <SelectTrigger className="max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STOREFRONT_THEME_OPTIONS.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Novos layouts podem ser adicionados ao sistema via atualização (código versionado).
        </p>
      </div>

      <div className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Dados e URL
        </h3>
        <div>
          <Label htmlFor="store_name">Nome da Loja *</Label>
          <Input
            id="store_name"
            value={formData.store_name}
            onChange={(e) => handleStoreNameChange(e.target.value)}
            placeholder="Minha Loja"
            required
          />
        </div>

        <div>
          <Label htmlFor="store_slug">URL da Loja *</Label>
          <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap">
            <span className="text-sm text-muted-foreground shrink-0">{window.location.origin}/</span>
            <Input
              id="store_slug"
              value={formData.store_slug}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, store_slug: generateStoreSlug(e.target.value) }))
              }
              placeholder="minha-loja"
              className="min-w-0 flex-1"
              required
            />
            <span className="text-sm text-muted-foreground shrink-0">/loja</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Esta será a URL pública da sua loja</p>
        </div>

        <div>
          <Label htmlFor="store_description">Descrição da Loja</Label>
          <Textarea
            id="store_description"
            value={formData.store_description}
            onChange={(e) => setFormData((prev) => ({ ...prev, store_description: e.target.value }))}
            placeholder="Descreva sua loja..."
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="contact_phone">Telefone</Label>
            <Input
              id="contact_phone"
              value={formData.contact_phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, contact_phone: e.target.value }))}
              placeholder="(11) 99999-9999"
            />
          </div>

          <div>
            <Label htmlFor="contact_whatsapp">WhatsApp</Label>
            <Input
              id="contact_whatsapp"
              value={formData.contact_whatsapp}
              onChange={(e) => setFormData((prev) => ({ ...prev, contact_whatsapp: e.target.value }))}
              placeholder="(11) 99999-9999"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="contact_email">E-mail</Label>
          <Input
            id="contact_email"
            type="email"
            value={formData.contact_email}
            onChange={(e) => setFormData((prev) => ({ ...prev, contact_email: e.target.value }))}
            placeholder="contato@minhaloja.com"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label htmlFor="is_active">Loja Ativa</Label>
            <p className="text-sm text-muted-foreground">Permitir acesso público à loja</p>
          </div>
          <Switch
            id="is_active"
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Salvando..." : storeProfile ? "Salvar alterações" : "Criar loja"}
        </Button>
      </div>
    </form>
  );
};
