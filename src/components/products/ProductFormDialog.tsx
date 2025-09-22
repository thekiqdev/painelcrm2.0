import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Wrench, ArrowLeft, ArrowRight, Plus, X } from "lucide-react";
import { Product, ProductFormData, ProductFormStep } from "@/types/products";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSuccess: () => void;
}

export const ProductFormDialog = ({ open, onOpenChange, product, onSuccess }: ProductFormDialogProps) => {
  const [currentStep, setCurrentStep] = useState<ProductFormStep>(1);
  const [formData, setFormData] = useState<ProductFormData>({
    type: 'product',
    name: '',
    description: '',
    price: undefined,
    currency: 'BRL',
    category: '',
    features: [],
    images: [],
    duration_hours: undefined,
    is_public: true
  });
  const [newFeature, setNewFeature] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (product) {
      setFormData({
        type: product.type,
        name: product.name,
        description: product.description || '',
        price: product.price,
        currency: product.currency,
        category: product.category || '',
        features: product.features,
        images: product.images,
        duration_hours: product.duration_hours,
        is_public: product.is_public
      });
    } else {
      setFormData({
        type: 'product',
        name: '',
        description: '',
        price: undefined,
        currency: 'BRL',
        category: '',
        features: [],
        images: [],
        duration_hours: undefined,
        is_public: true
      });
    }
    setCurrentStep(1);
  }, [product, open]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      
      if (product) {
        await productsService.updateProduct(product.id, formData);
        toast({
          title: "Sucesso",
          description: "Produto atualizado com sucesso"
        });
      } else {
        await productsService.createProduct(formData);
        toast({
          title: "Sucesso",
          description: "Produto criado com sucesso"
        });
      }
      
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar o produto",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setFormData(prev => ({
        ...prev,
        features: [...prev.features, newFeature.trim()]
      }));
      setNewFeature('');
    }
  };

  const removeFeature = (index: number) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep((prev) => (prev + 1) as ProductFormStep);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as ProductFormStep);
    }
  };

  const canProceedToStep2 = () => {
    return formData.type && formData.name.trim();
  };

  const canProceedToStep3 = () => {
    return formData.price !== undefined && formData.price > 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {product ? 'Editar' : 'Adicionar'} {formData.type === 'product' ? 'Produto' : 'Serviço'}
          </DialogTitle>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-between mb-6">
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={`flex items-center ${step < 3 ? 'flex-1' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step <= currentStep
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step}
              </div>
              {step < 3 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    step < currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Tipo e Informações Básicas */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium mb-4 block">Escolha o tipo</Label>
              <div className="grid grid-cols-2 gap-4">
                <Card
                  className={`cursor-pointer border-2 transition-colors ${
                    formData.type === 'product'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setFormData(prev => ({ ...prev, type: 'product' }))}
                >
                  <CardHeader className="text-center">
                    <Package className="mx-auto h-8 w-8 mb-2" />
                    <CardTitle className="text-lg">Produto</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground text-center">
                      Itens físicos ou digitais que você vende
                    </p>
                  </CardContent>
                </Card>
                
                <Card
                  className={`cursor-pointer border-2 transition-colors ${
                    formData.type === 'service'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setFormData(prev => ({ ...prev, type: 'service' }))}
                >
                  <CardHeader className="text-center">
                    <Wrench className="mx-auto h-8 w-8 mb-2" />
                    <CardTitle className="text-lg">Serviço</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground text-center">
                      Serviços que você oferece aos clientes
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Nome do {formData.type === 'product' ? 'Produto' : 'Serviço'}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Digite o nome..."
                />
              </div>

              <div>
                <Label htmlFor="category">Categoria (opcional)</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="Ex: Eletrônicos, Consultoria, Design..."
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descreva seu produto ou serviço..."
                  rows={4}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Preço e Detalhes */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">Preço (R$)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price || ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    price: e.target.value ? parseFloat(e.target.value) : undefined 
                  }))}
                  placeholder="0.00"
                />
              </div>

              {formData.type === 'service' && (
                <div>
                  <Label htmlFor="duration">Duração (horas)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="0"
                    value={formData.duration_hours || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      duration_hours: e.target.value ? parseInt(e.target.value) : undefined 
                    }))}
                    placeholder="Horas necessárias"
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2 block">Características/Benefícios</Label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    placeholder="Digite uma característica..."
                    onKeyPress={(e) => e.key === 'Enter' && addFeature()}
                  />
                  <Button type="button" onClick={addFeature}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.features.map((feature, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {feature}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeFeature(index)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Configurações Finais */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="public">Produto/Serviço Público</Label>
                <p className="text-sm text-muted-foreground">
                  Permitir que clientes vejam este item na sua loja virtual
                </p>
              </div>
              <Switch
                id="public"
                checked={formData.is_public}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked }))}
              />
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-medium mb-2">Resumo</h3>
              <div className="space-y-2 text-sm">
                <p><strong>Tipo:</strong> {formData.type === 'product' ? 'Produto' : 'Serviço'}</p>
                <p><strong>Nome:</strong> {formData.name}</p>
                {formData.category && <p><strong>Categoria:</strong> {formData.category}</p>}
                {formData.price && <p><strong>Preço:</strong> R$ {formData.price.toFixed(2)}</p>}
                {formData.type === 'service' && formData.duration_hours && (
                  <p><strong>Duração:</strong> {formData.duration_hours}h</p>
                )}
                <p><strong>Público:</strong> {formData.is_public ? 'Sim' : 'Não'}</p>
                {formData.features.length > 0 && (
                  <p><strong>Características:</strong> {formData.features.length} itens</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Anterior
          </Button>

          <div className="flex gap-2">
            {currentStep < 3 ? (
              <Button
                onClick={nextStep}
                disabled={
                  (currentStep === 1 && !canProceedToStep2()) ||
                  (currentStep === 2 && !canProceedToStep3())
                }
              >
                Próximo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? 'Salvando...' : (product ? 'Atualizar' : 'Criar')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};