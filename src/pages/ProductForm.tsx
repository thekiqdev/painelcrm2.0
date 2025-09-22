import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Package, Wrench, ArrowLeft, Plus, X, Upload, FileText, Image as ImageIcon } from "lucide-react";
import { Product, ProductFormData, ProductVariation } from "@/types/products";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";

const ProductForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState<ProductFormData>({
    type: 'product',
    name: '',
    description: '',
    price: undefined,
    discount_price: undefined,
    currency: 'BRL',
    category: '',
    features: [],
    images: [],
    secondary_images: [],
    variations: [],
    duration_hours: undefined,
    contract_template: '',
    has_contract: false,
    is_public: true
  });

  const [newFeature, setNewFeature] = useState('');
  const [newVariation, setNewVariation] = useState({ name: '', values: [''] });

  useEffect(() => {
    if (isEditing && id) {
      loadProduct(id);
    }
  }, [id, isEditing]);

  const loadProduct = async (productId: string) => {
    try {
      setLoading(true);
      const productData = await productsService.getProductById(productId);
      if (productData) {
        setProduct(productData);
        setFormData({
          type: productData.type,
          name: productData.name,
          description: productData.description || '',
          price: productData.price,
          discount_price: productData.discount_price,
          currency: productData.currency,
          category: productData.category || '',
          features: productData.features,
          images: productData.images,
          secondary_images: productData.secondary_images || [],
          variations: productData.variations || [],
          duration_hours: productData.duration_hours,
          contract_template: productData.contract_template || '',
          has_contract: productData.has_contract || false,
          is_public: productData.is_public
        });
      }
    } catch (error) {
      console.error('Erro ao carregar produto:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar o produto",
        variant: "destructive"
      });
      navigate('/products');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "Nome é obrigatório",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      
      if (isEditing && product) {
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
      
      navigate('/products');
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

  const addVariation = () => {
    if (newVariation.name.trim() && newVariation.values.some(v => v.trim())) {
      const variation: ProductVariation = {
        name: newVariation.name.trim(),
        values: newVariation.values.filter(v => v.trim()).map(v => v.trim())
      };
      
      setFormData(prev => ({
        ...prev,
        variations: [...(prev.variations || []), variation]
      }));
      
      setNewVariation({ name: '', values: [''] });
    }
  };

  const removeVariation = (index: number) => {
    setFormData(prev => ({
      ...prev,
      variations: prev.variations?.filter((_, i) => i !== index) || []
    }));
  };

  const addVariationValue = () => {
    setNewVariation(prev => ({
      ...prev,
      values: [...prev.values, '']
    }));
  };

  const updateVariationValue = (index: number, value: string) => {
    setNewVariation(prev => ({
      ...prev,
      values: prev.values.map((v, i) => i === index ? value : v)
    }));
  };

  const removeVariationValue = (index: number) => {
    setNewVariation(prev => ({
      ...prev,
      values: prev.values.filter((_, i) => i !== index)
    }));
  };

  if (loading && isEditing) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-32">
          Carregando produto...
        </div>
      </div>
    );
  }

  const isProduct = formData.type === 'product';
  const isService = formData.type === 'service';

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => navigate('/products')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {isEditing ? 'Editar' : 'Novo'} {isProduct ? 'Produto' : 'Serviço'}
          </h1>
          <p className="text-muted-foreground">
            {isProduct ? 'Configure seu produto com imagens, variações e preços' : 'Configure seu serviço com contratos e duração'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Tipo de Produto/Serviço */}
        <Card>
          <CardHeader>
            <CardTitle>Tipo</CardTitle>
          </CardHeader>
          <CardContent>
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
                    Itens físicos ou digitais com variações e imagens
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
                    Serviços com contratos e duração personalizada
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Informações Básicas */}
        <Card>
          <CardHeader>
            <CardTitle>Informações Básicas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Digite o nome..."
                  required
                />
              </div>
              <div>
                <Label htmlFor="category">Categoria</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="Ex: Eletrônicos, Consultoria..."
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descreva detalhadamente seu produto ou serviço..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Preços */}
        <Card>
          <CardHeader>
            <CardTitle>Preços</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">Preço (R$) *</Label>
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
                  required
                />
              </div>
              
              {isProduct && (
                <div>
                  <Label htmlFor="discount_price">Preço com Desconto (R$)</Label>
                  <Input
                    id="discount_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.discount_price || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      discount_price: e.target.value ? parseFloat(e.target.value) : undefined 
                    }))}
                    placeholder="Preço promocional"
                  />
                </div>
              )}

              {isService && (
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
          </CardContent>
        </Card>

        {/* Imagens */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Imagens
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Imagens Principais</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">Arraste e solte suas imagens aqui</p>
                <Button type="button" variant="outline" size="sm">
                  Escolher Arquivos
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Recomendado: JPG, PNG até 5MB cada. A primeira imagem será a principal.
              </p>
            </div>

            {isProduct && (
              <div>
                <Label>Imagens Secundárias</Label>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">Imagens adicionais do produto</p>
                  <Button type="button" variant="outline" size="sm">
                    Adicionar Imagens
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Variações - Apenas para Produtos */}
        {isProduct && (
          <Card>
            <CardHeader>
              <CardTitle>Variações do Produto</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure cores, tamanhos ou outras variações do seu produto
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome da Variação</Label>
                    <Input
                      value={newVariation.name}
                      onChange={(e) => setNewVariation(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Cor, Tamanho, Material..."
                    />
                  </div>
                </div>
                
                <div>
                  <Label>Valores</Label>
                  <div className="space-y-2">
                    {newVariation.values.map((value, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={value}
                          onChange={(e) => updateVariationValue(index, e.target.value)}
                          placeholder="Ex: Azul, P, Algodão..."
                        />
                        {newVariation.values.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeVariationValue(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addVariationValue}
                    className="mt-2"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Valor
                  </Button>
                </div>
                
                <Button type="button" onClick={addVariation}>
                  Adicionar Variação
                </Button>
              </div>

              {formData.variations && formData.variations.length > 0 && (
                <div className="space-y-2">
                  <Label>Variações Cadastradas</Label>
                  {formData.variations.map((variation, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <span className="font-medium">{variation.name}:</span>
                        <span className="ml-2 text-muted-foreground">
                          {variation.values.join(', ')}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeVariation(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Contrato - Apenas para Serviços */}
        {isService && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contrato do Serviço
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Vincular Contrato</Label>
                  <p className="text-sm text-muted-foreground">
                    Gerar contrato automaticamente quando o cliente contratar
                  </p>
                </div>
                <Switch
                  checked={formData.has_contract}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, has_contract: checked }))}
                />
              </div>

              {formData.has_contract && (
                <div>
                  <Label htmlFor="contract_template">Template do Contrato</Label>
                  <Textarea
                    id="contract_template"
                    value={formData.contract_template}
                    onChange={(e) => setFormData(prev => ({ ...prev, contract_template: e.target.value }))}
                    placeholder="Digite o template do contrato que será gerado automaticamente..."
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Use variáveis como {'{'}nome_cliente{'}'}, {'{'}data_contrato{'}'}, {'{'}valor_servico{'}'} para personalizar o contrato.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Características */}
        <Card>
          <CardHeader>
            <CardTitle>Características e Benefícios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                placeholder="Digite uma característica ou benefício..."
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
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
          </CardContent>
        </Card>

        {/* Configurações Finais */}
        <Card>
          <CardHeader>
            <CardTitle>Configurações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label>Produto/Serviço Público</Label>
                <p className="text-sm text-muted-foreground">
                  Permitir que clientes vejam este item na sua loja virtual
                </p>
              </div>
              <Switch
                checked={formData.is_public}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Botões de Ação */}
        <div className="flex justify-end gap-4 pt-6">
          <Button type="button" variant="outline" onClick={() => navigate('/products')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Salvando...' : (isEditing ? 'Atualizar' : 'Criar')} {isProduct ? 'Produto' : 'Serviço'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;