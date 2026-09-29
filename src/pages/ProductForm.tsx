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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Package, Wrench, ArrowLeft, Plus, X, Upload, FileText, Image as ImageIcon, Trash2, ChevronUp, ChevronDown, Images, Layers, Box } from "lucide-react";
import { Product, ProductFormData } from "@/types/products";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";
import { uploadCatalogImageFile, normalizeCatalogMediaUrlForBrowser } from "@/services/catalogMediaUpload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MediaPickerDialog } from "@/components/media/MediaPickerDialog";
import type { MediaLibraryAsset } from "@/services/mediaLibrary";
import { ProductVariantsEditor } from "@/components/products/ProductVariantsEditor";
import { axesFromVariants } from "@/utils/productVariantsForm";
import { SystemRichEditor } from "@/components/editor";

const MAX_PRODUCT_IMAGES = 10;

const ProductForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [enableProducts, setEnableProducts] = useState(true);
  const [enableServices, setEnableServices] = useState(true);
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
    has_variants: false,
    track_inventory: true,
    variants: [],
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
  const productImagesInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [pendingStructure, setPendingStructure] = useState<'simple' | 'variable' | null>(null);

  useEffect(() => {
    if (isEditing && id) {
      loadProduct(id);
    }
  }, [id, isEditing]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await productsService.getStoreProfile();
        if (cancelled) return;
        const allowProducts = profile?.enable_products !== false;
        const allowServices = profile?.enable_services !== false;
        setEnableProducts(allowProducts);
        setEnableServices(allowServices);
        if (!isEditing) {
          setFormData((prev) => {
            if (allowProducts && !allowServices && prev.type !== "product") {
              return { ...prev, type: "product" };
            }
            if (!allowProducts && allowServices && prev.type !== "service") {
              return { ...prev, type: "service" };
            }
            return prev;
          });
        }
      } catch {
        /* defaults: both enabled */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditing]);

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
          variations:
            productData.variations?.length
              ? productData.variations
              : axesFromVariants(productData.variants),
          has_variants: Boolean(productData.has_variants),
          track_inventory: productData.track_inventory !== false,
          variants: productData.variants || [],
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

    const isVariableProduct = formData.type === 'product' && Boolean(formData.has_variants);
    if (isVariableProduct && (!formData.variants || formData.variants.length === 0)) {
      toast({
        title: "Grade incompleta",
        description: "Gere ao menos uma combinação de variantes antes de salvar.",
        variant: "destructive"
      });
      return;
    }
    if (isVariableProduct) {
      const missingPrice = formData.variants!.some(
        (v) => v.is_active !== false && (v.price == null || Number.isNaN(Number(v.price)))
      );
      if (missingPrice) {
        toast({
          title: "Preço das variantes",
          description: "Informe o preço de venda em todas as variantes ativas.",
          variant: "destructive"
        });
        return;
      }
    }
    if (!isVariableProduct && formData.type === 'product' && (formData.price == null || formData.price <= 0)) {
      toast({
        title: "Preço obrigatório",
        description: "Informe o preço de venda do produto.",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      const categoryTrimmed = formData.category?.trim() || undefined;
      const {
        secondary_images: _legacySecondary,
        pricing_mode: _pm,
        variation_prices: _vp,
        ...restForm
      } = formData;
      void _legacySecondary;
      void _pm;
      void _vp;

      const payload: ProductFormData = {
        ...restForm,
        category: categoryTrimmed,
        images: formData.images,
        has_variants: formData.type === 'product' ? Boolean(formData.has_variants) : false,
        track_inventory: formData.track_inventory !== false,
        variations: isVariableProduct ? formData.variations || [] : [],
        variants: isVariableProduct ? formData.variants || [] : [],
        sku: isVariableProduct ? undefined : formData.sku,
      };

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
        description: error instanceof Error ? error.message : "Não foi possível salvar o produto",
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

  const applyStructureMode = (mode: 'simple' | 'variable') => {
    setFormData((prev) => {
      if (mode === 'variable') {
        return {
          ...prev,
          has_variants: true,
          pricing_mode: undefined,
          variation_prices: undefined,
        };
      }
      return {
        ...prev,
        has_variants: false,
        variants: [],
        variations: [],
        pricing_mode: undefined,
        variation_prices: undefined,
      };
    });
    setPendingStructure(null);
  };

  const requestStructureMode = (mode: 'simple' | 'variable') => {
    const currentlyVariable = Boolean(formData.has_variants);
    const nextVariable = mode === 'variable';
    if (currentlyVariable === nextVariable) return;

    if (currentlyVariable && !nextVariable && (formData.variants?.length || 0) > 0) {
      setPendingStructure('simple');
      return;
    }
    if (!currentlyVariable && nextVariable && isEditing) {
      setPendingStructure('variable');
      return;
    }
    applyStructureMode(mode);
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
            {isProduct
              ? (formData.has_variants
                  ? 'Produto variável: eixos Cor/Tamanho, preço e estoque por combinação'
                  : 'Produto simples: preço, estoque e imagens')
              : 'Configure seu serviço com contratos e duração'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Tipo de Produto/Serviço */}
        {enableProducts && enableServices ? (
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
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    type: 'product',
                  }))
                }
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
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    type: 'service',
                    has_variants: false,
                    variants: [],
                    variations: [],
                  }))
                }
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
        ) : (
          <Alert>
            <AlertDescription>
              Esta loja está configurada apenas para{" "}
              {enableProducts ? "produtos" : "serviços"}. Altere em Configurar Loja se precisar dos dois tipos.
            </AlertDescription>
          </Alert>
        )}

        {/* Estrutura: Simples | Variável (PV12) — só produtos */}
        {isProduct && (
          <Card>
            <CardHeader>
              <CardTitle>Estrutura</CardTitle>
              <p className="text-sm text-muted-foreground">
                Produto simples tem um preço e estoque. Produto variável tem grade Cor e/ou Tamanho.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Card
                  className={`cursor-pointer border-2 transition-colors ${
                    !formData.has_variants
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => requestStructureMode('simple')}
                >
                  <CardHeader className="text-center pb-2">
                    <Box className="mx-auto h-8 w-8 mb-2" />
                    <CardTitle className="text-lg">Produto simples</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground text-center">
                      Um SKU, preço e estoque no produto
                    </p>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer border-2 transition-colors ${
                    formData.has_variants
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => requestStructureMode('variable')}
                >
                  <CardHeader className="text-center pb-2">
                    <Layers className="mx-auto h-8 w-8 mb-2" />
                    <CardTitle className="text-lg">Produto variável</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground text-center">
                      Combinações Cor/Tamanho com preço e estoque por variante
                    </p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        )}

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
                placeholder="Resumo breve — aparece ao lado do produto na vitrine"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Texto curto na coluna lateral da página pública.
              </p>
            </div>

            <div>
              <Label htmlFor="description">Descrição Completa</Label>
              <SystemRichEditor
                id="description"
                value={formData.description || ""}
                onChange={(html) => setFormData((prev) => ({ ...prev, description: html }))}
                placeholder="Descreva detalhadamente seu produto ou serviço..."
                className="mt-1 min-h-[160px] rounded-md border"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Exibida abaixo das imagens e do bloco de compra na página pública.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Preços e Estoque */}
        <Card>
          <CardHeader>
            <CardTitle>
              {isProduct && formData.has_variants
                ? 'Custo (opcional)'
                : `Preços ${isProduct ? '& Estoque' : ''}`}
            </CardTitle>
            {isProduct && formData.has_variants && (
              <p className="text-sm text-muted-foreground">
                Preço e estoque ficam em cada variante da grade abaixo. O produto usa o menor preço e a soma dos estoques ativos.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!(isProduct && formData.has_variants) && (
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
                  required={!(isProduct && formData.has_variants)}
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
            )}

            {isProduct && formData.has_variants && (
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
                  placeholder="Custo do produto (referência)"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {isProduct && !formData.has_variants && (
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

            {isProduct && !formData.has_variants && (
              <Separator />
            )}

            {isProduct && !formData.has_variants && (
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

        {isProduct && formData.has_variants && (
          <ProductVariantsEditor
            variations={formData.variations || []}
            variants={formData.variants || []}
            defaultPrice={formData.price}
            onChange={({ variations, variants }) =>
              setFormData((prev) => ({ ...prev, variations, variants }))
            }
          />
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
      <AlertDialog open={pendingStructure === 'simple'} onOpenChange={(open) => !open && setPendingStructure(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Converter para produto simples?</AlertDialogTitle>
            <AlertDialogDescription>
              As variantes da grade serão removidas deste formulário. Ao salvar, elas deixam de existir no produto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyStructureMode('simple')}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingStructure === 'variable'} onOpenChange={(open) => !open && setPendingStructure(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Converter para produto variável?</AlertDialogTitle>
            <AlertDialogDescription>
              Preço e estoque passam a ser definidos por combinação (Cor/Tamanho). Gere a grade antes de salvar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyStructureMode('variable')}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default ProductForm;