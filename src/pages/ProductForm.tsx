import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Wrench, ArrowLeft, Plus, X, Upload, FileText, Image as ImageIcon, Trash2, ChevronUp, ChevronDown, Images } from "lucide-react";
import { Product, ProductFormData, ProductVariation, VariationPrice } from "@/types/products";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";
import { uploadCatalogImageFile, normalizeCatalogMediaUrlForBrowser } from "@/services/catalogMediaUpload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MediaPickerDialog } from "@/components/media/MediaPickerDialog";
import type { MediaLibraryAsset } from "@/services/mediaLibrary";

// Variações predefinidas com cores reais
const COLOR_MAP: Record<string, string> = {
  'Branco': '#FFFFFF',
  'Preto': '#000000',
  'Azul': '#0066CC',
  'Vermelho': '#FF0000',
  'Verde': '#00CC66',
  'Amarelo': '#FFCC00',
  'Rosa': '#FF69B4',
  'Cinza': '#808080',
  'Marrom': '#8B4513',
  'Roxo': '#9933CC',
  'Laranja': '#FF8800',
  'Bege': '#F5F5DC'
};

const PREDEFINED_VARIATIONS = {
  cor: {
    name: 'Cor',
    suggestions: Object.keys(COLOR_MAP)
  },
  tamanho: {
    name: 'Tamanho',
    suggestions: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG']
  },
  peso: {
    name: 'Peso',
    suggestions: ['100g', '250g', '500g', '1kg', '2kg', '5kg', '10kg']
  }
};

const MAX_PRODUCT_IMAGES = 10;

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
    short_description: '',
    description: '',
    price: undefined,
    discount_price: undefined,
    cost: undefined,
    sku: '',
    stock_quantity: 0,
    min_stock_quantity: 0,
    currency: 'BRL',
    category: '',
    features: [],
    images: [],
    secondary_images: [],
    variations: [],
    pricing_mode: 'fixed',
    variation_prices: [],
    duration_hours: undefined,
    responsible_id: undefined,
    contract_template: '',
    has_contract: false,
    is_recurring: false,
    recurrence_interval: undefined,
    is_public: true
  });

  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState('');
  const [variationType, setVariationType] = useState<'cor' | 'tamanho' | 'peso' | 'custom'>('cor');
  const [newVariation, setNewVariation] = useState({ name: '', values: [''] });
  const [customColorName, setCustomColorName] = useState('');
  const [customColorValue, setCustomColorValue] = useState('#000000');
  const productImagesInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  useEffect(() => {
    if (isEditing && id) {
      loadProduct(id);
    }
  }, [id, isEditing]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await productsService.getProducts();
        if (cancelled) return;
        const seen = new Set<string>();
        for (const p of list) {
          const c = p.category?.trim();
          if (c) seen.add(c);
        }
        setCategorySuggestions(Array.from(seen).sort((a, b) => a.localeCompare(b, "pt-BR")));
      } catch {
        /* sugestões são opcionais */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadProduct = async (productId: string) => {
    try {
      setLoading(true);
      const productData = await productsService.getProductById(productId);
      if (productData) {
        setProduct(productData);
        setFormData({
          type: productData.type,
          name: productData.name,
          short_description: productData.short_description || '',
          description: productData.description || '',
          price: productData.price,
          discount_price: productData.discount_price,
          cost: productData.cost,
          sku: productData.sku || '',
          stock_quantity: productData.stock_quantity || 0,
          min_stock_quantity: productData.min_stock_quantity || 0,
          currency: productData.currency,
          category: productData.category || '',
          features: productData.features,
          images: productData.images,
          secondary_images: productData.secondary_images || [],
          variations: productData.variations || [],
          pricing_mode: productData.pricing_mode || 'fixed',
          variation_prices: productData.variation_prices || [],
          duration_hours: productData.duration_hours,
          responsible_id: productData.responsible_id,
          contract_template: productData.contract_template || '',
          has_contract: productData.has_contract || false,
          is_recurring: productData.is_recurring || false,
          recurrence_interval: productData.recurrence_interval,
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
      navigate('/admin/products');
    } finally {
      setLoading(false);
    }
  };

  const handleProductImagesFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingImages(true);
    try {
      const next = [...formData.images];
      for (let i = 0; i < files.length; i++) {
        if (next.length >= MAX_PRODUCT_IMAGES) {
          toast({
            title: "Limite de imagens",
            description: `Máximo ${MAX_PRODUCT_IMAGES} imagens por produto.`,
            variant: "destructive",
          });
          break;
        }
        const url = await uploadCatalogImageFile(files[i], "product");
        next.push(url);
      }
      setFormData((prev) => ({ ...prev, images: next }));
    } catch (e) {
      toast({
        title: "Upload",
        description: e instanceof Error ? e.message : "Falha ao enviar imagens",
        variant: "destructive",
      });
    } finally {
      setUploadingImages(false);
      if (productImagesInputRef.current) productImagesInputRef.current.value = "";
    }
  };

  const removeImageAt = (idx: number) => {
    setFormData((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  };

  /** S33.1 — associa imagem da Media Library sem colar URL. */
  const handlePickLibraryImage = (asset: MediaLibraryAsset) => {
    if (formData.images.length >= MAX_PRODUCT_IMAGES) {
      toast({
        title: "Limite de imagens",
        description: `Máximo ${MAX_PRODUCT_IMAGES} imagens por produto.`,
        variant: "destructive",
      });
      throw new Error(`Máximo ${MAX_PRODUCT_IMAGES} imagens.`);
    }
    const url = asset.relativeUrl;
    setFormData((prev) => ({
      ...prev,
      images: [...prev.images, url],
    }));
    toast({
      title: "Imagem adicionada",
      description: asset.originalFilename || "Selecionada da biblioteca.",
    });
  };

  const productImagePreviewSrc = (url: string) => normalizeCatalogMediaUrlForBrowser(url);

  const moveImage = (idx: number, dir: -1 | 1) => {
    setFormData((prev) => {
      const arr = [...prev.images];
      const j = idx + dir;
      if (j < 0 || j >= arr.length) return prev;
      const t = arr[idx]!;
      arr[idx] = arr[j]!;
      arr[j] = t;
      return { ...prev, images: arr };
    });
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
      const categoryTrimmed = formData.category?.trim() || undefined;
      const { secondary_images: _legacySecondary, ...restForm } = formData;
      void _legacySecondary;
      const payload = { ...restForm, category: categoryTrimmed, images: formData.images };

      if (isEditing && product) {
        await productsService.updateProduct(product.id, payload);
        toast({
          title: "Sucesso",
          description: "Produto atualizado com sucesso"
        });
      } else {
        await productsService.createProduct(payload);
        toast({
          title: "Sucesso",
          description: "Produto criado com sucesso"
        });
      }
      
      navigate('/admin/products');
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
    const variationName = variationType === 'custom' 
      ? newVariation.name.trim() 
      : PREDEFINED_VARIATIONS[variationType].name;
    
    const variationValues = variationType === 'custom'
      ? newVariation.values.filter(v => v.trim()).map(v => v.trim())
      : newVariation.values.filter(v => v.trim()).map(v => v.trim());

    if (variationName && variationValues.length > 0) {
      const variation: ProductVariation = {
        name: variationName,
        values: variationValues
      };
      
      setFormData(prev => ({
        ...prev,
        variations: [...(prev.variations || []), variation]
      }));
      
      // Reset form
      setNewVariation({ name: '', values: [''] });
      setVariationType('cor');
    } else {
      toast({
        title: "Erro",
        description: variationType === 'custom' 
          ? "Preencha o nome e pelo menos um valor para a variação" 
          : "Adicione pelo menos um valor para a variação",
        variant: "destructive"
      });
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
    if (newVariation.values.length > 1) {
      setNewVariation(prev => ({
        ...prev,
        values: prev.values.filter((_, i) => i !== index)
      }));
    }
  };

  const addSuggestedValue = (value: string) => {
    if (!newVariation.values.some(v => v === value)) {
      setNewVariation(prev => ({
        ...prev,
        values: [...prev.values.filter(v => v.trim()), value, '']
      }));
    }
  };

  const addCustomColor = () => {
    if (customColorName.trim()) {
      const colorWithHex = `${customColorName.trim()}|${customColorValue}`;
      if (!newVariation.values.some(v => v.startsWith(customColorName.trim()))) {
        setNewVariation(prev => ({
          ...prev,
          values: [...prev.values.filter(v => v.trim()), colorWithHex, '']
        }));
        setCustomColorName('');
        setCustomColorValue('#000000');
      }
    }
  };

  const getColorFromValue = (value: string): string | null => {
    // Se o valor contém |, é uma cor personalizada
    if (value.includes('|')) {
      return value.split('|')[1];
    }
    // Se não, procura no mapa de cores
    return COLOR_MAP[value] || null;
  };

  const getColorName = (value: string): string => {
    if (value.includes('|')) {
      return value.split('|')[0];
    }
    return value;
  };

  const handleVariationTypeChange = (type: 'cor' | 'tamanho' | 'peso' | 'custom') => {
    setVariationType(type);
    if (type !== 'custom') {
      setNewVariation({ name: PREDEFINED_VARIATIONS[type].name, values: [''] });
    } else {
      setNewVariation({ name: '', values: [''] });
    }
  };

  // Função para gerar todas as combinações de variações
  const generateVariationCombinations = (): string[] => {
    if (!formData.variations || formData.variations.length === 0) {
      return [];
    }

    let combinations: string[] = [''];
    
    for (const variation of formData.variations) {
      const newCombinations: string[] = [];
      for (const combination of combinations) {
        for (const value of variation.values) {
          const displayValue = getColorName(value);
          newCombinations.push(
            combination ? `${combination}-${displayValue}` : displayValue
          );
        }
      }
      combinations = newCombinations;
    }
    
    return combinations;
  };

  // Atualizar preço de uma combinação
  const updateVariationPrice = (combination: string, price: number | undefined) => {
    setFormData(prev => {
      const existingPrices = prev.variation_prices || [];
      const existingIndex = existingPrices.findIndex(vp => vp.combination === combination);
      
      let newPrices;
      if (existingIndex >= 0) {
        newPrices = [...existingPrices];
        newPrices[existingIndex] = { combination, price };
      } else {
        newPrices = [...existingPrices, { combination, price }];
      }
      
      return {
        ...prev,
        variation_prices: newPrices
      };
    });
  };

  // Obter preço de uma combinação
  const getVariationPrice = (combination: string): number | undefined => {
    const priceObj = formData.variation_prices?.find(vp => vp.combination === combination);
    return priceObj?.price;
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
        <Button variant="ghost" onClick={() => navigate('/admin/products')}>
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
                  list="product-category-suggestions"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="Ex: Eletrônicos, Consultoria..."
                  autoComplete="off"
                />
                <datalist id="product-category-suggestions">
                  {categorySuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <Label htmlFor="short_description">Descrição Curta</Label>
              <Input
                id="short_description"
                value={formData.short_description}
                onChange={(e) => setFormData(prev => ({ ...prev, short_description: e.target.value }))}
                placeholder="Resumo breve do produto/serviço"
              />
            </div>

            <div>
              <Label htmlFor="description">Descrição Completa</Label>
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

        {/* Preços e Estoque */}
        <Card>
          <CardHeader>
            <CardTitle>Preços {isProduct && '& Estoque'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">Preço de Venda (R$) *</Label>
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
                  <Label htmlFor="cost">Custo (R$)</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      cost: e.target.value ? parseFloat(e.target.value) : undefined 
                    }))}
                    placeholder="Custo do produto"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {isProduct && (
                <>
                  <div>
                    <Label htmlFor="discount_price">Preço Promocional (R$)</Label>
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
                      placeholder="Preço com desconto"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                      placeholder="Código único do produto"
                    />
                  </div>
                </>
              )}
              
              {isService && (
                <>
                  <div>
                    <Label htmlFor="duration">Duração Estimada (horas)</Label>
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

                  <Separator />

                  {/* Recorrência */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Tipo de Serviço</Label>
                        <p className="text-sm text-muted-foreground">
                          Defina se o serviço é avulso ou recorrente
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {formData.is_recurring ? 'Recorrente' : 'Avulso'}
                        </span>
                        <Switch
                          checked={formData.is_recurring}
                          onCheckedChange={(checked) => {
                            setFormData(prev => ({
                              ...prev,
                              is_recurring: checked,
                              recurrence_interval: checked ? 'monthly' : undefined
                            }));
                          }}
                        />
                      </div>
                    </div>

                    {formData.is_recurring && (
                      <div>
                        <Label htmlFor="recurrence_interval">Intervalo de Recorrência</Label>
                        <Select
                          value={formData.recurrence_interval}
                          onValueChange={(value: 'daily' | 'weekly' | 'monthly' | 'yearly') => 
                            setFormData(prev => ({ ...prev, recurrence_interval: value }))
                          }
                        >
                          <SelectTrigger id="recurrence_interval">
                            <SelectValue placeholder="Selecione o intervalo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Diário</SelectItem>
                            <SelectItem value="weekly">Semanal</SelectItem>
                            <SelectItem value="monthly">Mensal</SelectItem>
                            <SelectItem value="yearly">Anual</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formData.recurrence_interval === 'daily' && 'O serviço será cobrado diariamente'}
                          {formData.recurrence_interval === 'weekly' && 'O serviço será cobrado semanalmente'}
                          {formData.recurrence_interval === 'monthly' && 'O serviço será cobrado mensalmente'}
                          {formData.recurrence_interval === 'yearly' && 'O serviço será cobrado anualmente'}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {isProduct && (
              <Separator />
            )}

            {isProduct && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="stock_quantity">Quantidade em Estoque</Label>
                  <Input
                    id="stock_quantity"
                    type="number"
                    min="0"
                    value={formData.stock_quantity || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      stock_quantity: e.target.value ? parseInt(e.target.value) : 0 
                    }))}
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <Label htmlFor="min_stock_quantity">Estoque Mínimo</Label>
                  <Input
                    id="min_stock_quantity"
                    type="number"
                    min="0"
                    value={formData.min_stock_quantity || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      min_stock_quantity: e.target.value ? parseInt(e.target.value) : 0 
                    }))}
                    placeholder="Alertar quando atingir"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Imagens */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Imagens da galeria
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              A primeira imagem da lista é a principal na vitrine. JPG, PNG, WebP ou GIF até 5 MB cada.
              Pode carregar ficheiros novos ou escolher da biblioteca de mídias (sem colar URL).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {isProduct && (formData.secondary_images?.length ?? 0) > 0 ? (
              <Alert>
                <AlertDescription>
                  Este produto possui imagens no formato legado (secundárias). Elas continuam visíveis na
                  loja após o cadastro. Novas fotos devem ser adicionadas apenas nesta galeria.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={productImagesInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => handleProductImagesFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingImages || formData.images.length >= MAX_PRODUCT_IMAGES}
                onClick={() => productImagesInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadingImages ? "Enviando…" : "Adicionar imagens"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={uploadingImages || formData.images.length >= MAX_PRODUCT_IMAGES}
                onClick={() => setMediaPickerOpen(true)}
              >
                <Images className="h-4 w-4 mr-2" />
                Biblioteca de mídias
              </Button>
              <span className="text-xs text-muted-foreground">
                {formData.images.length}/{MAX_PRODUCT_IMAGES}
              </span>
            </div>
            {formData.images.length > 0 ? (
              <ul className="space-y-2">
                {formData.images.map((url, idx) => (
                  <li
                    key={`${url}-${idx}`}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                  >
                    <img
                      src={productImagePreviewSrc(url)}
                      alt=""
                      className="h-16 w-16 object-cover rounded"
                    />
                    <div className="flex-1 min-w-[120px]">
                      {idx === 0 ? (
                        <Badge>Principal</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Imagem {idx + 1}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={idx === 0}
                        onClick={() => moveImage(idx, -1)}
                        title="Mover para cima"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={idx === formData.images.length - 1}
                        onClick={() => moveImage(idx, 1)}
                        title="Mover para baixo"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeImageAt(idx)}
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma imagem ainda.</p>
            )}
          </CardContent>
        </Card>

        <MediaPickerDialog
          open={mediaPickerOpen}
          onOpenChange={setMediaPickerOpen}
          title="Imagem do produto"
          description="Escolha uma imagem da Media Library ou carregue uma nova. Sem colar URL."
          accept="image"
          confirmLabel="Adicionar à galeria"
          onSelect={handlePickLibraryImage}
        />

        {/* Variações - Apenas para Produtos */}
        {isProduct && (
          <Card>
            <CardHeader>
              <CardTitle>Variações do Produto</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure cores, tamanhos, peso ou outras variações do seu produto
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <Label>Tipo de Variação</Label>
                  <Select value={variationType} onValueChange={(value: any) => handleVariationTypeChange(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo de variação" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cor">Cor</SelectItem>
                      <SelectItem value="tamanho">Tamanho</SelectItem>
                      <SelectItem value="peso">Peso</SelectItem>
                      <SelectItem value="custom">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {variationType === 'custom' && (
                  <div>
                    <Label>Nome da Variação</Label>
                    <Input
                      value={newVariation.name}
                      onChange={(e) => setNewVariation(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Material, Estilo, Acabamento..."
                    />
                  </div>
                )}
                
                <div>
                  <Label>Valores</Label>
                  
                  {variationType !== 'custom' && (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground mb-2">Sugestões rápidas:</p>
                      <div className="flex flex-wrap gap-2">
                        {PREDEFINED_VARIATIONS[variationType].suggestions.map((suggestion) => (
                          <Badge
                            key={suggestion}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                            onClick={() => addSuggestedValue(suggestion)}
                          >
                            {variationType === 'cor' && COLOR_MAP[suggestion] && (
                              <span
                                className="inline-block w-4 h-4 rounded mr-1.5 border border-border"
                                style={{ backgroundColor: COLOR_MAP[suggestion] }}
                              />
                            )}
                            <Plus className="h-3 w-3 mr-1" />
                            {suggestion}
                          </Badge>
                        ))}
                      </div>
                      
                      {variationType === 'cor' && (
                        <div className="mt-3 p-3 border rounded-lg bg-muted/50">
                          <p className="text-xs font-medium mb-2">Cor Personalizada:</p>
                          <div className="flex gap-2 mb-2">
                            <Input
                              value={customColorName}
                              onChange={(e) => setCustomColorName(e.target.value)}
                              placeholder="Nome da cor"
                              className="flex-1"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={customColorValue}
                                onChange={(e) => setCustomColorValue(e.target.value)}
                                className="w-10 h-10 rounded border border-input cursor-pointer"
                              />
                              <Button
                                type="button"
                                size="sm"
                                onClick={addCustomColor}
                                disabled={!customColorName.trim()}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="mt-2">
                            <Label className="text-xs">Ou adicione uma textura (foto):</Label>
                            <div className="mt-1 border-2 border-dashed border-border rounded-lg p-3 text-center hover:bg-muted/50 transition-colors cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id="texture-upload"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    // TODO: Implementar upload real
                                    toast({
                                      title: "Em breve",
                                      description: "Upload de texturas será implementado em breve"
                                    });
                                  }
                                }}
                              />
                              <label htmlFor="texture-upload" className="cursor-pointer">
                                <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-1" />
                                <p className="text-xs text-muted-foreground">
                                  Clique para adicionar textura
                                </p>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    {newVariation.values.map((value, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="relative flex-1">
                          {variationType === 'cor' && getColorFromValue(value) && (
                            <span
                              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded border border-border"
                              style={{ backgroundColor: getColorFromValue(value)! }}
                            />
                          )}
                          <Input
                            value={getColorName(value)}
                            onChange={(e) => updateVariationValue(index, e.target.value)}
                            placeholder={variationType === 'custom' ? "Digite um valor..." : `Ex: ${PREDEFINED_VARIATIONS[variationType]?.suggestions[0] || 'Valor'}`}
                            className={variationType === 'cor' && getColorFromValue(value) ? 'pl-11' : ''}
                          />
                        </div>
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
                
                <Button type="button" onClick={addVariation} className="w-full">
                  Adicionar Variação
                </Button>
              </div>

              {formData.variations && formData.variations.length > 0 && (
                <>
                  <div className="space-y-2">
                    <Label>Variações Cadastradas</Label>
                    {formData.variations.map((variation, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <span className="font-medium">{variation.name}:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {variation.values.map((value, vIndex) => (
                              <Badge key={vIndex} variant="secondary" className="flex items-center gap-1.5">
                                {variation.name === 'Cor' && getColorFromValue(value) && (
                                  <span
                                    className="inline-block w-3 h-3 rounded border border-border"
                                    style={{ backgroundColor: getColorFromValue(value)! }}
                                  />
                                )}
                                {getColorName(value)}
                              </Badge>
                            ))}
                          </div>
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

                  <Separator className="my-4" />

                  {/* Precificação por Variação */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Modo de Precificação</Label>
                        <p className="text-sm text-muted-foreground">
                          Defina um preço fixo ou personalize por variação
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {formData.pricing_mode === 'fixed' ? 'Preço Fixo' : 'Preço por Variação'}
                        </span>
                        <Switch
                          checked={formData.pricing_mode === 'per_variation'}
                          onCheckedChange={(checked) => {
                            setFormData(prev => ({
                              ...prev,
                              pricing_mode: checked ? 'per_variation' : 'fixed'
                            }));
                          }}
                        />
                      </div>
                    </div>

                    {formData.pricing_mode === 'per_variation' && (
                      <div className="space-y-3 mt-4">
                        <Label>Preços por Variação</Label>
                        <div className="grid gap-2">
                          {generateVariationCombinations().map((combination, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {formData.variations?.map((variation, vIdx) => {
                                    const parts = combination.split('-');
                                    const value = parts[vIdx];
                                    if (!value) return null;
                                    
                                    // Encontrar o valor original (com hex) para cores
                                    const originalValue = variation.values.find(v => 
                                      getColorName(v) === value
                                    );
                                    
                                    return (
                                      <React.Fragment key={vIdx}>
                                        {vIdx > 0 && <span className="text-muted-foreground">×</span>}
                                        <Badge variant="outline" className="flex items-center gap-1.5">
                                          {variation.name === 'Cor' && originalValue && getColorFromValue(originalValue) && (
                                            <span
                                              className="inline-block w-3 h-3 rounded border border-border"
                                              style={{ backgroundColor: getColorFromValue(originalValue)! }}
                                            />
                                          )}
                                          {value}
                                        </Badge>
                                      </React.Fragment>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-sm text-muted-foreground whitespace-nowrap">R$</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={getVariationPrice(combination) || ''}
                                  onChange={(e) => updateVariationPrice(
                                    combination, 
                                    e.target.value ? parseFloat(e.target.value) : undefined
                                  )}
                                  placeholder="0,00"
                                  className="w-32"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
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
          <Button type="button" variant="outline" onClick={() => navigate('/admin/products')}>
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