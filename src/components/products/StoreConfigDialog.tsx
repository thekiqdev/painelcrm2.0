import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Store } from "lucide-react";
import { StoreProfile } from "@/types/products";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";

interface StoreConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeProfile?: StoreProfile | null;
  onSuccess: (profile: StoreProfile) => void;
}

export const StoreConfigDialog = ({ open, onOpenChange, storeProfile, onSuccess }: StoreConfigDialogProps) => {
  const [formData, setFormData] = useState({
    store_name: '',
    store_description: '',
    store_slug: '',
    contact_phone: '',
    contact_email: '',
    contact_whatsapp: '',
    is_active: true
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (storeProfile) {
      setFormData({
        store_name: storeProfile.store_name || '',
        store_description: storeProfile.store_description || '',
        store_slug: storeProfile.store_slug || '',
        contact_phone: storeProfile.contact_phone || '',
        contact_email: storeProfile.contact_email || '',
        contact_whatsapp: storeProfile.contact_whatsapp || '',
        is_active: storeProfile.is_active
      });
    } else {
      setFormData({
        store_name: '',
        store_description: '',
        store_slug: '',
        contact_phone: '',
        contact_email: '',
        contact_whatsapp: '',
        is_active: true
      });
    }
  }, [storeProfile, open]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  };

  const handleStoreNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      store_name: name,
      store_slug: prev.store_slug || generateSlug(name)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.store_name.trim()) {
      toast({
        title: "Erro",
        description: "Nome da loja é obrigatório",
        variant: "destructive"
      });
      return;
    }

    if (!formData.store_slug.trim()) {
      toast({
        title: "Erro",
        description: "URL da loja é obrigatória",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      
      let result;
      if (storeProfile) {
        result = await productsService.updateStoreProfile(formData);
      } else {
        result = await productsService.createStoreProfile(formData);
      }
      
      toast({
        title: "Sucesso",
        description: storeProfile ? "Loja atualizada com sucesso" : "Loja criada com sucesso"
      });
      
      onSuccess(result);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro ao salvar loja:', error);
      let message = "Não foi possível salvar a configuração da loja";
      
      if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        message = "Esta URL de loja já está sendo utilizada. Escolha outra.";
      }
      
      toast({
        title: "Erro",
        description: message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            {storeProfile ? 'Configurar Loja' : 'Criar Loja Virtual'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="flex items-center">
              <span className="text-sm text-muted-foreground mr-1">{window.location.origin}/</span>
              <Input
                id="store_slug"
                value={formData.store_slug}
                onChange={(e) => setFormData(prev => ({ ...prev, store_slug: generateSlug(e.target.value) }))}
                placeholder="minha-loja"
                className="flex-1"
                required
              />
              <span className="text-sm text-muted-foreground ml-1">/loja</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Esta será a URL pública da sua loja
            </p>
          </div>

          <div>
            <Label htmlFor="store_description">Descrição da Loja</Label>
            <Textarea
              id="store_description"
              value={formData.store_description}
              onChange={(e) => setFormData(prev => ({ ...prev, store_description: e.target.value }))}
              placeholder="Descreva sua loja..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contact_phone">Telefone</Label>
              <Input
                id="contact_phone"
                value={formData.contact_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div>
              <Label htmlFor="contact_whatsapp">WhatsApp</Label>
              <Input
                id="contact_whatsapp"
                value={formData.contact_whatsapp}
                onChange={(e) => setFormData(prev => ({ ...prev, contact_whatsapp: e.target.value }))}
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
              onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
              placeholder="contato@minhaloja.com"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="is_active">Loja Ativa</Label>
              <p className="text-sm text-muted-foreground">
                Permitir acesso público à loja
              </p>
            </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : (storeProfile ? 'Atualizar' : 'Criar Loja')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};